/**
 * generateMonumentBlueprint.ts
 *
 * Procedural generator for Al-Shaheed (Martyr's) Monument in Baghdad, Iraq.
 *
 * Architectural accuracy based on real monument:
 * - TWO IDENTICAL half-domes (same size, same curvature)
 * - Positioned in "S" offset pattern (not centered/symmetric)
 * - Each shell is a true half-dome cut through its center
 * - Shells face each other but are offset in Z axis
 * - Circular platform base (190m diameter in real life)
 * - 40m tall turquoise dome in real monument
 *
 * Uses deterministic math - no AI, no network requests.
 */

/** Minecraft block state fields — same shape as the exported type in blueprintTypes.ts */
type BlockState = {
  facing?: 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
  half?: 'top' | 'bottom';
  shape?: 'straight' | 'inner_left' | 'inner_right' | 'outer_left' | 'outer_right';
  type?: 'top' | 'bottom' | 'double';
};

/** A per-cell block override attached to a slice */
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
  recommended_block_palette: {
    primary: string;
    secondary?: string;
    base: string;
  };
  dimensions_estimate: { width: number; depth: number; height: number };
  slices: Slice[];
};

// ============================================================================
// CONFIGURABLE PARAMETERS - Tuned for Al-Shaheed Monument accuracy
// ============================================================================

const CONFIG = {
  // Grid dimensions - wide platform, proportional to real monument (190m platform, 40m dome)
  W: 90,                    // Grid width (X axis)
  D: 90,                    // Grid depth (Z axis) - square platform like real monument
  H: 31,                    // Total height (increased to preserve dome height after taller plinth)
  baseThickness: 5,         // Total plinth height (sum of all plinth step layers)

  // IDENTICAL shell parameters (real monument has two equal halves)
  shellRadius: 20,          // Both shells same radius
  shellExponent: 0.35,      // Same curvature profile

  // Shell A position - offset for "S" shape in plan
  cxA: 35,                  // X center - left side
  czA: 52,                  // Z center - pushed toward back

  // Shell B position - offset opposite direction for "S" shape
  cxB: 55,                  // X center - right side
  czB: 38,                  // Z center - pushed toward front (14 blocks offset from A)

  // Two-phase curvature control - onion/teardrop dome shape
  slowPhaseEnd: 0.65,       // Radius shrinks slowly until 65% height
  slowPhaseShrink: 0.12,    // Shrink 12% in slow phase
  fastPhaseExponent: 2.8,   // Exponential taper for pointed top

  // Radial profile: "in → out → in" scaling applied on top of alShaheedRadius().
  // baseTuck    — how much the base is pulled inward (s(0) ≈ 1 - baseTuck)
  // bulgeAmount — how far the mid-section bulges outward (s(bulgeCenter) ≈ 1 + bulgeAmount)
  // bulgeCenter — t in [0,1] where the bulge peaks (0 = base, 1 = apex)
  baseTuck: 0.05,
  bulgeAmount: 0.06,
  bulgeCenter: 0.45,

  // Shell thickness: base value used by dynamicShellThickness()
  shellThickness: 0.28,

  // Inner cavity sculpting: fraction of full thickness applied at the very base (t=0).
  // Lower = wider cavity at base, tightens smoothly toward apex.
  shellThicknessBase: 0.45,

  // Rim lip: structural mass thickening at the shell base edge.
  // rimLipHeight: height fraction (0–1) over which lip fades out.
  // rimLipExtend: outward radius extension at base (normalized, multiplied by shellRadius).
  rimLipHeight: 0.15,
  rimLipExtend: 0.08,

  // Stepped plinth definition: layers from ground (y=0) upward.
  // radiusFrac is relative to the circular base radius (40 blocks).
  // Each step is visually distinct and 2–3 blocks shorter in footprint.
  plinthSteps: [
    { yFrom: 0, yTo: 2, radiusFrac: 1.000, block: "smooth_quartz" }, // outermost ground ring
    { yFrom: 2, yTo: 4, radiusFrac: 0.875, block: "smooth_quartz" }, // middle step
    { yFrom: 4, yTo: 5, radiusFrac: 0.775, block: "smooth_quartz" }, // top step: dome platform
  ] as const,

  // Block types
  baseBlock: "smooth_quartz",
  shellBlock: "cyan_terracotta",   // Turquoise like real monument
  rimBlock: "cyan_concrete",
  rimWidth: 2,

  // Sub-block detail: stair/slab variants used for curvature smoothing.
  // These must be valid Minecraft block IDs; blockState is stored in extras[].blockState.
  shellStairBlock: "cyan_concrete_stairs",  // outer dome surface where dR/dy ≈ 0.9–2.0 blocks/layer
  shellSlabBlock: "cyan_concrete_slab",     // outer dome surface where dR/dy ≈ 0.3–0.9 blocks/layer
  plinthSlabBlock: "smooth_quartz_slab",    // top outer-ring chamfer on each plinth step
};

// ============================================================================
// GEOMETRY HELPERS
// ============================================================================

function emptyGrid(w: number, d: number): string[][] {
  return Array.from({ length: d }, () => Array.from({ length: w }, () => "."));
}

function setCell(grid: string[][], x: number, z: number, v: string) {
  if (z >= 0 && z < grid.length && x >= 0 && x < grid[0].length) {
    grid[z][x] = v;
  }
}

/**
 * Al-Shaheed specific radius profile:
 * - Phase 1 (0% to slowPhaseEnd): radius shrinks VERY slowly
 * - Phase 2 (slowPhaseEnd to 100%): aggressive exponential taper to point
 * 
 * This creates the characteristic "fat for most of height, then pinches sharply" shape.
 */
function alShaheedRadius(t: number, baseExponent: number): number {
  const { slowPhaseEnd, slowPhaseShrink, fastPhaseExponent } = CONFIG;
  
  const tc = Math.max(0, Math.min(1, t));
  
  if (tc <= slowPhaseEnd) {
    // SLOW PHASE: very gradual shrink
    // At t=0: r=1.0, at t=slowPhaseEnd: r=(1-slowPhaseShrink)
    const phaseT = tc / slowPhaseEnd;
    return 1.0 - slowPhaseShrink * phaseT;
  } else {
    // FAST PHASE: aggressive exponential taper
    // Map tc from [slowPhaseEnd, 1] to [0, 1]
    const phaseT = (tc - slowPhaseEnd) / (1 - slowPhaseEnd);
    // Start from where slow phase ended
    const startR = 1.0 - slowPhaseShrink;
    // Exponential decay to near-zero
    return startR * Math.pow(1 - phaseT, fastPhaseExponent * baseExponent);
  }
}

/**
 * Determines if a point is in the "kept" half of a shell.
 * Each shell is cut through its center - we keep one half.
 * Shell A: keep the LEFT half (facing outward/away from B)
 * Shell B: keep the RIGHT half (facing outward/away from A)
 * Rotated 180° from inward-facing configuration.
 */
function isInShellHalf(
  x: number, z: number,
  cx: number, cz: number,
  shell: 'A' | 'B'
): boolean {
  // Vector from shell center to point
  const dx = x - cx;

  // Shells face OUTWARD (away from each other)
  // Shell A (left): keep points where x < cx (left half, facing outward)
  // Shell B (right): keep points where x > cx (right half, facing outward)
  if (shell === 'A') {
    return dx <= 2;  // Keep left half of shell A (facing outward)
  } else {
    return dx >= -2; // Keep right half of shell B (facing outward)
  }
}

function ellipticalDistance(
  x: number, z: number,
  cx: number, cz: number,
  rx: number, rz: number
): number {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Structural rim lip factor.
 *
 * Returns the amount (normalized, 0–rimLipExtend) by which the outer shell
 * radius is expanded at height t. Full at t=0, cosine-eased to zero by
 * t=rimLipHeight. This creates a thickened structural base lip without
 * introducing any new geometry type.
 */
function rimLipFactor(t: number): number {
  const { rimLipHeight, rimLipExtend } = CONFIG;
  if (t >= rimLipHeight) return 0;
  const phase = t / rimLipHeight;
  // Cosine ease: 1 at phase=0, 0 at phase=1
  return rimLipExtend * 0.5 * (1 + Math.cos(Math.PI * phase));
}

/**
 * Dynamic shell wall thickness as a function of height t (0=base, 1=apex).
 *
 * At the base (t=0): multiplied by shellThicknessBase (< 1) → thin wall,
 * wide inner cavity. At the apex (t=1): full shellThickness → wall closes in.
 * Smooth power curve — no hard thresholds.
 */
function dynamicShellThickness(t: number): number {
  const { shellThickness, shellThicknessBase } = CONFIG;
  // Power curve: starts at shellThicknessBase, approaches 1.0 smoothly
  const eased = shellThicknessBase + (1 - shellThicknessBase) * Math.pow(t, 0.60);
  return shellThickness * eased;
}

/**
 * Radial profile scale: smooth "in → out → in" multiplier applied to alShaheedRadius().
 *
 *   s(0)           ≈ 1 - baseTuck            — base tucked inward
 *   s(bulgeCenter) ≈ 1 + bulgeAmount         — mid-lower bulge
 *   s(1)           ≈ 1                       — apex unaffected (alShaheedRadius handles pinch)
 *
 * Composed of two smooth terms:
 *   tuck  — quadratic decay from baseTuck at t=0, zero by t = bulgeCenter×0.65
 *   bulge — Gaussian bell (σ=0.22) centered at bulgeCenter
 *
 * Tuning:
 *   baseTuck    ↑  → more aggressive inward base
 *   bulgeAmount ↑  → wider mid-section flare
 *   bulgeCenter ↓  → flare starts lower; ↑ → flare starts higher
 */
function profileScale(t: number): number {
  const { baseTuck, bulgeAmount, bulgeCenter } = CONFIG;
  const tuckEnd   = bulgeCenter * 0.65;
  const tuckFrac  = Math.pow(Math.max(0, 1 - t / tuckEnd), 2); // quadratic ease-out
  const tuck      = baseTuck * tuckFrac;
  const sigma     = 0.22;
  const bulge     = bulgeAmount * Math.exp(-0.5 * ((t - bulgeCenter) / sigma) ** 2);
  return 1 - tuck + bulge;
}

/**
 * Stair facing direction for a block at (x, z) relative to dome center (cx, cz).
 *
 * Convention: facing = the direction the FULL-BLOCK portion faces = outward from center.
 * This gives the stair its slope on the interior side, smoothing the dome's outer surface.
 *
 * Dominant-axis rule maps the radial direction to one of the 4 cardinals:
 *   block east  of center → 'east'   (full face outward to the east)
 *   block west  of center → 'west'
 *   block south of center → 'south'
 *   block north of center → 'north'
 */
function getStairFacing(
  x: number, z: number,
  cx: number, cz: number
): 'north' | 'south' | 'east' | 'west' {
  const dx = x - cx;
  const dz = z - cz;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx >= 0 ? 'east' : 'west';
  }
  return dz >= 0 ? 'south' : 'north';
}

/**
 * Classifies the dome outer surface slope at a given slice into a smoothing type.
 *
 * dRdy = (outerRadius[y] − outerRadius[y+1]) * shellRadius  (blocks per 1 y-layer).
 * Positive = dome is narrowing (normal case going up).
 *
 * Rules:
 *   dRdy < 0.3              → 'none'  — plateau; full block, no gap to bridge
 *   0.3 ≤ dRdy < 0.9       → 'slab'  — gentle slope; half-block inset hides the step
 *   0.9 ≤ dRdy < 2.0       → 'stair' — moderate slope; stair bevels the transition
 *   dRdy ≥ 2.0             → 'none'  — steep cliff; stair geometry can't meaningfully smooth
 */
function outerSurfaceSmoothType(dRdy: number): 'none' | 'slab' | 'stair' {
  if (dRdy < 0.30) return 'none';
  if (dRdy < 0.90) return 'slab';
  if (dRdy < 2.00) return 'stair';
  return 'none';
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

export function generateAlShaheedLikeBlueprint(enableRim = true): Blueprint {
  const {
    W, D, H, baseThickness,
    cxA, czA, cxB, czB,
    shellRadius, shellExponent,
    baseBlock, shellBlock, rimBlock, rimWidth,
    shellStairBlock, shellSlabBlock, plinthSlabBlock,
  } = CONFIG;

  // Both shells use identical radii (real monument has equal halves)
  const rxA = shellRadius;
  const rzA = shellRadius;
  const rxB = shellRadius;
  const rzB = shellRadius;
  const exponentA = shellExponent;
  const exponentB = shellExponent;

  const slices: Slice[] = [];
  let totalBlocks = 0;
  let nonEmptySlices = 0;
  let maxYWithBlocks = 0;

  console.log(`generateMonumentBlueprint.ts: Generating Al-Shaheed Monument...`);
  console.log(`  - Grid: ${W}×${D}×${H}`);
  console.log(`  - Shell A: center=(${cxA},${czA}), radius=${shellRadius}`);
  console.log(`  - Shell B: center=(${cxB},${czB}), radius=${shellRadius}`);
  console.log(`  - S-offset: Z difference = ${Math.abs(czA - czB)} blocks`);

  // -------------------------------------------------------------------------
  // STEPPED PLINTH (base hierarchy)
  //
  // Three stepped rings that lift the structure off the ground plane.
  // Each step is inset ~5-6 blocks from the one below, using the same
  // circular geometry as the original flat base — no new mesh types.
  // -------------------------------------------------------------------------
  const baseCx = Math.floor(W / 2);
  const baseCz = Math.floor(D / 2);
  const baseRadius = 40; // Outermost plinth ring radius (blocks)

  for (const step of CONFIG.plinthSteps) {
    const stepR = baseRadius * step.radiusFrac;
    // Outer-ring threshold: cells whose normalised distance is within ~1.5 blocks of the edge.
    // These get a top-slab chamfer on the topmost layer of each step to soften the step corner.
    const outerRingThreshold = 1.0 - 1.5 / stepR;
    const isLastStep = step.yTo === baseThickness; // top platform — no chamfer (dome sits here)

    for (let y = step.yFrom; y < step.yTo; y++) {
      const g = emptyGrid(W, D);
      const extras: SliceExtra[] = [];
      const isTopLayer = y === step.yTo - 1;

      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          const d = ellipticalDistance(x, z, baseCx, baseCz, stepR, stepR);
          if (d <= 1.0) {
            setCell(g, x, z, "#");
            totalBlocks++;

            // Top-layer outer ring on the lower two steps → upside-down slab.
            // Creates a visible chamfer between the step face and the step top.
            if (isTopLayer && !isLastStep && d >= outerRingThreshold) {
              extras.push({ x, z, blockType: plinthSlabBlock, blockState: { type: 'top' } });
            }
          }
        }
      }

      const sliceData: Slice = { y, block: step.block, grid: g.map(row => row.join("")) };
      if (extras.length > 0) sliceData.extras = extras;
      slices.push(sliceData);
      nonEmptySlices++;
      maxYWithBlocks = y;
    }
  }

  // -------------------------------------------------------------------------
  // DOME SHELLS with CURVED OPENING and ASYMMETRY
  // -------------------------------------------------------------------------
  const domeHeight = H - baseThickness;

  for (let y = baseThickness; y <= H; y++) {
    const relY = y - baseThickness;
    const t = relY / domeHeight;

    // Calculate radius for each dome, scaled by the "in → out → in" profile.
    const s  = profileScale(t);
    const rA = alShaheedRadius(t, exponentA) * s;
    const rB = alShaheedRadius(t, exponentB) * s;

    // Structural rim lip: extends outer radius at base, fades by t=rimLipHeight.
    // Same block type as shell — reads as mass, not ornament.
    const lip = rimLipFactor(t);

    // Dynamic inner thickness: thin wall at base (wide cavity), thickens toward apex.
    const dynThickness = dynamicShellThickness(t);

    // Shell bands (outer includes lip extension; inner uses dynamic thickness)
    const rOuterA = rA + lip;
    const rInnerA = Math.max(0, rA - dynThickness);
    const rOuterB = rB + lip;
    const rInnerB = Math.max(0, rB - dynThickness);

    const g = emptyGrid(W, D);
    const extras: SliceExtra[] = [];
    let sliceBlocks = 0;

    if (rA < 0.02 && rB < 0.02) {
      slices.push({ y, block: shellBlock, grid: g.map(row => row.join("")) });
      continue;
    }

    // Pre-compute stair/slab type for each shell's outer surface at this height.
    // dRdy = how many blocks the outer radius shrinks going to the next y-layer.
    // Used to pick: none | slab | stair for outer-ring cells.
    const dt = 1 / domeHeight;
    const tNext = Math.min(1, t + dt);
    const sNext  = profileScale(tNext);
    const rANext = alShaheedRadius(tNext, exponentA) * sNext + rimLipFactor(tNext);
    const rBNext = alShaheedRadius(tNext, exponentB) * sNext + rimLipFactor(tNext);
    const dRdyA = (rOuterA - rANext) * shellRadius; // blocks per 1-layer step, Shell A
    const dRdyB = (rOuterB - rBNext) * shellRadius; // blocks per 1-layer step, Shell B
    const smoothA = outerSurfaceSmoothType(dRdyA);
    const smoothB = outerSurfaceSmoothType(dRdyB);

    // Width of the outer ring eligible for stair/slab: ~1.5 blocks from the outer surface.
    const OUTER_RING_W = 1.5 / shellRadius;

    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        let placed = false;
        // Track which shell placed this block and its smooth-type, for extra generation.
        let smoothType: 'none' | 'slab' | 'stair' = 'none';
        let placedCx = 0, placedCz = 0;

        // --- SHELL A ---
        if (rA >= 0.02 && isInShellHalf(x, z, cxA, czA, 'A')) {
          const dA = ellipticalDistance(x, z, cxA, czA, rxA, rzA);
          if (dA >= rInnerA && dA <= rOuterA) {
            placed = true;
            placedCx = cxA; placedCz = czA;
            // Outer ring: cells within OUTER_RING_W of the outer surface edge
            smoothType = (dA >= rOuterA - OUTER_RING_W) ? smoothA : 'none';
          }
        }

        // --- SHELL B ---
        if (!placed && rB >= 0.02 && isInShellHalf(x, z, cxB, czB, 'B')) {
          const dB = ellipticalDistance(x, z, cxB, czB, rxB, rzB);
          if (dB >= rInnerB && dB <= rOuterB) {
            placed = true;
            placedCx = cxB; placedCz = czB;
            smoothType = (dB >= rOuterB - OUTER_RING_W) ? smoothB : 'none';
          }
        }

        if (placed) {
          setCell(g, x, z, "#");
          totalBlocks++;
          sliceBlocks++;

          // Emit stair or slab extra for outer-ring cells.
          // The extra OVERRIDES this '#' cell in the voxelizer with the correct block type.
          if (smoothType === 'slab') {
            extras.push({
              x, z,
              blockType: shellSlabBlock,                       // "cyan_concrete_slab"
              blockState: { type: 'bottom' },                  // sits in lower half
            });
          } else if (smoothType === 'stair') {
            extras.push({
              x, z,
              blockType: shellStairBlock,                      // "cyan_concrete_stairs"
              blockState: {
                facing: getStairFacing(x, z, placedCx, placedCz), // outward from center
                half: 'bottom',                                // step rises toward interior
                shape: 'straight',
              },
            });
          }
        }
      }
    }

    const sliceData: Slice = { y, block: shellBlock, grid: g.map(row => row.join("")) };
    if (extras.length > 0) sliceData.extras = extras;
    slices.push(sliceData);

    if (sliceBlocks > 0) {
      nonEmptySlices++;
      maxYWithBlocks = y;
    }
  }

  // -------------------------------------------------------------------------
  // RIM SLICES (curved edge highlight)
  // -------------------------------------------------------------------------
  if (enableRim) {
    for (let y = baseThickness; y <= H; y++) {
      const relY = y - baseThickness;
      const t = relY / domeHeight;

      // Match shell loop exactly: same profileScale + lip + dynamic thickness
      const sRim = profileScale(t);
      const rA = alShaheedRadius(t, exponentA) * sRim;
      const rB = alShaheedRadius(t, exponentB) * sRim;

      if (rA < 0.02 && rB < 0.02) continue;

      const lip = rimLipFactor(t);
      const dynThickness = dynamicShellThickness(t);

      const rOuterA = rA + lip;
      const rInnerA = Math.max(0, rA - dynThickness);
      const rOuterB = rB + lip;
      const rInnerB = Math.max(0, rB - dynThickness);

      const g = emptyGrid(W, D);
      const rimExtras: SliceExtra[] = [];
      let hasRim = false;

      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          // Shell A cut-face rim
          const dxA = x - cxA;
          if (Math.abs(dxA) <= rimWidth && rA >= 0.02 && isInShellHalf(x, z, cxA, czA, 'A')) {
            const dA = ellipticalDistance(x, z, cxA, czA, rxA, rzA);
            if (dA >= rInnerA && dA <= rOuterA) {
              setCell(g, x, z, "#");
              hasRim = true;
              // Bevel: innermost column of the rim (|dxA| ≤ 1) gets an upside-down stair
              // facing east (into the dome interior), creating a heavy chamfered lip.
              if (Math.abs(dxA) <= 1) {
                rimExtras.push({
                  x, z,
                  blockType: rimBlock + '_stairs',    // "cyan_concrete_stairs"
                  blockState: { facing: 'east', half: 'top', shape: 'straight' },
                });
              }
            }
          }

          // Shell B cut-face rim
          const dxB = x - cxB;
          if (Math.abs(dxB) <= rimWidth && rB >= 0.02 && isInShellHalf(x, z, cxB, czB, 'B')) {
            const dB = ellipticalDistance(x, z, cxB, czB, rxB, rzB);
            if (dB >= rInnerB && dB <= rOuterB) {
              setCell(g, x, z, "#");
              hasRim = true;
              if (Math.abs(dxB) <= 1) {
                rimExtras.push({
                  x, z,
                  blockType: rimBlock + '_stairs',
                  blockState: { facing: 'west', half: 'top', shape: 'straight' },
                });
              }
            }
          }
        }
      }

      if (hasRim) {
        const rimSlice: Slice = { y, block: rimBlock, grid: g.map(row => row.join("")) };
        if (rimExtras.length > 0) rimSlice.extras = rimExtras;
        slices.push(rimSlice);
      }
    }
  }

  console.log(`generateMonumentBlueprint.ts: Generation complete!`);
  console.log(`  - Total slices: ${slices.length}`);
  console.log(`  - Non-empty slices: ${nonEmptySlices}`);
  console.log(`  - Max Y with blocks: ${maxYWithBlocks}`);
  console.log(`  - Total blocks: ~${totalBlocks}`);

  return {
    description: `Al-Shaheed Monument: Two identical half-domes in S-shaped offset. Radius=${shellRadius}, S-offset=${Math.abs(czA - czB)} blocks. 3-step plinth, sculpted inner cavity, structural base lip.`,
    recommended_block_palette: {
      primary: shellBlock,
      secondary: rimBlock,
      base: baseBlock,
    },
    dimensions_estimate: { width: W, depth: D, height: H },
    slices,
  };
}

/**
 * Generates a simpler single split dome for testing.
 */
export function generateSingleSplitDome(
  radius = 12,
  height = 30,
  splitSide: 'left' | 'right' = 'right'
): Blueprint {
  const W = radius * 3;
  const D = radius * 3;
  const H = height;
  const cx = Math.floor(W / 2);
  const cz = Math.floor(D / 2);

  const slices: Slice[] = [];

  for (let y = 0; y <= H; y++) {
    const g = emptyGrid(W, D);
    const t = y / H;
    const r = alShaheedRadius(t, 0.3);

    if (r < 0.01) {
      slices.push({ y, block: "warped_concrete", grid: g.map(row => row.join("")) });
      continue;
    }

    const rOuter = r;
    const rInner = Math.max(0, r - 0.20);

    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        if (splitSide === 'left' && x > cx) continue;
        if (splitSide === 'right' && x < cx) continue;

        const d = ellipticalDistance(x, z, cx, cz, radius, radius);
        if (d >= rInner && d <= rOuter) {
          setCell(g, x, z, "#");
        }
      }
    }

    slices.push({ y, block: "warped_concrete", grid: g.map(row => row.join("")) });
  }

  return {
    description: `Single split Al-Shaheed style dome (${splitSide} half)`,
    recommended_block_palette: {
      primary: "warped_concrete",
      base: "smooth_quartz",
    },
    dimensions_estimate: { width: W, depth: D, height: H },
    slices,
  };
}

export default generateAlShaheedLikeBlueprint;
