/**
 * VoxelPreview.tsx
 * 
 * React component for previewing slice-based Minecraft blueprints in 3D.
 * Uses react-three-fiber with InstancedMesh for high-performance rendering
 * of up to ~200k voxels.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';

import type { SliceBlueprint, VoxelInstance, VoxelizeResult } from './blueprintTypes';
import {
  validateBlueprint,
  voxelizeBlueprint,
  centerVoxels,
  groupVoxelsByBlockType,
} from './voxelizeBlueprint';

// ============================================================================
// BLOCK COLOR MAPPING
// ============================================================================

/** 
 * Preview colors for Minecraft block types.
 * Add new blocks here as needed.
 */
const PREVIEW_BLOCK_COLORS: Record<string, string> = {
  // Requested blocks
  'warped_concrete': '#1a8a8a',       // Teal
  'cyan_terracotta': '#4a8a8a',       // Blue-green
  'smooth_quartz': '#f0f0f0',         // White
  
  // Common blocks
  'stone': '#7d7d7d',
  'cobblestone': '#6b6b6b',
  'oak_planks': '#bc9862',
  'spruce_planks': '#735431',
  'birch_planks': '#c5b77a',
  'white_concrete': '#cfd5d6',
  'gray_concrete': '#36393d',
  'black_concrete': '#080a0f',
  'quartz_block': '#ececdf',
  'sandstone': '#d9cc8f',
  'red_sandstone': '#b85c2b',
  'prismarine': '#5f9a9a',
  'dark_prismarine': '#3a5f5f',
  'nether_bricks': '#2d1518',
  'obsidian': '#1a0a24',
  'glass': '#c0d5d580',
  
  // Terracotta variants
  'terracotta': '#985f45',
  'white_terracotta': '#d1b2a1',
  'light_gray_terracotta': '#876a61',
  
  // Concrete variants
  'orange_concrete': '#e06101',
  'blue_concrete': '#2d2f8f',
  'red_concrete': '#8e2121',
  'lime_concrete': '#5ea918',
  'yellow_concrete': '#f1af15',
  
  // Wood types
  'oak_log': '#6b5130',
  'dark_oak_planks': '#4a3321',
  'acacia_planks': '#ba6337',
  
  // Nether blocks
  'warped_planks': '#2d7a7a',
  'crimson_planks': '#7a3344',
  'basalt': '#4a4a4a',
  'blackstone': '#2d2a2d',
  
  // Metal/ore
  'iron_block': '#d8d8d8',
  'gold_block': '#f9d849',
  'diamond_block': '#62ede6',
  'emerald_block': '#41d979',
  'copper_block': '#c06e4f',
  
  // Misc
  'dirt': '#8b6b4a',
  'grass_block': '#5d9c4a',
  'sand': '#dbd3a0',
  'gravel': '#8a8279',
  'clay': '#9ea4b0',
  'snow_block': '#f0f0f0',
  'ice': '#92b5e8',
  'packed_ice': '#8aaae4',
  
  // Fallback
  'unknown': '#808080',
};

/**
 * Gets preview color for a block type.
 * Strips 'minecraft:' prefix if present.
 */
function getPreviewColor(blockType: string): string {
  // Strip minecraft: prefix
  const cleanType = blockType.replace('minecraft:', '');
  return PREVIEW_BLOCK_COLORS[cleanType] || PREVIEW_BLOCK_COLORS['unknown'];
}

// ============================================================================
// INSTANCED VOXEL MESH COMPONENT
// ============================================================================

interface InstancedVoxelMeshProps {
  voxels: VoxelInstance[];
  blockType: string;
  scale: number;
  visibleMaxY: number;
  showBaseOnly: boolean;
  baseY: number;
}

/**
 * Renders voxels of a single block type using InstancedMesh.
 * Highly efficient for large numbers of identical cubes.
 */
function InstancedVoxelMesh({
  voxels,
  blockType,
  scale,
  visibleMaxY,
  showBaseOnly,
  baseY,
}: InstancedVoxelMeshProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);

  // Filter visible voxels based on Y constraints
  const visibleVoxels = useMemo(() => {
    return voxels.filter(v => {
      if (showBaseOnly) {
        return v.y === baseY;
      }
      return v.y <= visibleMaxY;
    });
  }, [voxels, visibleMaxY, showBaseOnly, baseY]);

  // Update instance matrices when visibility changes
  useEffect(() => {
    if (!meshRef.current) return;

    // console.log(`VoxelPreview: Updating ${visibleVoxels.length} instances for ${blockType}`);

    visibleVoxels.forEach((voxel, i) => {
      tempPosition.set(
        voxel.x * scale,
        voxel.y * scale,
        voxel.z * scale
      );
      tempMatrix.makeTranslation(tempPosition.x, tempPosition.y, tempPosition.z);
      tempMatrix.scale(new THREE.Vector3(scale, scale, scale));
      meshRef.current!.setMatrixAt(i, tempMatrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.count = visibleVoxels.length;
  }, [visibleVoxels, scale, tempMatrix, tempPosition, blockType]);

  // Allocate mesh with max capacity
  const maxCount = voxels.length;

  if (maxCount === 0) return null;

  const color = getPreviewColor(blockType);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, maxCount]}
      frustumCulled={false}
    >
      <boxGeometry args={[0.98, 0.98, 0.98]} />
      <meshLambertMaterial color={color} />
    </instancedMesh>
  );
}

// ============================================================================
// SCENE CONTENT COMPONENT
// ============================================================================

interface SceneContentProps {
  voxelResult: VoxelizeResult;
  centered: boolean;
  scale: number;
  visibleMaxY: number;
  showBaseOnly: boolean;
}

/**
 * Main scene content - renders all voxel groups and scene elements.
 */
function SceneContent({
  voxelResult,
  centered,
  scale,
  visibleMaxY,
  showBaseOnly,
}: SceneContentProps) {
  // Center voxels if requested
  const voxels = useMemo(() => {
    if (centered) {
      return centerVoxels(voxelResult.voxels, voxelResult.bounds);
    }
    return voxelResult.voxels;
  }, [voxelResult, centered]);

  // Group voxels by block type for instanced rendering
  const voxelGroups = useMemo(() => {
    return groupVoxelsByBlockType(voxels);
  }, [voxels]);

  // Calculate center point for camera target
  const center = useMemo(() => {
    if (centered) {
      return new THREE.Vector3(0, 0, 0);
    }
    const { bounds } = voxelResult;
    return new THREE.Vector3(
      ((bounds.minX + bounds.maxX) / 2) * scale,
      ((bounds.minY + bounds.maxY) / 2) * scale,
      ((bounds.minZ + bounds.maxZ) / 2) * scale
    );
  }, [voxelResult, centered, scale]);

  // Base Y for "show base only" mode
  const baseY = centered ? 0 : voxelResult.bounds.minY;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={0.7} />
      <directionalLight position={[-10, 15, -10]} intensity={0.3} />
      <pointLight position={[0, 30, 0]} intensity={0.4} />

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={5}
        maxDistance={500}
        target={center}
      />

      {/* Ground grid */}
      <Grid
        position={[center.x, (centered ? 0 : voxelResult.bounds.minY * scale) - 0.01, center.z]}
        args={[200, 200]}
        cellSize={scale}
        cellThickness={0.5}
        cellColor="#3a4a5a"
        sectionSize={10 * scale}
        sectionThickness={1}
        sectionColor="#4a5a6a"
        fadeDistance={150}
        fadeStrength={1}
        followCamera={false}
      />

      {/* Render each block type as an instanced mesh */}
      {Array.from(voxelGroups.entries()).map(([blockType, blockVoxels]) => (
        <InstancedVoxelMesh
          key={blockType}
          voxels={blockVoxels}
          blockType={blockType}
          scale={scale}
          visibleMaxY={visibleMaxY}
          showBaseOnly={showBaseOnly}
          baseY={baseY}
        />
      ))}

      {/* Subtle environment lighting */}
      <Environment preset="city" background={false} />
    </>
  );
}

// ============================================================================
// CONTROLS PANEL COMPONENT
// ============================================================================

interface ControlsPanelProps {
  voxelResult: VoxelizeResult;
  visibleMaxY: number;
  setVisibleMaxY: (y: number) => void;
  showBaseOnly: boolean;
  setShowBaseOnly: (show: boolean) => void;
  centered: boolean;
  setCentered: (center: boolean) => void;
  visibleCount: number;
}

/**
 * UI controls panel for layer visibility and stats.
 */
function ControlsPanel({
  voxelResult,
  visibleMaxY,
  setVisibleMaxY,
  showBaseOnly,
  setShowBaseOnly,
  centered,
  setCentered,
  visibleCount,
}: ControlsPanelProps) {
  const { bounds, totalCount, blockTypes } = voxelResult;

  return (
    <div className="absolute top-4 right-4 bg-slate-800/95 backdrop-blur rounded-xl p-4 w-72 text-white shadow-xl">
      <h3 className="text-lg font-bold mb-4 text-cyan-400">Voxel Preview</h3>

      {/* Stats */}
      <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-400">Total voxels:</span>
            <span className="float-right font-mono text-cyan-300">{totalCount.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-400">Visible:</span>
            <span className="float-right font-mono text-green-300">{visibleCount.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-400">Block types:</span>
            <span className="float-right font-mono text-yellow-300">{blockTypes.length}</span>
          </div>
          <div>
            <span className="text-gray-400">Y range:</span>
            <span className="float-right font-mono">{bounds.minY} - {bounds.maxY}</span>
          </div>
        </div>
      </div>

      {/* Block type legend */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 block mb-2">Block Types</label>
        <div className="flex flex-wrap gap-1">
          {blockTypes.map(type => (
            <div
              key={type}
              className="flex items-center gap-1 px-2 py-1 bg-slate-700/50 rounded text-xs"
              title={type}
            >
              <div
                className="w-3 h-3 rounded-sm border border-white/30"
                style={{ backgroundColor: getPreviewColor(type) }}
              />
              <span className="truncate max-w-20">{type.replace('minecraft:', '')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Y-Layer Slider */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 block mb-2">
          Y Layer: {visibleMaxY} / {bounds.maxY}
        </label>
        <input
          type="range"
          min={bounds.minY}
          max={bounds.maxY}
          value={visibleMaxY}
          onChange={(e) => setVisibleMaxY(Number(e.target.value))}
          disabled={showBaseOnly}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
        />
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>Y={bounds.minY}</span>
          <span>Y={bounds.maxY}</span>
        </div>
      </div>

      {/* Show Base Only */}
      <div className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showBaseOnly}
            onChange={(e) => setShowBaseOnly(e.target.checked)}
            className="w-4 h-4 accent-cyan-500"
          />
          <span className="text-sm">Show base only (Y=0)</span>
        </label>
      </div>

      {/* Center Model */}
      <div className="mb-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={centered}
            onChange={(e) => setCentered(e.target.checked)}
            className="w-4 h-4 accent-cyan-500"
          />
          <span className="text-sm">Center model at origin</span>
        </label>
      </div>

      {/* Keyboard hints */}
      <div className="text-xs text-gray-500 border-t border-slate-600 pt-3 mt-3">
        <p>🖱️ Left drag: Rotate</p>
        <p>🖱️ Right drag: Pan</p>
        <p>🖱️ Scroll: Zoom</p>
      </div>
    </div>
  );
}

// ============================================================================
// ERROR DISPLAY COMPONENT
// ============================================================================

interface ErrorDisplayProps {
  title: string;
  errors: string[];
}

/**
 * Displays validation or parsing errors.
 */
function ErrorDisplay({ title, errors }: ErrorDisplayProps) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-900">
      <div className="bg-red-900/50 border border-red-500 rounded-xl p-6 max-w-lg">
        <h3 className="text-xl font-bold text-red-400 mb-4">❌ {title}</h3>
        <ul className="space-y-2">
          {errors.map((error, i) => (
            <li key={i} className="text-red-200 text-sm font-mono">
              • {error}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN VOXEL PREVIEW COMPONENT
// ============================================================================

export interface VoxelPreviewProps {
  /** The slice blueprint JSON object */
  blueprint: SliceBlueprint;
  /** Scale factor for voxel size (default: 1) */
  scale?: number;
  /** Whether to center the model at origin by default */
  centerByDefault?: boolean;
  /** Additional CSS class for the container */
  className?: string;
}

/**
 * VoxelPreview - Main component for previewing slice-based Minecraft blueprints.
 * 
 * Features:
 * - High-performance InstancedMesh rendering (handles ~200k voxels)
 * - Y-layer slider to show voxels up to a certain height
 * - "Show base only" checkbox
 * - Voxel count statistics
 * - OrbitControls for navigation
 * - Center model function
 * - Validation with clear error messages
 * 
 * @example
 * ```tsx
 * <VoxelPreview 
 *   blueprint={myBlueprintJSON} 
 *   scale={1} 
 *   centerByDefault={true}
 * />
 * ```
 */
export function VoxelPreview({
  blueprint,
  scale = 1,
  centerByDefault = true,
  className = '',
}: VoxelPreviewProps) {
  // Validate blueprint
  const validation = useMemo(() => validateBlueprint(blueprint), [blueprint]);

  // Convert to voxels (only if valid)
  const voxelResult = useMemo(() => {
    if (!validation.valid) return null;
    
    console.log('VoxelPreview: Voxelizing blueprint...');
    const result = voxelizeBlueprint(blueprint);
    console.log(`VoxelPreview: Generated ${result.totalCount} voxels from ${blueprint.slices.length} slices`);
    console.log(`VoxelPreview: Bounds: X[${result.bounds.minX}-${result.bounds.maxX}] Y[${result.bounds.minY}-${result.bounds.maxY}] Z[${result.bounds.minZ}-${result.bounds.maxZ}]`);
    console.log(`VoxelPreview: Block types: ${result.blockTypes.join(', ')}`);
    
    return result;
  }, [blueprint, validation.valid]);

  // UI State
  const [visibleMaxY, setVisibleMaxY] = useState(0);
  const [showBaseOnly, setShowBaseOnly] = useState(false);
  const [centered, setCentered] = useState(centerByDefault);

  // Initialize visibleMaxY when voxelResult changes
  useEffect(() => {
    if (voxelResult) {
      setVisibleMaxY(voxelResult.bounds.maxY);
    }
  }, [voxelResult]);

  // Calculate visible voxel count
  const visibleCount = useMemo(() => {
    if (!voxelResult) return 0;
    
    const baseY = centered ? 0 : voxelResult.bounds.minY;
    return voxelResult.voxels.filter(v => {
      if (showBaseOnly) return v.y === (centered ? 0 : voxelResult.bounds.minY);
      return v.y <= visibleMaxY;
    }).length;
  }, [voxelResult, visibleMaxY, showBaseOnly, centered]);

  // Handle validation errors
  if (!validation.valid) {
    return (
      <ErrorDisplay
        title="Invalid Blueprint"
        errors={validation.errors.map(e => e.message)}
      />
    );
  }

  // Handle empty result
  if (!voxelResult || voxelResult.totalCount === 0) {
    return (
      <ErrorDisplay
        title="Empty Blueprint"
        errors={['No voxels found in the blueprint. All grids might be empty or contain only air (".") characters.']}
      />
    );
  }

  // Calculate camera position based on structure size
  const { bounds } = voxelResult;
  const maxDim = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
    10
  ) * scale;
  const cameraDistance = maxDim * 2;

  return (
    <div className={`relative w-full h-full ${className}`}>
      <Canvas
        camera={{
          position: [cameraDistance, cameraDistance * 0.8, cameraDistance],
          fov: 50,
          near: 0.1,
          far: 2000,
        }}
      >
        <color attach="background" args={['#0f172a']} />
        <SceneContent
          voxelResult={voxelResult}
          centered={centered}
          scale={scale}
          visibleMaxY={visibleMaxY}
          showBaseOnly={showBaseOnly}
        />
      </Canvas>

      <ControlsPanel
        voxelResult={voxelResult}
        visibleMaxY={visibleMaxY}
        setVisibleMaxY={setVisibleMaxY}
        showBaseOnly={showBaseOnly}
        setShowBaseOnly={setShowBaseOnly}
        centered={centered}
        setCentered={setCentered}
        visibleCount={visibleCount}
      />
    </div>
  );
}

export default VoxelPreview;
