/**
 * VoxelPreviewDemo.tsx
 * 
 * Demo page showcasing the VoxelPreview component with a sample blueprint.
 * Features the Al-Shaheed (Martyr's) Monument reconstruction.
 */

import { useState } from 'react';
import { VoxelPreview } from './VoxelPreview';
import type { SliceBlueprint } from './blueprintTypes';

// ============================================================================
// SAMPLE BLUEPRINT - Al-Shaheed Monument
// ============================================================================

/**
 * Sample blueprint: Al-Shaheed (Martyr's) Monument
 * Features two offset turquoise semi-domes on a circular platform.
 */
const SAMPLE_BLUEPRINT: SliceBlueprint = {
  description: "A Minecraft reconstruction of the Al-Shaheed (Martyr's) Monument, featuring two offset turquoise semi-domes (onion-shaped) situated on a circular platform with a central sculpture.",
  recommended_block_palette: {
    primary: "warped_concrete",
    secondary: "cyan_terracotta",
    base: "smooth_quartz"
  },
  dimensions_estimate: {
    width: 45,
    depth: 35,
    height: 40
  },
  slices: [
    {
      y: 0,
      block: "smooth_quartz",
      grid: [
        "......#########......",
        "....#############....",
        "..#################..",
        ".###################.",
        "#####################",
        ".###################.",
        "..#################..",
        "....#############....",
        "......#########......"
      ]
    },
    {
      y: 5,
      block: "warped_concrete",
      grid: [
        "#######.......#######",
        "#########...#########",
        "#########...#########",
        "#########...#########",
        ".#######.....#######.",
        "..#####.......#####.."
      ]
    },
    {
      y: 15,
      block: "warped_concrete",
      grid: [
        "#########...#########",
        "##########.##########",
        "##########.##########",
        "##########.##########",
        ".########...########.",
        "..######.....######.."
      ]
    },
    {
      y: 25,
      block: "warped_concrete",
      grid: [
        "....#####...#####....",
        "...#######.#######...",
        "...#######.#######...",
        "...#######.#######...",
        "....#####...#####....",
        ".....###.....###....."
      ]
    },
    {
      y: 35,
      block: "warped_concrete",
      grid: [
        ".......##...##.......",
        "......####.####......",
        "......####.####......",
        ".......##...##.......",
        "........#...#........"
      ]
    },
    {
      y: 40,
      block: "warped_concrete",
      grid: [
        "........#...#........"
      ]
    }
  ]
};

// ============================================================================
// DEMO COMPONENT
// ============================================================================

export function VoxelPreviewDemo() {
  const [scale, setScale] = useState(1);
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="w-full h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <div className="bg-slate-800/95 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            VoxelPreview Demo
          </h1>
          <p className="text-sm text-gray-400">
            Al-Shaheed Monument Blueprint
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {/* Scale control */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Scale:</label>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-24 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <span className="text-sm text-cyan-300 font-mono w-12">{scale.toFixed(1)}x</span>
          </div>

          {/* Show JSON button */}
          <button
            onClick={() => setShowJson(!showJson)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showJson 
                ? 'bg-cyan-600 text-white' 
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
          >
            {showJson ? 'Hide JSON' : 'View JSON'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 3D Preview */}
        <div className={`flex-1 ${showJson ? 'w-1/2' : 'w-full'}`}>
          <VoxelPreview
            blueprint={SAMPLE_BLUEPRINT}
            scale={scale}
            centerByDefault={true}
          />
        </div>

        {/* JSON Panel */}
        {showJson && (
          <div className="w-1/2 bg-slate-900 border-l border-slate-700 overflow-auto">
            <div className="p-4">
              <h3 className="text-lg font-bold text-cyan-400 mb-4">Blueprint JSON</h3>
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                {JSON.stringify(SAMPLE_BLUEPRINT, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VoxelPreviewDemo;
