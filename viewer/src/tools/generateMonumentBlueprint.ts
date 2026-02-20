/**
 * generateMonumentBlueprint.ts
 *
 * Procedural generator for Al-Shaheed (Martyr's) Monument in Baghdad, Iraq.
 *
 * HOLLOW CONTRACT (non-negotiable):
 *   The interior of each dome shell is ALWAYS empty (zero voxels).
 *   A voxel is placed only when its 2-D distance from the dome centre
 *   falls inside the strict band:  r − thickness ≤ dist ≤ r + epsilon.
 *   Nothing at dist < r − thickness is EVER placed.
 *   A post-placement hollow-validation sweep enforces this invariant.
 *
 * Architecture:
 *   TWO identical half-domes, S-offset, facing each other.
 *   Cubic Bézier radial profile + peak sharpening (r × (1−t)^0.45).
 *   4-zone curvature smoothing: full / slab / stair / full-steep.
 *   Anti-teeth guard prevents vertical stair columns.
 *   Base-gap stitch closes the 1-voxel void ring at the plinth junction.
 *
 * Uses deterministic math — no AI, no network requests.
 */

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
  /** Per-cell block overrides (stairs, slabs). Override the slice's default block. */
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
  // Grid (100×100 gives margin for scaled plinth ≈ 47-block radius from centre)
  W: 100,
  D: 100,
  H: 65,             // nominal total height; effective H2 = round(H × heightScale) = 59
  baseThickness: 5,  // plinth layers below dome

  // Reference shell radius (pre-scaling)
  shellRadius: 20,   // R in blocks; effective R2 = R × radiusScale = 23.6

  // Aspect scaling
  radiusScale: 1.18, // wider footprint
  heightScale: 0.90, // shorter overall (H2 = round(65 × 0.90) = 59)

  // Shell centres — ~0.85 R2 separation in X, with Z S-offset
  // halfOverlap=8 means each shell extends 8 blocks past its cut plane,
  // so Shell A (cx=42) reaches x=50 and Shell B (cx=58) reaches x=50:
  // the two flat faces meet exactly at the grid centre, giving "slight intersection".
  cxA: 42, czA: 56,  // Shell A: left-back
  cxB: 58, czB: 44,  // Shell B: right-front  (12-block Z offset)
  halfOverlap: 8,    // shells extend this many blocks past their cut plane

  // ── Cubic Bézier radial profile ─────────────────────────────────────────
  // B(0)=0.82, B(0.6)≈1.05, B(1.0)=0.22  (fractions of R2).
  // Approximately satisfies: r(0)=0.82R2, r(0.3)≈0.95R2, r(0.6)=1.05R2, r(1)=0.22R2.
  bezierP0: 0.82,
  bezierP1: 0.80,   // slightly below P0 → imperceptible sub-voxel initial dip
  bezierP2: 1.67,   // high handle → B(0.6) ≈ 1.05 R2
  bezierP3: 0.22,

  // ── Peak sharpening ──────────────────────────────────────────────────────
  // Applied after Bézier:  r = bezierBase × (1−t)^peakPower,  r = max(r, 0.5)
  // Collapses crown to a single voxel — mountain-like convergence.
  peakPower: 0.45,

  // ── Plinth steps ─────────────────────────────────────────────────────────
  // radiusFrac relative to scaled plinth radius (40 × radiusScale ≈ 47 blocks).
  plinthSteps: [
    { yFrom: 0, yTo: 2, radiusFrac: 1.000, block: 'smooth_quartz' }, // outer ring
    { yFrom: 2, yTo: 4, radiusFrac: 0.875, block: 'smooth_quartz' }, // middle step
    { yFrom: 4, yTo: 5, radiusFrac: 0.775, block: 'smooth_quartz' }, // top step
  ] as const,

  // ── Block types ──────────────────────────────────────────────────────────
  baseBlock:        'smooth_quartz',
  shellBlock:       'cyan_terracotta',   // turquoise, matches real monument
  shellStairBlock:  'prismarine_stairs', // prismarine has stairs + slabs in Bedrock
  shellSlabBlock:   'prismarine_slab',
  rimBlock:         'cyan_concrete',     // cut-face highlight
  rimWidth:         2,
  plinthSlabBlock:  'smooth_quartz_slab',

  // ── Shell band (HOLLOW enforcement) ──────────────────────────────────────
  // Voxel placed only when  r − shellThickness ≤ dist ≤ r + shellEpsilon.
  shellThickness: 1.0,
  shellEpsilon:   0.15,

  // ── Base gap fix ──────────────────────────────────────────────────────────
  // First N dome layers above the plinth use a slightly wider band to close
  // the 1-voxel void ring at the shell-platform junction.
  baseGapLayers:    8,
  baseGapThickness: 1.15,
  baseGapEpsilon:   0.35,

  // ── Curvature smoothing zones ─────────────────────────────────────────────
  // slope = |r(yi+1) − r(yi−1)| / 2  (centred, in blocks per layer)
  //   slope < drSlabMin               → FULL BLOCK
  //   drSlabMin  ≤ slope < drStairMin → SLAB
  //   drStairMin ≤ slope < drStairMax → STAIR (anti-teeth enforced)
  //   slope ≥ drStairMax              → FULL BLOCK (too steep)
  drSlabMin:  0.15,
  drStairMin: 0.45,
  drStairMax: 0.90,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyGrid(w: number, d: number): string[][] {
  return Array.from({ length: d }, () => Array.from({ length: w }, () => '.'));
}

function setCell(grid: string[][], x: number, z: number, v: string): void {
  if (z >= 0 && z < grid.length && x >= 0 && x < grid[0].length) grid[z][x] = v;
}

/** Two-phase radius profile — used only by generateSingleSplitDome. */
function alShaheedRadius(t: number, baseExponent: number): number {
  const slowPhaseEnd = 0.60, slowPhaseShrink = 0.15, fastPhaseExp = 3.0;
  const tc = Math.max(0, Math.min(1, t));
  if (tc <= slowPhaseEnd) return 1.0 - slowPhaseShrink * (tc / slowPhaseEnd);
  const phaseT = (tc - slowPhaseEnd) / (1 - slowPhaseEnd);
  return (1.0 - slowPhaseShrink) * Math.pow(1 - phaseT, fastPhaseExp * baseExponent);
}

/**
 * Returns true if voxel (x,z) belongs to the kept half of the given shell.
 * Each shell is cut through its centre; halfOverlap controls how many blocks
 * past the cut plane remain visible (creating the visual intersection at the top).
 */
function isInShellHalf(
  x: number, _z: number,
  cx: number, _cz: number,
  shell: 'A' | 'B',
): boolean {
  const dx = x - cx;
  return shell === 'A' ? dx <= CONFIG.halfOverlap : dx >= -CONFIG.halfOverlap;
}

function ellipticalDistance(
  x: number, z: number,
  cx: number, cz: number,
  rx: number, rz: number,
): number {
  return Math.sqrt(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2);
}

/**
 * Raw cubic Bézier dome radius at t ∈ [0,1].
 *
 *   B(t) = Σ C(3,k) (1−t)^(3−k) t^k  P_k
 *
 * @param radius  Effective radius in blocks (pass R2 for the scaled version).
 *                Defaults to CONFIG.shellRadius for backward compatibility.
 */
function bezierDomeRadius(t: number, radius = CONFIG.shellRadius): number {
  const { bezierP0, bezierP1, bezierP2, bezierP3 } = CONFIG;
  const tc = Math.max(0, Math.min(1, t)), mt = 1 - tc;
  return mt ** 3 * (bezierP0 * radius)
       + 3 * mt ** 2 * tc * (bezierP1 * radius)
       + 3 * mt * tc ** 2 * (bezierP2 * radius)
       + tc ** 3 * (bezierP3 * radius);
}

/**
 * Scaled + peak-sharpened dome radius at t ∈ [0,1].
 *
 * Two-stage:
 *   1. Bézier profile with effective radius R2 = shellRadius × radiusScale.
 *   2. Peak sharpening:  r = bezierBase × (1−t)^peakPower
 *      → Crown collapses to 0, clamped to 0.5 → single-voxel apex.
 *
 * The strict shell band [r − shellThickness, r + shellEpsilon] applied to
 * this value guarantees a fully HOLLOW shell.
 */
function computeDomeRadius(t: number, R2: number): number {
  const tc = Math.max(0, Math.min(1, t));
  const base = bezierDomeRadius(tc, R2);
  const sharpened = base * Math.pow(1 - tc, CONFIG.peakPower);
  return Math.max(sharpened, 0.5);
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export function generateAlShaheedLikeBlueprint(enableRim = true): Blueprint {
  const {
    W, D, H, baseThickness,
    shellRadius, radiusScale, heightScale,
    cxA, czA, cxB, czB,
    baseBlock, shellBlock, shellStairBlock, shellSlabBlock,
    rimBlock, rimWidth, plinthSlabBlock,
    shellThickness, shellEpsilon,
    baseGapLayers, baseGapThickness, baseGapEpsilon,
    drSlabMin, drStairMin, drStairMax,
  } = CONFIG;

  // ── Derived geometry ───────────────────────────────────────────────────────
  const R2 = shellRadius * radiusScale;     // 23.6 blocks effective radius
  const H2 = Math.round(H * heightScale);   // 59 total height (plinth + dome)
  const domeHeight = H2 - baseThickness;    // 54 dome layers
  const layerCount = domeHeight + 1;        // yi: 0 … 54

  const slices: Slice[] = [];
  let totalBlocks = 0, nonEmptySlices = 0, maxYWithBlocks = 0;

  console.log('generateMonumentBlueprint.ts: Generating Al-Shaheed Monument...');
  console.log(`  Grid=${W}×${D}  R2=${R2.toFixed(1)}  H2=${H2}  domeHeight=${domeHeight}`);
  console.log(`  Shell A: (${cxA},${czA})  Shell B: (${cxB},${czB})  overlap=±${CONFIG.halfOverlap}`);

  // ── PLINTH (stepped rings) ─────────────────────────────────────────────────
  const baseCx = Math.floor(W / 2);  // 50
  const baseCz = Math.floor(D / 2);  // 50
  const baseRadius = Math.round(40 * radiusScale); // ≈47 blocks from centre

  for (const step of CONFIG.plinthSteps) {
    const stepR = baseRadius * step.radiusFrac;
    const outerRingThreshold = 1.0 - 1.5 / stepR;
    const isLastStep = step.yTo === baseThickness;

    for (let y = step.yFrom; y < step.yTo; y++) {
      const g = emptyGrid(W, D);
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

      const sliceData: Slice = { y, block: step.block, grid: g.map(r => r.join('')) };
      if (extras.length > 0) sliceData.extras = extras;
      slices.push(sliceData);
      nonEmptySlices++;
      maxYWithBlocks = y;
    }
  }

  // ── PRE-COMPUTE DOME RADII ─────────────────────────────────────────────────
  // Build the full radii array up-front so centred slopes are O(1) per layer.
  const radii: number[] = [];
  for (let i = 0; i < layerCount; i++) radii.push(computeDomeRadius(i / domeHeight, R2));

  // Anti-teeth guard: stair positions in the previous dome layer.
  const prevLayerStairs = new Set<string>();

  // ── DOME SHELLS ────────────────────────────────────────────────────────────
  //
  // HOLLOW CONTRACT enforcement:
  //   A voxel at dist from dome centre is placed only if:
  //     dist ≥ r − thick   (outer side of the hollow band inner wall)
  //     dist ≤ r + eps     (outer side of the hollow band outer wall)
  //   Nothing at dist < r − thick is ever placed.
  //   A post-placement hollow-validation sweep (below) removes any
  //   voxel that slipped inside dist < r − 1.3 for both shells.
  //
  for (let yi = 0; yi < layerCount; yi++) {
    const y    = baseThickness + yi;
    const r    = radii[yi];

    // Centred slope: smoother than per-layer dr, prevents stair-zone noise.
    const rPrev = yi > 0              ? radii[yi - 1] : r;
    const rNext = yi + 1 < layerCount ? radii[yi + 1] : r;
    const slope  = Math.abs(rNext - rPrev) / 2;
    const drDir  = rNext - r; // sign: >0 expanding, <0 shrinking

    // Base-gap wider band for the first N layers above the plinth.
    const thick = yi < baseGapLayers ? baseGapThickness : shellThickness;
    const eps   = yi < baseGapLayers ? baseGapEpsilon   : shellEpsilon;

    const g                  = emptyGrid(W, D);
    const extras: SliceExtra[] = [];
    const currentLayerStairs   = new Set<string>();
    let sliceBlocks = 0;

    // Skip layers whose radius is sub-voxel (peak clamp keeps r ≥ 0.5, so
    // this only triggers if the computation dips below 0.5 through float noise).
    if (r < 0.5) {
      slices.push({ y, block: shellBlock, grid: g.map(row => row.join('')) });
      prevLayerStairs.clear();
      continue;
    }

    // ── Voxel placement ──────────────────────────────────────────────────────
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        let dist = 0, shellCx = 0, shellCz = 0, inShell = false;

        // Shell A — checked first; if it claims this cell, Shell B is skipped.
        const dA = Math.sqrt((x - cxA) ** 2 + (z - czA) ** 2);
        if (dA >= r - thick && dA <= r + eps && isInShellHalf(x, z, cxA, czA, 'A')) {
          inShell = true; dist = dA; shellCx = cxA; shellCz = czA;
        }

        // Shell B — only if Shell A didn't claim the cell.
        if (!inShell) {
          const dB = Math.sqrt((x - cxB) ** 2 + (z - czB) ** 2);
          if (dB >= r - thick && dB <= r + eps && isInShellHalf(x, z, cxB, czB, 'B')) {
            inShell = true; dist = dB; shellCx = cxB; shellCz = czB;
          }
        }

        if (!inShell) continue;

        setCell(g, x, z, '#');
        totalBlocks++;
        sliceBlocks++;

        // err < 0: voxel centre is inward of surface radius r
        // err > 0: voxel centre is outward of surface radius r
        const err     = dist - r;
        const cellKey = `${x},${z}`;

        // ── 4-zone block selection ────────────────────────────────────────────
        //   FULL BLOCK: slope outside [drSlabMin, drStairMax)
        //   SLAB:       drSlabMin ≤ slope < drStairMin  (or stair anti-teeth fallback)
        //   STAIR:      drStairMin ≤ slope < drStairMax, no stair on (x,z,y−1)
        if (slope >= drSlabMin && slope < drStairMax) {

          if (slope >= drStairMin && !prevLayerStairs.has(cellKey)) {
            // ── STAIR ────────────────────────────────────────────────────────
            const dx = x - shellCx, dz = z - shellCz;
            let facing: 'east' | 'west' | 'north' | 'south';
            if (Math.abs(dx) >= Math.abs(dz)) facing = dx > 0 ? 'east' : 'west';
            else                              facing = dz > 0 ? 'south' : 'north';

            // top half (upside-down) when crown is contracting (drDir < 0);
            // bottom half when dome is expanding (drDir ≥ 0).
            const half: 'top' | 'bottom' = drDir < 0 ? 'top' : 'bottom';

            extras.push({ x, z, blockType: shellStairBlock,
              blockState: { facing, half, shape: 'straight' } });
            currentLayerStairs.add(cellKey);

          } else {
            // ── SLAB ─────────────────────────────────────────────────────────
            // Also the anti-teeth fallback when the stair guard fires.
            // Top slab when voxel sticks outward (err > 0);
            // bottom slab when voxel is inward (err < 0).
            const slabType: 'top' | 'bottom' = err > 0 ? 'top' : 'bottom';
            extras.push({ x, z, blockType: shellSlabBlock,
              blockState: { type: slabType } });
          }

        }
        // else FULL BLOCK — no extra, shellBlock is rendered for this cell.
      }
    }

    // ── Stitching pass: close 1-voxel gaps in the ring ────────────────────────
    // An empty cell that has ≥3 filled horizontal neighbours is a hole.
    // Patch it if it also lies within 0.7 blocks of the shell surface.
    for (let sz = 1; sz < D - 1; sz++) {
      for (let sx = 1; sx < W - 1; sx++) {
        if (g[sz][sx] !== '.') continue;

        const filled = (g[sz][sx - 1] !== '.' ? 1 : 0)
                     + (g[sz][sx + 1] !== '.' ? 1 : 0)
                     + (g[sz - 1][sx] !== '.' ? 1 : 0)
                     + (g[sz + 1][sx] !== '.' ? 1 : 0);
        if (filled < 3) continue;

        const dA = Math.sqrt((sx - cxA) ** 2 + (sz - czA) ** 2);
        const dB = Math.sqrt((sx - cxB) ** 2 + (sz - czB) ** 2);
        const nearA = Math.abs(dA - r) < 0.7 && isInShellHalf(sx, sz, cxA, czA, 'A');
        const nearB = Math.abs(dB - r) < 0.7 && isInShellHalf(sx, sz, cxB, czB, 'B');

        if (nearA || nearB) {
          setCell(g, sx, sz, '#');
          totalBlocks++;
          sliceBlocks++;
          // Stitch voxels are always full blocks (no extra entry needed).
        }
      }
    }

    // ── Hollow validation sweep ────────────────────────────────────────────────
    // Remove any voxel whose distance from BOTH shell centres is less than
    // r − 1.3 blocks (i.e., lies inside the hollow interior).
    // In normal operation the band condition makes this a no-op; it is kept
    // as a safety net against floating-point edge cases or future refactors.
    for (let vz = 0; vz < D; vz++) {
      for (let vx = 0; vx < W; vx++) {
        if (g[vz][vx] === '.') continue;

        const dA = Math.sqrt((vx - cxA) ** 2 + (vz - czA) ** 2);
        const dB = Math.sqrt((vx - cxB) ** 2 + (vz - czB) ** 2);

        // A voxel is valid if it is in the shell band of at least one shell.
        // We use 1.3 (slightly above baseGapThickness=1.15) to catch stitch voxels.
        const okA = dA >= r - 1.3 && isInShellHalf(vx, vz, cxA, czA, 'A');
        const okB = dB >= r - 1.3 && isInShellHalf(vx, vz, cxB, czB, 'B');

        if (!okA && !okB) {
          g[vz][vx] = '.';
          totalBlocks--;
          sliceBlocks--;
        }
      }
    }

    // ── Emit slice ─────────────────────────────────────────────────────────────
    const sliceData: Slice = { y, block: shellBlock, grid: g.map(row => row.join('')) };
    if (extras.length > 0) sliceData.extras = extras;
    slices.push(sliceData);

    // Advance anti-teeth state to next layer.
    prevLayerStairs.clear();
    for (const k of currentLayerStairs) prevLayerStairs.add(k);

    if (sliceBlocks > 0) { nonEmptySlices++; maxYWithBlocks = y; }
  }

  // ── RIM (cut-face highlight) ───────────────────────────────────────────────
  if (enableRim) {
    for (let y = baseThickness; y <= H2; y++) {
      const t = (y - baseThickness) / domeHeight;
      const r = computeDomeRadius(t, R2);
      if (r < 0.5) continue;

      const g = emptyGrid(W, D);
      let hasRim = false;

      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          // Shell A cut-face
          if (Math.abs(x - cxA) <= rimWidth && isInShellHalf(x, z, cxA, czA, 'A')) {
            if (Math.sqrt((x - cxA) ** 2 + (z - czA) ** 2) <= r + 0.5) {
              setCell(g, x, z, '#'); hasRim = true;
            }
          }
          // Shell B cut-face
          if (Math.abs(x - cxB) <= rimWidth && isInShellHalf(x, z, cxB, czB, 'B')) {
            if (Math.sqrt((x - cxB) ** 2 + (z - czB) ** 2) <= r + 0.5) {
              setCell(g, x, z, '#'); hasRim = true;
            }
          }
        }
      }

      if (hasRim) slices.push({ y, block: rimBlock, grid: g.map(r => r.join('')) });
    }
  }

  console.log(`  Done: ${slices.length} slices, ~${totalBlocks} blocks, maxY=${maxYWithBlocks}`);

  return {
    description: `Al-Shaheed Monument (hollow shell): R2=${R2.toFixed(1)}, H2=${H2}, ` +
                 `peak sharpening p=${CONFIG.peakPower}, base-gap stitched, anti-teeth stairs.`,
    recommended_block_palette: { primary: shellBlock, secondary: rimBlock, base: baseBlock },
    dimensions_estimate: { width: W, depth: D, height: H2 },
    slices,
  };
}

// ─── Test Helper ──────────────────────────────────────────────────────────────

/** Generates a simpler single split dome for isolated testing. */
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
