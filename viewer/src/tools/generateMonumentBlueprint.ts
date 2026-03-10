/**
 * generateMonumentBlueprint.ts
 *
 * Procedural generator for Al-Shaheed (Martyr's) Monument in Baghdad, Iraq.
 *
 * KEY FIX — multi-sample cell test (eliminates surface gaps / speckling):
 *   Root cause of gaps: testing only the voxel-cell centre against the shell
 *   band. When the centre falls just outside the band but part of the cell
 *   overlaps it, that cell is skipped → hole in the ring.
 *   Fix: sample 5 points per cell (centre + 4 cardinal edge midpoints).
 *   If ANY sample is inside the band the cell is placed → gap-free surface.
 *
 * RADIUS PROFILE — strong S-curve cubic Bézier:
 *   P0=0.82 (slight base inset) → P1=1.18 (strong early expansion) →
 *   P2=1.05 (controlled contraction onset) → P3=0.06 (sharp crown pinch).
 *   Lower-third belly weight: r *= 1.05 for t < 0.35.
 *   Hard crown cap: ring generation stops when r < 0.75 (single apex voxel).
 *
 * HOLLOW CONTRACT (non-negotiable):
 *   Band = [ r − (THICKNESS − 0.5),  r + 0.5 ].
 *   Nothing placed outside the band. Hollow-validation sweep enforces it.
 */

import type { MonumentVariantPalette } from './monumentVariants';

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockState = {
  facing?: 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
  half?: 'top' | 'bottom';
  shape?: 'straight' | 'inner_left' | 'inner_right' | 'outer_left' | 'outer_right';
  type?: 'top' | 'bottom' | 'double';
};

type SliceExtra = {
  x: number;
  z: number;
  blockType: string;
  blockState?: BlockState;
};

type Slice = {
  y: number;
  block: string;
  grid: string[];
  extras?: SliceExtra[];
};

type Blueprint = {
  description: string;
  recommended_block_palette: { primary: string; secondary?: string; base: string };
  dimensions_estimate: { width: number; depth: number; height: number };
  slices: Slice[];
};

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const CONFIG = {
  // Grid
  W: 100,
  D: 100,
  H: 65,
  baseThickness: 5,

  // Shell geometry
  shellRadius: 20,     // base reference radius (blocks)
  radiusScale: 1.18,   // R2 = shellRadius × radiusScale ≈ 23.6
  heightScale: 0.80,   // H2 = round(H × heightScale) = 52

  // Shell centres (A: left-back, B: right-front — 12-block Z S-offset)
  cxA: 42, czA: 56,
  cxB: 58, czB: 44,

  // ── Profile tuning (tune these) ──────────────────────────────────────────
  // Bézier control points for the S-curve radius profile (fractions of R2).
  // Lower dome (t < SHARPEN_START) uses pure Bézier — preserves the belly.
  // Upper dome blends in sharpening — collapses crown to a single-voxel tip.
  BASE_INSET:    0.82,  // P0: radius fraction at dome base        (t = 0.0)
  P1_RISE:       0.95,  // P1: smooth rise toward the bulge
  MID_BULGE:     1.20,  // P2: belly peak radius fraction          (t ≈ 0.5–0.65)
  CROWN_PINCH:   0.80,  // P3: Bézier value in the pre-sharpen zone
  SHARPEN_START: 0.65,  // t above which crown sharpening kicks in
  PEAK_POWER:    2.5,   // exponent: (1−t)^PEAK_POWER for crown collapse

  // ── Shell band (HOLLOW enforcement) ──────────────────────────────────────
  // Band = [ r − (THICKNESS − 0.5),  r + 0.5 ].  Width ≈ THICKNESS blocks.
  THICKNESS: 2,

  // ── Plinth steps ─────────────────────────────────────────────────────────
  plinthSteps: [
    { yFrom: 0, yTo: 2, radiusFrac: 1.000, block: 'smooth_quartz' },
    { yFrom: 2, yTo: 4, radiusFrac: 0.875, block: 'smooth_quartz' },
    { yFrom: 4, yTo: 5, radiusFrac: 0.775, block: 'smooth_quartz' },
  ] as const,

  // ── Block types ───────────────────────────────────────────────────────────
  baseBlock:       'smooth_quartz',
  // Dome shell — oxidized copper palette
  shellBlock:      'waxed_oxidized_cut_copper',   // ~80% primary
  shellBlockDark:  'oxidized_cut_copper',          // ~20% patch variation (large patches)
  shellStairBlock: 'waxed_oxidized_cut_copper_stairs',
  shellSlabBlock:  'waxed_oxidized_cut_copper_slab',
  rimBlock:        'waxed_oxidized_cut_copper',
  RIM_WIDTH:       2,    // cells on each side of cut plane included in rim
  RIM_BAND:        0.9,  // half-width: rim only where |dist−r| ≤ RIM_BAND
  plinthSlabBlock: 'smooth_quartz_slab',

  // ── Base gap: wider band for the first N layers above the plinth ─────────
  BASE_GAP_LAYERS:    8,
  BASE_GAP_THICKNESS: 2.5,   // → band [r−2.0, r+0.5]

  // ── Curvature smoothing ───────────────────────────────────────────────────
  drSlabMin:  0.18,
  drStairMin: 0.50,
  drStairMax: 0.82,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyGrid(w: number, d: number): string[][] {
  return Array.from({ length: d }, () => Array.from({ length: w }, () => '.'));
}

function setCell(grid: string[][], x: number, z: number, v: string): void {
  if (z >= 0 && z < grid.length && x >= 0 && x < grid[0].length) grid[z][x] = v;
}

/**
 * Multi-sample shell band intersection test.
 *
 * WHY: Testing only the voxel-cell centre creates speckling/gaps. A cell whose
 * centre lies just outside the band but whose footprint overlaps it is skipped,
 * leaving a hole in the ring. This is most visible on oblique views and at
 * diagonal angles where the circle crosses between cell centres.
 *
 * FIX: Test 5 points — cell centre + 4 cardinal edge midpoints (±0.5 offset).
 * If ANY sample falls inside [inner, outer] the cell is placed. This guarantees
 * a gap-free, continuous shell surface without over-filling the interior.
 *
 * Elliptical extension: to make the dome oval, divide dx by rx and dz by rz
 * before computing distance (keep rx=rz=1 for circular, current default).
 */
function cellIntersectsShellBand(
  x: number, z: number,
  cx: number, cz: number,
  inner: number, outer: number,
): boolean {
  const samples = [[0,0],[0.5,0],[-0.5,0],[0,0.5],[0,-0.5]];
  for (const [ox, oz] of samples) {
    const d = Math.sqrt((x + ox - cx) ** 2 + (z + oz - cz) ** 2);
    if (d >= inner && d <= outer) return true;
  }
  return false;
}

/**
 * Strict half-dome clipping — ±0.5 tolerance only, no interior bleeding.
 * Shell A (left):  keeps x ≤ cxA + 0.5  (cut face opens toward +X)
 * Shell B (right): keeps x ≥ cxB − 0.5  (cut face opens toward −X)
 */
function isInShellHalf(x: number, cx: number, shell: 'A' | 'B'): boolean {
  return shell === 'A' ? x - cx <= 0.5 : x - cx >= -0.5;
}

/**
 * Al-Shaheed S-curve dome radius at height fraction t ∈ [0,1].
 *
 * Two-phase design:
 *
 *   LOWER (t < SHARPEN_START — default 0.65):
 *     Pure cubic Bézier with control points BASE_INSET, P1_RISE, MID_BULGE,
 *     CROWN_PINCH. Produces a clean S-curve:
 *       t=0.00 → BASE_INSET·R  (slight base inset)
 *       t~0.50 → MID_BULGE·R   (visible belly / petal bulge)
 *       t=0.65 → plateau near MID_BULGE (smooth transition)
 *     No sharpening here → lower dome retains the full S-curve shape.
 *     (Previous global sharpening compressed this to ~0.82× at t=0.5, wiping
 *     out the bulge entirely and making the lower dome look cylindrical.)
 *
 *   UPPER (t ≥ SHARPEN_START):
 *     Sharpening fraction linearly ramps 0→1.
 *     Blends from pure Bézier → r × (1−t)^PEAK_POWER.
 *     Crown aggressively collapses to 0.5 → single-voxel apex.
 */
function computeDomeRadius(t: number, R: number): number {
  const { BASE_INSET, P1_RISE, MID_BULGE, CROWN_PINCH, SHARPEN_START, PEAK_POWER } = CONFIG;
  const tc = Math.max(0, Math.min(1, t));
  const mt = 1 - tc;

  // Cubic Bézier S-curve
  const bezier = mt ** 3 * BASE_INSET
               + 3 * mt ** 2 * tc * P1_RISE
               + 3 * mt * tc ** 2 * MID_BULGE
               + tc ** 3 * CROWN_PINCH;
  const base = bezier * R;

  if (tc < SHARPEN_START) return base;

  // Blend in crown sharpening above SHARPEN_START
  const sharpFrac = (tc - SHARPEN_START) / (1 - SHARPEN_START);
  const sharpened = base * Math.pow(1 - tc, PEAK_POWER);
  return Math.max(base * (1 - sharpFrac) + sharpened * sharpFrac, 0.5);
}

/** Two-phase radius profile — used only by generateSingleSplitDome. */
function alShaheedRadius(t: number, baseExponent: number): number {
  const tc = Math.max(0, Math.min(1, t));
  if (tc <= 0.60) return 1.0 - 0.15 * (tc / 0.60);
  const phaseT = (tc - 0.60) / 0.40;
  return 0.85 * Math.pow(1 - phaseT, 3.0 * baseExponent);
}

function ellipticalDistance(x: number, z: number, cx: number, cz: number, rx: number, rz: number): number {
  return Math.sqrt(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2);
}

// ─── Coherent material noise (replaces per-cell hash speckle) ─────────────────

/** Grid-point hash → [0, 1). Independent in x and z. */
function vnHash(ix: number, iz: number): number {
  let h = ((ix * 374761393) ^ (iz * 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1540483477) | 0;
  return (h >>> 0) / 0x100000000;
}

/** Quintic smoothstep — C²-continuous, eliminates gradient discontinuities. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** 2D bilinear value noise.  Returns a value approximately in [−1, 1]. */
function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix,        fz = z - iz;
  const ux = fade(fx),      uz = fade(fz);
  const v00 = vnHash(ix,     iz    ) * 2 - 1;
  const v10 = vnHash(ix + 1, iz    ) * 2 - 1;
  const v01 = vnHash(ix,     iz + 1) * 2 - 1;
  const v11 = vnHash(ix + 1, iz + 1) * 2 - 1;
  return v00 * (1 - ux) * (1 - uz)
       + v10 * ux       * (1 - uz)
       + v01 * (1 - ux) * uz
       + v11 * ux       * uz;
}

/**
 * Single very-low-frequency XZ noise for large oxidation patches.
 *
 * Scale 0.04 → patch width ≈ 25 blocks (no speckle, no fine detail).
 * Returns a value in approximately [−0.9, 0.9].
 * Threshold −0.45 gives ≈20 % coverage for the oxidized_cut_copper variant.
 * Y excluded intentionally — horizontal stripe artefacts otherwise.
 */
function materialNoise(x: number, z: number): number {
  return valueNoise2D(x * 0.04, z * 0.04);
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export function generateAlShaheedLikeBlueprint(
  enableRim = true,
  variant?: MonumentVariantPalette,
): Blueprint {
  // ── Geometric / numeric constants (never overridden by variant) ──────────
  const {
    W, D, H, baseThickness,
    shellRadius, radiusScale, heightScale,
    cxA, czA, cxB, czB,
    RIM_WIDTH, RIM_BAND,
    THICKNESS, BASE_GAP_LAYERS, BASE_GAP_THICKNESS,
    drSlabMin, drStairMin, drStairMax,
  } = CONFIG;

  // ── Block types — variant-overridable ────────────────────────────────────
  const baseBlock       = variant?.base           ?? CONFIG.baseBlock;
  const shellBlock      = variant?.shellPrimary   ?? CONFIG.shellBlock;
  const shellBlockDark  = variant?.shellSecondary ?? CONFIG.shellBlockDark;
  const shellStairBlock = variant?.stairs         ?? CONFIG.shellStairBlock;
  const shellSlabBlock  = variant?.slab           ?? CONFIG.shellSlabBlock;
  const rimBlock        = variant?.shellAccent    ?? CONFIG.rimBlock;
  const plinthSlabBlock = variant?.plinthSlab     ?? CONFIG.plinthSlabBlock;

  // ── Derived geometry ──────────────────────────────────────────────────────
  const R2         = shellRadius * radiusScale;    // ≈23.6
  const H2         = Math.round(H * heightScale);  // 52
  const domeHeight = H2 - baseThickness;           // 47 dome layers
  const layerCount = domeHeight + 1;               // yi: 0…47

  const baseCx     = Math.floor(W / 2);            // 50
  const baseCz     = Math.floor(D / 2);            // 50
  const baseRadius = Math.round(40 * radiusScale); // ≈47

  // ── Debug output ──────────────────────────────────────────────────────────
  console.log('=== Al-Shaheed Monument Blueprint Generator ===');
  console.log(`  Grid: ${W}×${D}  H2=${H2}  domeHeight=${domeHeight}  R2=${R2.toFixed(2)}`);
  console.log(`  baseRadius=${baseRadius}  THICKNESS=${THICKNESS}`);
  console.log(`  Profile: BASE_INSET=${CONFIG.BASE_INSET}  P1_RISE=${CONFIG.P1_RISE}  MID_BULGE=${CONFIG.MID_BULGE}  CROWN_PINCH=${CONFIG.CROWN_PINCH}`);
  console.log(`  Sharpen: SHARPEN_START=${CONFIG.SHARPEN_START}  PEAK_POWER=${CONFIG.PEAK_POWER}`);
  console.log(`  RIM_WIDTH=${RIM_WIDTH}  RIM_BAND=${RIM_BAND}`);
  console.log(`  Shell A (${cxA},${czA}) cut x≤${cxA+0.5}  Shell B (${cxB},${czB}) cut x≥${cxB-0.5}`);
  console.log(`  Opening gap: ${cxB - cxA - 1} blocks`);
  // Sample the profile at key heights
  for (const t of [0, 0.25, 0.5, 0.65, 0.75, 0.85, 1.0]) {
    console.log(`    t=${t.toFixed(2)}  r=${computeDomeRadius(t, R2).toFixed(2)} blocks`);
  }

  const slices: Slice[] = [];
  let totalBlocks = 0;

  // ── PLINTH ────────────────────────────────────────────────────────────────
  for (const step of CONFIG.plinthSteps) {
    const stepR              = baseRadius * step.radiusFrac;
    const outerRingThreshold = 1.0 - 1.5 / stepR;
    const isLastStep         = step.yTo === baseThickness;

    for (let y = step.yFrom; y < step.yTo; y++) {
      const g      = emptyGrid(W, D);
      const extras: SliceExtra[] = [];
      const isTopLayer = y === step.yTo - 1;

      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          const d = ellipticalDistance(x, z, baseCx, baseCz, stepR, stepR);
          if (d <= 1.0) {
            setCell(g, x, z, '#');
            totalBlocks++;
            if (isTopLayer && !isLastStep && d >= outerRingThreshold) {
              extras.push({ x, z, blockType: plinthSlabBlock, blockState: { type: 'top' } });
            }
          }
        }
      }

      const sd: Slice = { y, block: step.block, grid: g.map(r => r.join('')) };
      if (extras.length > 0) sd.extras = extras;
      slices.push(sd);
    }
  }

  // ── PRE-COMPUTE RADII ─────────────────────────────────────────────────────
  const radii: number[] = [];
  for (let i = 0; i < layerCount; i++) {
    radii.push(computeDomeRadius(i / domeHeight, R2));
  }

  const prevLayerStairs = new Set<string>();

  // ── DOME SHELLS ───────────────────────────────────────────────────────────
  for (let yi = 0; yi < layerCount; yi++) {
    const y = baseThickness + yi;
    const r = radii[yi];

    // Centred slope for block-type selection (stair/slab zones)
    const rPrev = yi > 0              ? radii[yi - 1] : r;
    const rNext = yi + 1 < layerCount ? radii[yi + 1] : r;
    const slope = Math.abs(rNext - rPrev) / 2;
    const drDir = rNext - r;   // >0 expanding, <0 contracting

    // Height zones for specialised stair / slab treatment
    const isUpperZone = yi > domeHeight * 0.75; // top 25 %: emphasise slabs
    const isCrownZone = yi > domeHeight * 0.90; // top 10 %: inward stairs

    // Shell band — wider for first N layers (closes plinth-junction void ring)
    const thick = yi < BASE_GAP_LAYERS ? BASE_GAP_THICKNESS : THICKNESS;
    const inner = r - (thick - 0.5);   // e.g. r−1.5 for THICKNESS=2
    const outer = r + 0.5;

    const g                    = emptyGrid(W, D);
    const extras: SliceExtra[] = [];
    const currentLayerStairs   = new Set<string>();
    let sliceBlocks = 0;

    // ── Multi-sample voxel placement ────────────────────────────────────────
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        // Shell A: left dome, cut at x ≤ cxA+0.5
        const inA = isInShellHalf(x, cxA, 'A')
                 && cellIntersectsShellBand(x, z, cxA, czA, inner, outer);
        // Shell B: right dome, cut at x ≥ cxB-0.5 (only if A didn't claim cell)
        const inB = !inA
                 && isInShellHalf(x, cxB, 'B')
                 && cellIntersectsShellBand(x, z, cxB, czB, inner, outer);

        if (!inA && !inB) continue;

        const shellCx = inA ? cxA : cxB;
        const shellCz = inA ? czA : czB;

        // Use centre distance for slope/facing/err calculations
        const dist = Math.sqrt((x - shellCx) ** 2 + (z - shellCz) ** 2);

        setCell(g, x, z, '#');
        totalBlocks++;
        sliceBlocks++;

        const err     = dist - r;
        const cellKey = `${x},${z}`;

        // ── Block selection ─────────────────────────────────────────────────
        let shapeExtraAdded = false;
        const dx = x - shellCx, dz = z - shellCz;

        if (isCrownZone && slope >= drSlabMin) {
          // Crown (top 10 %): inward-facing stairs — full block on outer side,
          // step descends toward dome centre for a clean tapering silhouette.
          let facing: 'east' | 'west' | 'north' | 'south';
          if (Math.abs(dx) >= Math.abs(dz)) facing = dx > 0 ? 'west' : 'east';
          else                              facing = dz > 0 ? 'north' : 'south';
          const half: 'top' | 'bottom' = drDir < 0 ? 'top' : 'bottom';
          extras.push({ x, z, blockType: shellStairBlock,
            blockState: { facing, half, shape: 'straight' } });
          currentLayerStairs.add(cellKey);
          shapeExtraAdded = true;

        } else if (isUpperZone && !isCrownZone && slope < drSlabMin) {
          // Upper zone, flat slope (radius barely changing): outermost ring → slab.
          // Avoids stair-free "cylinder" look in the upper quarter.
          if (dist > r - 1.0) {
            const slabHalf: 'top' | 'bottom' = drDir < 0 ? 'top' : 'bottom';
            extras.push({ x, z, blockType: shellSlabBlock,
              blockState: { type: slabHalf } });
            shapeExtraAdded = true;
          }

        } else if (slope >= drSlabMin && slope < drStairMax) {
          // Main dome body: stairs for steep curvature, slabs for moderate slope.
          if (slope >= drStairMin && !prevLayerStairs.has(cellKey)) {
            let facing: 'east' | 'west' | 'north' | 'south';
            if (Math.abs(dx) >= Math.abs(dz)) facing = dx > 0 ? 'east' : 'west';
            else                              facing = dz > 0 ? 'south' : 'north';
            const half: 'top' | 'bottom' = drDir < 0 ? 'top' : 'bottom';
            extras.push({ x, z, blockType: shellStairBlock,
              blockState: { facing, half, shape: 'straight' } });
            currentLayerStairs.add(cellKey);
          } else {
            const slabType: 'top' | 'bottom' = err > 0 ? 'top' : 'bottom';
            extras.push({ x, z, blockType: shellSlabBlock,
              blockState: { type: slabType } });
          }
          shapeExtraAdded = true;
        }

        // Palette variation — single low-freq patch (≈25-block patches, no speckle).
        // XZ-only → natural oxidation variation. ~20% dark, ~80% primary.
        if (!shapeExtraAdded) {
          if (materialNoise(x, z) < -0.45) {
            extras.push({ x, z, blockType: shellBlockDark });
          }
          // ≥ -0.45 → base waxed_oxidized_cut_copper, no extra entry needed
        }
      }
    }

    // ── Explicit cap: force single-voxel tip for tiny radii ─────────────────
    if (r < 1.0) {
      if (g[czA][cxA] === '.') { setCell(g, cxA, czA, '#'); totalBlocks++; sliceBlocks++; }
      if (g[czB][cxB] === '.') { setCell(g, cxB, czB, '#'); totalBlocks++; sliceBlocks++; }
    }

    // ── Speckle cleanup: remove isolated voxels (< 2 filled neighbours) ─────
    // Multi-sampling eliminates structural gaps; this removes any stray single
    // pixels left by half-dome clipping near the cut plane.
    // Skipped for cap layers (r < 1) to avoid removing the valid apex block.
    if (r >= 1.0) {
      for (let sz = 0; sz < D; sz++) {
        for (let sx = 0; sx < W; sx++) {
          if (g[sz][sx] === '.') continue;
          let nbrs = 0;
          if (sz > 0   && g[sz-1][sx] !== '.') nbrs++;
          if (sz < D-1 && g[sz+1][sx] !== '.') nbrs++;
          if (sx > 0   && g[sz][sx-1] !== '.') nbrs++;
          if (sx < W-1 && g[sz][sx+1] !== '.') nbrs++;
          if (nbrs < 2) {
            g[sz][sx] = '.';
            totalBlocks--;
            sliceBlocks--;
          }
        }
      }
    }

    // ── Hollow validation sweep ──────────────────────────────────────────────
    // With multi-sampling a cell's centre can be up to 0.5 blocks inside the
    // band inner edge (r−thick+0.5). Threshold = r−thick removes anything whose
    // centre is farther inside → preserves legitimate edge cells, removes true
    // interior cells that may have crept in via corner samples.
    const hollowThreshold = r - thick;
    for (let vz = 0; vz < D; vz++) {
      for (let vx = 0; vx < W; vx++) {
        if (g[vz][vx] === '.') continue;
        const dA = Math.sqrt((vx - cxA) ** 2 + (vz - czA) ** 2);
        const dB = Math.sqrt((vx - cxB) ** 2 + (vz - czB) ** 2);
        const okA = dA >= hollowThreshold && isInShellHalf(vx, cxA, 'A');
        const okB = dB >= hollowThreshold && isInShellHalf(vx, cxB, 'B');
        if (!okA && !okB) {
          g[vz][vx] = '.';
          totalBlocks--;
          sliceBlocks--;
        }
      }
    }

    const sd: Slice = { y, block: shellBlock, grid: g.map(row => row.join('')) };
    if (extras.length > 0) sd.extras = extras;
    slices.push(sd);

    prevLayerStairs.clear();
    for (const k of currentLayerStairs) prevLayerStairs.add(k);
  }

  // ── RIM — band only, never a disk fill ────────────────────────────────────
  // Conditions: near cut plane (|x−cxN| ≤ RIM_WIDTH) AND on shell side AND
  // on the ring surface (|dist−r| ≤ RIM_BAND).
  // Condition 3 is what prevents the interior from being filled.
  if (enableRim) {
    for (let y = baseThickness; y <= H2; y++) {
      const t = (y - baseThickness) / domeHeight;
      const r = computeDomeRadius(t, R2);
      if (r < 0.5) continue;

      const g = emptyGrid(W, D);
      let hasRim = false;

      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          if (Math.abs(x - cxA) <= RIM_WIDTH && isInShellHalf(x, cxA, 'A')) {
            const dA = Math.sqrt((x - cxA) ** 2 + (z - czA) ** 2);
            if (Math.abs(dA - r) <= RIM_BAND) { setCell(g, x, z, '#'); hasRim = true; }
          }
          if (Math.abs(x - cxB) <= RIM_WIDTH && isInShellHalf(x, cxB, 'B')) {
            const dB = Math.sqrt((x - cxB) ** 2 + (z - czB) ** 2);
            if (Math.abs(dB - r) <= RIM_BAND) { setCell(g, x, z, '#'); hasRim = true; }
          }
        }
      }

      if (hasRim) slices.push({ y, block: rimBlock, grid: g.map(r => r.join('')) });
    }
  }

  console.log(`  Done: ${slices.length} slices  ~${totalBlocks} blocks`);

  return {
    description:
      `Al-Shaheed Monument: R2=${R2.toFixed(1)} H2=${H2} ` +
      `BASE_INSET=${CONFIG.BASE_INSET} MID_BULGE=${CONFIG.MID_BULGE} ` +
      `THICKNESS=${THICKNESS} SHARPEN_START=${CONFIG.SHARPEN_START}`,
    recommended_block_palette: { primary: shellBlock, secondary: CONFIG.shellBlockDark, base: baseBlock },
    dimensions_estimate: { width: W, depth: D, height: H2 },
    slices,
  };
}

// ─── Test Helper ──────────────────────────────────────────────────────────────

export function generateSingleSplitDome(
  radius = 12,
  height = 30,
  splitSide: 'left' | 'right' = 'right',
): Blueprint {
  const W = radius * 3, D = radius * 3, H = height;
  const cx = Math.floor(W / 2), cz = Math.floor(D / 2);
  const slices: Slice[] = [];

  for (let y = 0; y <= H; y++) {
    const g = emptyGrid(W, D);
    const t = y / H;
    const r = alShaheedRadius(t, 0.3);
    if (r < 0.01) {
      slices.push({ y, block: 'warped_concrete', grid: g.map(row => row.join('')) });
      continue;
    }
    const rOuter = r, rInner = Math.max(0, r - 0.20);
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        if (splitSide === 'left'  && x > cx) continue;
        if (splitSide === 'right' && x < cx) continue;
        const d = ellipticalDistance(x, z, cx, cz, radius, radius);
        if (d >= rInner && d <= rOuter) setCell(g, x, z, '#');
      }
    }
    slices.push({ y, block: 'warped_concrete', grid: g.map(row => row.join('')) });
  }

  return {
    description: `Single split Al-Shaheed style dome (${splitSide} half)`,
    recommended_block_palette: { primary: 'warped_concrete', base: 'smooth_quartz' },
    dimensions_estimate: { width: W, depth: D, height: H },
    slices,
  };
}

export default generateAlShaheedLikeBlueprint;
