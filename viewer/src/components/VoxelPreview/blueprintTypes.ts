/**
 * blueprintTypes.ts
 * 
 * TypeScript types for the slice-based Minecraft blueprint format.
 * This format represents structures layer-by-layer using ASCII grid patterns.
 */

/** Represents a single horizontal slice at a given Y level */
export interface BlueprintSlice {
  /** The Y coordinate (height) of this slice */
  y: number;
  /** The block type to use for this slice (e.g., "smooth_quartz") */
  block: string;
  /** 
   * ASCII grid where '#' = block, '.' = air
   * Rows represent Z axis, columns represent X axis
   */
  grid: string[];
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

/** A single voxel instance with position and block type */
export interface VoxelInstance {
  x: number;
  y: number;
  z: number;
  blockType: string;
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
