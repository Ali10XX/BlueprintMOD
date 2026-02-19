/**
 * blueprintTypes.ts
 * 
 * TypeScript types for the slice-based Minecraft blueprint format.
 * This format represents structures layer-by-layer using ASCII grid patterns.
 */

/**
 * Minecraft block state properties.
 * All fields are optional; only include what differs from the block's default.
 * Preserved verbatim for export to .mcstructure / .schem — not used by the
 * voxel renderer (which treats every block as a full cube).
 *
 * Examples:
 *   cyan_concrete_stairs  →  { facing: 'north', half: 'bottom', shape: 'straight' }
 *   cyan_concrete_slab    →  { type: 'bottom' }
 *   smooth_quartz_slab    →  { type: 'top' }
 */
export interface BlockState {
  /** Cardinal direction the block "faces" (stairs: direction of ascent) */
  facing?: 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
  /** Whether the stair/slab occupies the top or bottom half of the block space */
  half?: 'top' | 'bottom';
  /** Stair corner shape */
  shape?: 'straight' | 'inner_left' | 'inner_right' | 'outer_left' | 'outer_right';
  /** Slab position: 'top', 'bottom', or 'double' (full block) */
  type?: 'top' | 'bottom' | 'double';
}

/**
 * A per-cell block override within a slice.
 * Overrides the base `block` type for the cell at (x, z) with a richer block
 * (e.g. a stair or slab) and optional block state metadata.
 * The ASCII grid still marks this cell '#' — the override is applied by the
 * voxelizer at export time, not during preview rendering.
 */
export interface SliceExtra {
  x: number;
  z: number;
  /** Block type for this cell, e.g. "cyan_concrete_stairs" */
  blockType: string;
  /** Optional Minecraft block state properties */
  blockState?: BlockState;
}

/** Represents a single horizontal slice at a given Y level */
export interface BlueprintSlice {
  /** The Y coordinate (height) of this slice */
  y: number;
  /** The default block type for '#' cells in this slice (e.g., "smooth_quartz") */
  block: string;
  /**
   * ASCII grid where '#' = block, '.' = air
   * Rows represent Z axis, columns represent X axis
   */
  grid: string[];
  /**
   * Per-cell block overrides. Each entry replaces the default `block` type
   * at that (x, z) position with a specific block + optional block state.
   * Used for stairs, slabs, and other sub-block detail.
   * Absent = all '#' cells use the slice's `block` type.
   */
  extras?: SliceExtra[];
}

/** Recommended block palette for the structure */
export interface BlockPalette {
  primary?: string;
  secondary?: string;
  base?: string;
  [key: string]: string | undefined;
}

/** Estimated dimensions of the structure */
export interface DimensionsEstimate {
  width: number;
  depth: number;
  height: number;
}

/** The complete slice blueprint JSON format */
export interface SliceBlueprint {
  /** Human-readable description of the structure */
  description?: string;
  /** Recommended blocks for different parts */
  recommended_block_palette?: BlockPalette;
  /** Estimated overall dimensions */
  dimensions_estimate?: DimensionsEstimate;
  /** Array of horizontal slices defining the structure */
  slices: BlueprintSlice[];
}

/** A single voxel instance with position, block type, and optional block state */
export interface VoxelInstance {
  x: number;
  y: number;
  z: number;
  blockType: string;
  /** Preserved from SliceExtra for downstream export; not used by the voxel renderer */
  blockState?: BlockState;
}

/** Result of voxelizing a blueprint */
export interface VoxelizeResult {
  /** All voxel instances */
  voxels: VoxelInstance[];
  /** Bounding box of the structure */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Unique block types found */
  blockTypes: string[];
  /** Total number of voxels */
  totalCount: number;
}

/** Validation error for malformed blueprints */
export interface ValidationError {
  type: 'missing_slices' | 'invalid_grid' | 'invalid_chars' | 'non_rectangular' | 'invalid_y';
  message: string;
  sliceIndex?: number;
  rowIndex?: number;
}

/** Result of blueprint validation */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
