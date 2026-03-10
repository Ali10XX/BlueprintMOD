/**
 * voxelizeBlueprint.ts
 * 
 * Pure functions for converting slice-based blueprints into voxel arrays.
 * No side effects - just data transformation.
 */

import type {
  SliceBlueprint,
  BlueprintSlice,
  VoxelInstance,
  VoxelizeResult,
  ValidationResult,
  ValidationError,
} from './blueprintTypes';

/**
 * Validates a slice blueprint for correctness.
 * Checks: presence of slices, grid format, valid characters, rectangular grids.
 * 
 * @param blueprint - The blueprint to validate
 * @returns Validation result with any errors found
 */
export function validateBlueprint(blueprint: SliceBlueprint): ValidationResult {
  const errors: ValidationError[] = [];

  // Check slices exist
  if (!blueprint.slices || !Array.isArray(blueprint.slices)) {
    errors.push({
      type: 'missing_slices',
      message: 'Blueprint must contain a "slices" array',
    });
    return { valid: false, errors };
  }

  if (blueprint.slices.length === 0) {
    errors.push({
      type: 'missing_slices',
      message: 'Blueprint must contain at least one slice',
    });
    return { valid: false, errors };
  }

  // Validate each slice
  blueprint.slices.forEach((slice, sliceIndex) => {
    // Check Y is a valid number
    if (typeof slice.y !== 'number' || !Number.isFinite(slice.y)) {
      errors.push({
        type: 'invalid_y',
        message: `Slice ${sliceIndex}: Y coordinate must be a valid number`,
        sliceIndex,
      });
    }

    // Check grid exists and is array
    if (!slice.grid || !Array.isArray(slice.grid)) {
      errors.push({
        type: 'invalid_grid',
        message: `Slice ${sliceIndex} (y=${slice.y}): grid must be an array of strings`,
        sliceIndex,
      });
      return;
    }

    if (slice.grid.length === 0) {
      errors.push({
        type: 'invalid_grid',
        message: `Slice ${sliceIndex} (y=${slice.y}): grid cannot be empty`,
        sliceIndex,
      });
      return;
    }

    // Check all rows are strings and have same length
    const expectedWidth = slice.grid[0].length;
    slice.grid.forEach((row, rowIndex) => {
      if (typeof row !== 'string') {
        errors.push({
          type: 'invalid_grid',
          message: `Slice ${sliceIndex} (y=${slice.y}), row ${rowIndex}: must be a string`,
          sliceIndex,
          rowIndex,
        });
        return;
      }

      // Check rectangular
      if (row.length !== expectedWidth) {
        errors.push({
          type: 'non_rectangular',
          message: `Slice ${sliceIndex} (y=${slice.y}), row ${rowIndex}: width ${row.length} differs from first row width ${expectedWidth}`,
          sliceIndex,
          rowIndex,
        });
      }

      // Check valid characters (only '.' and '#')
      const invalidChars = row.match(/[^.#]/g);
      if (invalidChars) {
        errors.push({
          type: 'invalid_chars',
          message: `Slice ${sliceIndex} (y=${slice.y}), row ${rowIndex}: invalid characters found: "${[...new Set(invalidChars)].join('')}". Only '.' and '#' are allowed.`,
          sliceIndex,
          rowIndex,
        });
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Converts a single slice to voxel instances.
 * Grid rows = Z axis, columns = X axis.
 *
 * If the slice has `extras`, those positions override the default block type
 * (and carry optional blockState metadata for downstream export).
 * The voxel renderer treats all blocks as full cubes regardless of blockState.
 *
 * @param slice - The slice to convert
 * @returns Array of voxel instances for this slice
 */
function sliceToVoxels(slice: BlueprintSlice): VoxelInstance[] {
  const voxels: VoxelInstance[] = [];

  // Index extras by "x,z" for O(1) override lookup.
  // extras REPLACE the default block at that position, not supplement it.
  const extrasByPos = new Map<string, { blockType: string; blockState?: import('./blueprintTypes').BlockState }>();
  if (slice.extras) {
    for (const extra of slice.extras) {
      extrasByPos.set(`${extra.x},${extra.z}`, extra);
    }
  }

  // Process the ASCII grid. Skip positions covered by an extra (extra takes priority).
  slice.grid.forEach((row, z) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') {
        const key = `${x},${z}`;
        if (!extrasByPos.has(key)) {
          voxels.push({ x, y: slice.y, z, blockType: slice.block || 'unknown' });
        }
      }
    }
  });

  // Emit extras as voxels. Each carries its specific blockType + blockState.
  if (slice.extras) {
    for (const extra of slice.extras) {
      voxels.push({
        x: extra.x,
        y: slice.y,
        z: extra.z,
        blockType: extra.blockType,
        blockState: extra.blockState,
      });
    }
  }

  return voxels;
}

/**
 * Converts a slice blueprint into voxel instances.
 * This is a pure function with no side effects.
 * 
 * @param blueprint - The validated slice blueprint
 * @returns VoxelizeResult containing all voxels and metadata
 */
export function voxelizeBlueprint(blueprint: SliceBlueprint): VoxelizeResult {
  // Convert all slices to voxels.
  // Use a positional Map so later slices (e.g. rim overlays) override earlier ones
  // at the same (x,y,z), eliminating coplanar Z-fighting from overlapping geometry.
  const posMap = new Map<string, VoxelInstance>();

  for (const slice of blueprint.slices) {
    for (const v of sliceToVoxels(slice)) {
      posMap.set(`${v.x},${v.y},${v.z}`, v);
    }
  }

  const allVoxels = Array.from(posMap.values());

  // Calculate bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const voxel of allVoxels) {
    minX = Math.min(minX, voxel.x);
    maxX = Math.max(maxX, voxel.x);
    minY = Math.min(minY, voxel.y);
    maxY = Math.max(maxY, voxel.y);
    minZ = Math.min(minZ, voxel.z);
    maxZ = Math.max(maxZ, voxel.z);
  }

  // Handle empty case
  if (allVoxels.length === 0) {
    minX = maxX = minY = maxY = minZ = maxZ = 0;
  }

  // Collect unique block types
  const blockTypeSet = new Set<string>();
  for (const voxel of allVoxels) {
    blockTypeSet.add(voxel.blockType);
  }

  return {
    voxels: allVoxels,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    blockTypes: Array.from(blockTypeSet),
    totalCount: allVoxels.length,
  };
}

/**
 * Centers voxels around the origin (0, 0, 0).
 * Useful for easier camera positioning.
 * 
 * @param voxels - Array of voxel instances
 * @param bounds - Bounding box from voxelizeBlueprint
 * @returns New array of centered voxel instances
 */
export function centerVoxels(
  voxels: VoxelInstance[],
  bounds: VoxelizeResult['bounds']
): VoxelInstance[] {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = bounds.minY; // Keep base at Y=0
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  return voxels.map(v => ({
    ...v,
    x: v.x - centerX,
    y: v.y - centerY,
    z: v.z - centerZ,
  }));
}

/**
 * Groups voxels by block type for efficient instanced rendering.
 * 
 * @param voxels - Array of voxel instances
 * @returns Map of block type to array of voxel positions
 */
export function groupVoxelsByBlockType(
  voxels: VoxelInstance[]
): Map<string, VoxelInstance[]> {
  const groups = new Map<string, VoxelInstance[]>();

  for (const voxel of voxels) {
    if (!groups.has(voxel.blockType)) {
      groups.set(voxel.blockType, []);
    }
    groups.get(voxel.blockType)!.push(voxel);
  }

  return groups;
}

/**
 * Gets all unique Y levels from voxels, sorted ascending.
 * 
 * @param voxels - Array of voxel instances
 * @returns Sorted array of unique Y values
 */
export function getUniqueYLevels(voxels: VoxelInstance[]): number[] {
  const ySet = new Set<number>();
  for (const voxel of voxels) {
    ySet.add(voxel.y);
  }
  return Array.from(ySet).sort((a, b) => a - b);
}
