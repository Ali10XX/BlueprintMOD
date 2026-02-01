import { create } from 'zustand';
import type { Block, Size3D, SliceState } from '../types';

interface BlueprintState {
  // Blueprint data
  blocks: Block[];
  size: Size3D;
  name: string;

  // Slice controls
  slice: SliceState;

  // Actions
  setBlocks: (blocks: Block[], size: Size3D, name?: string) => void;
  clearBlocks: () => void;
  setSliceAxis: (axis: 'x' | 'y' | 'z') => void;
  setSliceLayer: (layer: number) => void;
  setSliceMode: (mode: 'single' | 'range' | 'all') => void;

  // Computed
  getVisibleBlocks: () => Block[];
  getMaterialCounts: () => Map<string, number>;
}

export const useBlueprintStore = create<BlueprintState>((set, get) => ({
  blocks: [],
  size: { x: 0, y: 0, z: 0 },
  name: '',

  slice: {
    axis: 'y',
    layer: 0,
    mode: 'all',
    maxLayers: { x: 0, y: 0, z: 0 },
  },

  setBlocks: (blocks, size, name = 'Blueprint') => {
    set({
      blocks,
      size,
      name,
      slice: {
        axis: 'y',
        layer: size.y - 1,
        mode: 'all',
        maxLayers: { x: size.x - 1, y: size.y - 1, z: size.z - 1 },
      },
    });
  },

  clearBlocks: () => {
    set({
      blocks: [],
      size: { x: 0, y: 0, z: 0 },
      name: '',
      slice: {
        axis: 'y',
        layer: 0,
        mode: 'all',
        maxLayers: { x: 0, y: 0, z: 0 },
      },
    });
  },

  setSliceAxis: (axis) => {
    const { slice } = get();
    const maxLayer = slice.maxLayers[axis];
    set({
      slice: {
        ...slice,
        axis,
        layer: Math.min(slice.layer, maxLayer),
      },
    });
  },

  setSliceLayer: (layer) => {
    const { slice } = get();
    const maxLayer = slice.maxLayers[slice.axis];
    set({
      slice: {
        ...slice,
        layer: Math.max(0, Math.min(layer, maxLayer)),
      },
    });
  },

  setSliceMode: (mode) => {
    set((state) => ({
      slice: { ...state.slice, mode },
    }));
  },

  getVisibleBlocks: () => {
    const { blocks, slice } = get();

    if (slice.mode === 'all') {
      return blocks;
    }

    return blocks.filter((block) => {
      const value = block[slice.axis];
      if (slice.mode === 'single') {
        return value === slice.layer;
      }
      // range mode: show from 0 to layer
      return value <= slice.layer;
    });
  },

  getMaterialCounts: () => {
    const { blocks } = get();
    const counts = new Map<string, number>();

    for (const block of blocks) {
      counts.set(block.type, (counts.get(block.type) || 0) + 1);
    }

    return counts;
  },
}));
