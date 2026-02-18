# VoxelPreview Component

A high-performance 3D voxel previewer for Minecraft slice-based blueprints.

## Installation

Dependencies are already installed in the project:
- `three` (Three.js)
- `@react-three/fiber` (React Three Fiber)
- `@react-three/drei` (Helpers for R3F)

If starting fresh:
```bash
npm install three @react-three/fiber @react-three/drei @types/three
```

## Quick Start

### Option 1: Use the Demo Page

Replace your App.tsx temporarily to see the demo:

```tsx
// src/App.tsx
import { VoxelPreviewDemo } from './components/VoxelPreview/VoxelPreviewDemo';

function App() {
  return <VoxelPreviewDemo />;
}

export default App;
```

### Option 2: Use VoxelPreview Directly

```tsx
import { VoxelPreview } from './components/VoxelPreview';
import type { SliceBlueprint } from './components/VoxelPreview';

const myBlueprint: SliceBlueprint = {
  slices: [
    {
      y: 0,
      block: "stone",
      grid: [
        "###",
        "#.#",
        "###"
      ]
    },
    {
      y: 1,
      block: "oak_planks",
      grid: [
        "...",
        ".#.",
        "..."
      ]
    }
  ]
};

function MyComponent() {
  return (
    <div className="w-full h-screen">
      <VoxelPreview 
        blueprint={myBlueprint}
        scale={1}
        centerByDefault={true}
      />
    </div>
  );
}
```

## Blueprint Format

```typescript
interface SliceBlueprint {
  description?: string;
  recommended_block_palette?: {
    primary?: string;
    secondary?: string;
    base?: string;
    [key: string]: string | undefined;
  };
  dimensions_estimate?: {
    width: number;
    depth: number;
    height: number;
  };
  slices: Array<{
    y: number;       // Y coordinate (height)
    block: string;   // Block type name
    grid: string[];  // ASCII art: '#' = block, '.' = air
  }>;
}
```

### Grid Conventions
- Each row in `grid` represents the Z axis
- Each character in a row represents the X axis
- `#` = place a block
- `.` = air (empty)

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `blueprint` | `SliceBlueprint` | required | The blueprint JSON object |
| `scale` | `number` | `1` | Scale factor for voxel size |
| `centerByDefault` | `boolean` | `true` | Center model at origin |
| `className` | `string` | `''` | Additional CSS class |

## Features

- **High Performance**: Uses InstancedMesh for up to ~200k voxels
- **Y-Layer Slider**: Show voxels up to a certain height
- **Show Base Only**: View only the bottom layer
- **Stats Display**: Total voxels, visible voxels, block types
- **OrbitControls**: Rotate, pan, zoom
- **Center Model**: Toggle centering at origin
- **Validation**: Clear error messages for malformed JSON

## Utility Functions

```typescript
import {
  validateBlueprint,
  voxelizeBlueprint,
  centerVoxels,
  groupVoxelsByBlockType,
  getUniqueYLevels,
} from './components/VoxelPreview';

// Validate before processing
const validation = validateBlueprint(blueprint);
if (!validation.valid) {
  console.error(validation.errors);
}

// Convert to voxels
const result = voxelizeBlueprint(blueprint);
console.log(`Total: ${result.totalCount} voxels`);
console.log(`Bounds: ${JSON.stringify(result.bounds)}`);
console.log(`Block types: ${result.blockTypes.join(', ')}`);
```

## Adding New Block Colors

Edit `VoxelPreview.tsx` and add to `PREVIEW_BLOCK_COLORS`:

```typescript
const PREVIEW_BLOCK_COLORS: Record<string, string> = {
  // ... existing colors ...
  'my_custom_block': '#ff00ff',
};
```

## Running the Demo

```bash
cd viewer
npm run dev
```

Then open http://localhost:5173

## File Structure

```
src/components/VoxelPreview/
├── blueprintTypes.ts      # TypeScript types
├── voxelizeBlueprint.ts   # Pure conversion functions
├── VoxelPreview.tsx       # Main React component
├── VoxelPreviewDemo.tsx   # Demo page with sample data
├── index.ts               # Barrel exports
└── USAGE.md               # This file
```
