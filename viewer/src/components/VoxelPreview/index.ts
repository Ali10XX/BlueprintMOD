/**
 * VoxelPreview module - barrel export
 * 
 * Exports all public types and components for the VoxelPreview system.
 */

// Types
export type {
  SliceBlueprint,
  BlueprintSlice,
  BlockPalette,
  DimensionsEstimate,
  VoxelInstance,
  VoxelizeResult,
  ValidationResult,
  ValidationError,
} from './blueprintTypes';

// Utility functions
export {
  validateBlueprint,
  voxelizeBlueprint,
  centerVoxels,
  groupVoxelsByBlockType,
  getUniqueYLevels,
} from './voxelizeBlueprint';

// Components
export { VoxelPreview, type VoxelPreviewProps } from './VoxelPreview';
export { default } from './VoxelPreview';
