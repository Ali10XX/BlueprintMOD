/**
 * multiViewReconstructor.ts - Multi-View 3D Reconstruction Engine
 * 
 * This module combines block detections from multiple video frames to create
 * a more accurate 3D voxel model. It handles:
 * - Merging overlapping detections
 * - Confidence voting across frames
 * - Gap filling using structural priors
 * - Conflict resolution
 */

import type { Block, Size3D } from '../../types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Extended block with reconstruction metadata */
export interface ReconstructedBlock extends Block {
  confidence: number;      // 0-1 confidence score
  voteCount: number;       // Number of frames that detected this block
  frameIndices: number[];  // Which frames detected it
  states?: Record<string, unknown>;
  depthLayer?: number;
}

/** Detection result from a single frame */
export interface FrameDetection {
  frameIndex: number;
  blocks: Block[];
  viewEstimate?: {
    viewDirection?: string;
    buildStyle?: string;
  };
}

/** Voxel grid for accumulating votes */
interface VoxelVote {
  types: Map<string, number>;  // block type -> vote count
  totalVotes: number;
  frameIndices: Set<number>;
  states: Map<string, Record<string, unknown>>;  // type -> most common states
}

/** Reconstruction options */
export interface ReconstructionOptions {
  /** Minimum votes required to include a block (default: 1) */
  minVotes?: number;
  
  /** Minimum confidence threshold (default: 0.3) */
  minConfidence?: number;
  
  /** Whether to fill gaps in structures (default: true) */
  fillGaps?: boolean;
  
  /** Maximum gap size to fill (default: 2) */
  maxGapSize?: number;
  
  /** Apply structural priors (walls, floors, etc.) (default: true) */
  useStructuralPriors?: boolean;
  
  /** Progress callback */
  onProgress?: (stage: string, progress: number) => void;
}

/** Reconstruction result */
export interface ReconstructionResult {
  blocks: ReconstructedBlock[];
  size: Size3D;
  stats: {
    totalFrames: number;
    totalDetections: number;
    uniquePositions: number;
    highConfidenceBlocks: number;
    gapsFilled: number;
    conflictsResolved: number;
  };
}

// ============================================================================
// VOXEL GRID
// ============================================================================

/**
 * VoxelGrid - Spatial data structure for accumulating block votes
 */
class VoxelGrid {
  private grid: Map<string, VoxelVote> = new Map();
  private minBounds = { x: Infinity, y: Infinity, z: Infinity };
  private maxBounds = { x: -Infinity, y: -Infinity, z: -Infinity };

  /**
   * Creates a key for a voxel position
   */
  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /**
   * Parses a key back to coordinates
   */
  private parseKey(key: string): { x: number; y: number; z: number } {
    const [x, y, z] = key.split(',').map(Number);
    return { x, y, z };
  }

  /**
   * Adds a vote for a block at a position
   */
  addVote(
    x: number, 
    y: number, 
    z: number, 
    blockType: string, 
    frameIndex: number,
    states?: Record<string, unknown>
  ): void {
    const k = this.key(x, y, z);
    
    if (!this.grid.has(k)) {
      this.grid.set(k, {
        types: new Map(),
        totalVotes: 0,
        frameIndices: new Set(),
        states: new Map(),
      });
    }
    
    const vote = this.grid.get(k)!;
    vote.types.set(blockType, (vote.types.get(blockType) || 0) + 1);
    vote.totalVotes++;
    vote.frameIndices.add(frameIndex);
    
    // Track states for this block type
    if (states && Object.keys(states).length > 0) {
      if (!vote.states.has(blockType)) {
        vote.states.set(blockType, states);
      }
    }
    
    // Update bounds
    this.minBounds.x = Math.min(this.minBounds.x, x);
    this.minBounds.y = Math.min(this.minBounds.y, y);
    this.minBounds.z = Math.min(this.minBounds.z, z);
    this.maxBounds.x = Math.max(this.maxBounds.x, x);
    this.maxBounds.y = Math.max(this.maxBounds.y, y);
    this.maxBounds.z = Math.max(this.maxBounds.z, z);
  }

  /**
   * Gets the vote data at a position
   */
  getVote(x: number, y: number, z: number): VoxelVote | undefined {
    return this.grid.get(this.key(x, y, z));
  }

  /**
   * Checks if a position has any votes
   */
  hasVote(x: number, y: number, z: number): boolean {
    return this.grid.has(this.key(x, y, z));
  }

  /**
   * Gets the grid bounds
   */
  getBounds(): { min: typeof this.minBounds; max: typeof this.maxBounds } {
    return { min: { ...this.minBounds }, max: { ...this.maxBounds } };
  }

  /**
   * Gets the size of the structure
   */
  getSize(): Size3D {
    if (this.grid.size === 0) {
      return { x: 0, y: 0, z: 0 };
    }
    return {
      x: this.maxBounds.x - this.minBounds.x + 1,
      y: this.maxBounds.y - this.minBounds.y + 1,
      z: this.maxBounds.z - this.minBounds.z + 1,
    };
  }

  /**
   * Gets all voxel positions with votes
   */
  getAllPositions(): Array<{ x: number; y: number; z: number; vote: VoxelVote }> {
    return Array.from(this.grid.entries()).map(([key, vote]) => ({
      ...this.parseKey(key),
      vote,
    }));
  }

  /**
   * Gets neighboring positions (6-connected)
   */
  getNeighbors(x: number, y: number, z: number): Array<{ x: number; y: number; z: number }> {
    return [
      { x: x - 1, y, z },
      { x: x + 1, y, z },
      { x, y: y - 1, z },
      { x, y: y + 1, z },
      { x, y, z: z - 1 },
      { x, y, z: z + 1 },
    ];
  }

  /**
   * Counts neighbors with votes at a position
   */
  countFilledNeighbors(x: number, y: number, z: number): number {
    return this.getNeighbors(x, y, z).filter(n => this.hasVote(n.x, n.y, n.z)).length;
  }
}

// ============================================================================
// RECONSTRUCTION ENGINE
// ============================================================================

/**
 * Reconstructs a 3D voxel model from multiple frame detections
 * 
 * @param detections - Array of frame detections
 * @param options - Reconstruction options
 * @returns Reconstruction result with merged blocks
 */
export async function reconstructFromViews(
  detections: FrameDetection[],
  options: ReconstructionOptions = {}
): Promise<ReconstructionResult> {
  const {
    minVotes = 1,
    minConfidence = 0.3,
    fillGaps = true,
    maxGapSize = 2,
    useStructuralPriors = true,
    onProgress,
  } = options;

  console.log(`[MultiView] multiViewReconstructor.ts: Starting reconstruction from ${detections.length} frames`);
  onProgress?.('Initializing', 0);

  // Initialize statistics
  const stats = {
    totalFrames: detections.length,
    totalDetections: 0,
    uniquePositions: 0,
    highConfidenceBlocks: 0,
    gapsFilled: 0,
    conflictsResolved: 0,
  };

  // ========== PHASE 1: Accumulate votes ==========
  onProgress?.('Accumulating votes', 0.1);
  
  const grid = new VoxelGrid();
  
  for (const detection of detections) {
    for (const block of detection.blocks) {
      stats.totalDetections++;
      
      // Normalize coordinates to integers
      const x = Math.round(block.x);
      const y = Math.round(block.y);
      const z = Math.round(block.z);
      
      // Skip invalid positions
      if (x < 0 || y < 0 || z < 0 || x > 500 || y > 500 || z > 500) {
        continue;
      }
      
      grid.addVote(
        x, y, z,
        block.type,
        detection.frameIndex,
        (block as ReconstructedBlock).states
      );
    }
  }

  // ========== PHASE 2: Normalize coordinates ==========
  onProgress?.('Normalizing coordinates', 0.3);
  
  const bounds = grid.getBounds();
  const offset = { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z };
  
  console.log(`[MultiView] multiViewReconstructor.ts: Bounds: (${bounds.min.x},${bounds.min.y},${bounds.min.z}) to (${bounds.max.x},${bounds.max.y},${bounds.max.z})`);

  // ========== PHASE 3: Convert votes to blocks ==========
  onProgress?.('Resolving votes', 0.5);
  
  const blocks: ReconstructedBlock[] = [];
  const allPositions = grid.getAllPositions();
  stats.uniquePositions = allPositions.length;

  for (const pos of allPositions) {
    const vote = pos.vote;
    
    // Skip if not enough votes
    if (vote.totalVotes < minVotes) {
      continue;
    }
    
    // Find winning block type
    let winningType = '';
    let maxVotes = 0;
    
    for (const [type, count] of vote.types) {
      if (count > maxVotes) {
        maxVotes = count;
        winningType = type;
      }
    }
    
    // Calculate confidence
    const confidence = maxVotes / detections.length;
    
    // Skip if confidence too low
    if (confidence < minConfidence) {
      continue;
    }
    
    // Track conflicts
    if (vote.types.size > 1) {
      stats.conflictsResolved++;
    }
    
    if (confidence >= 0.7) {
      stats.highConfidenceBlocks++;
    }
    
    // Create reconstructed block with normalized coordinates
    const block: ReconstructedBlock = {
      x: pos.x - offset.x,
      y: pos.y - offset.y,
      z: pos.z - offset.z,
      type: winningType,
      confidence,
      voteCount: vote.totalVotes,
      frameIndices: Array.from(vote.frameIndices),
    };
    
    // Add states if available
    const states = vote.states.get(winningType);
    if (states) {
      block.states = states;
    }
    
    blocks.push(block);
  }

  // ========== PHASE 4: Fill gaps ==========
  if (fillGaps && blocks.length > 0) {
    onProgress?.('Filling gaps', 0.7);
    
    const filledBlocks = fillStructuralGaps(blocks, maxGapSize);
    stats.gapsFilled = filledBlocks.length - blocks.length;
    
    if (stats.gapsFilled > 0) {
      console.log(`[MultiView] multiViewReconstructor.ts: Filled ${stats.gapsFilled} gaps`);
      blocks.push(...filledBlocks.filter(b => !blocks.some(
        existing => existing.x === b.x && existing.y === b.y && existing.z === b.z
      )));
    }
  }

  // ========== PHASE 5: Apply structural priors ==========
  if (useStructuralPriors && blocks.length > 0) {
    onProgress?.('Applying structural priors', 0.85);
    applyStructuralPriors(blocks);
  }

  // ========== PHASE 6: Calculate final size ==========
  onProgress?.('Finalizing', 0.95);
  
  const size: Size3D = {
    x: blocks.length > 0 ? Math.max(...blocks.map(b => b.x)) + 1 : 0,
    y: blocks.length > 0 ? Math.max(...blocks.map(b => b.y)) + 1 : 0,
    z: blocks.length > 0 ? Math.max(...blocks.map(b => b.z)) + 1 : 0,
  };

  console.log(`[MultiView] multiViewReconstructor.ts: Reconstruction complete: ${blocks.length} blocks, size ${size.x}x${size.y}x${size.z}`);
  onProgress?.('Complete', 1);

  return { blocks, size, stats };
}

// ============================================================================
// GAP FILLING
// ============================================================================

/**
 * Fills small gaps in the structure based on surrounding blocks
 */
function fillStructuralGaps(blocks: ReconstructedBlock[], maxGapSize: number): ReconstructedBlock[] {
  const result = [...blocks];
  const blockMap = new Map<string, ReconstructedBlock>();
  
  // Build lookup map
  for (const block of blocks) {
    blockMap.set(`${block.x},${block.y},${block.z}`, block);
  }
  
  // Find bounds
  const maxX = Math.max(...blocks.map(b => b.x));
  const maxY = Math.max(...blocks.map(b => b.y));
  const maxZ = Math.max(...blocks.map(b => b.z));
  
  // Scan for gaps
  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z <= maxZ; z++) {
      for (let x = 0; x <= maxX; x++) {
        const key = `${x},${y},${z}`;
        
        if (blockMap.has(key)) continue;
        
        // Count neighbors
        const neighbors: ReconstructedBlock[] = [];
        const directions = [
          [-1, 0, 0], [1, 0, 0],
          [0, -1, 0], [0, 1, 0],
          [0, 0, -1], [0, 0, 1],
        ];
        
        for (const [dx, dy, dz] of directions) {
          const neighborKey = `${x + dx},${y + dy},${z + dz}`;
          const neighbor = blockMap.get(neighborKey);
          if (neighbor) {
            neighbors.push(neighbor);
          }
        }
        
        // Fill gap if surrounded by enough neighbors
        if (neighbors.length >= 4) {
          // Use the most common neighbor type
          const typeCounts = new Map<string, number>();
          for (const n of neighbors) {
            typeCounts.set(n.type, (typeCounts.get(n.type) || 0) + 1);
          }
          
          let bestType = neighbors[0].type;
          let bestCount = 0;
          for (const [type, count] of typeCounts) {
            if (count > bestCount) {
              bestCount = count;
              bestType = type;
            }
          }
          
          const filledBlock: ReconstructedBlock = {
            x, y, z,
            type: bestType,
            confidence: 0.5 * (neighbors.length / 6),  // Lower confidence for filled blocks
            voteCount: 0,
            frameIndices: [],
          };
          
          result.push(filledBlock);
          blockMap.set(key, filledBlock);
        }
      }
    }
  }
  
  return result;
}

// ============================================================================
// STRUCTURAL PRIORS
// ============================================================================

/**
 * Applies structural priors to improve reconstruction quality
 * - Floors tend to be flat
 * - Walls tend to be vertical
 * - Roofs tend to follow stair patterns
 */
function applyStructuralPriors(blocks: ReconstructedBlock[]): void {
  // Build y-level histogram to find floor levels
  const yLevelCounts = new Map<number, number>();
  for (const block of blocks) {
    yLevelCounts.set(block.y, (yLevelCounts.get(block.y) || 0) + 1);
  }
  
  // Find probable floor levels (high block counts at specific Y levels)
  const avgCount = blocks.length / (Math.max(...blocks.map(b => b.y)) + 1);
  const floorLevels: number[] = [];
  
  for (const [y, count] of yLevelCounts) {
    if (count > avgCount * 1.5) {
      floorLevels.push(y);
    }
  }
  
  // Boost confidence for blocks at floor levels
  for (const block of blocks) {
    if (floorLevels.includes(block.y)) {
      block.confidence = Math.min(1, block.confidence * 1.2);
    }
  }
  
  // Detect vertical walls (columns of blocks at same x,z with sequential y)
  const columnMap = new Map<string, number[]>();
  for (const block of blocks) {
    const colKey = `${block.x},${block.z}`;
    if (!columnMap.has(colKey)) {
      columnMap.set(colKey, []);
    }
    columnMap.get(colKey)!.push(block.y);
  }
  
  // Boost confidence for wall-like columns
  for (const [colKey, yLevels] of columnMap) {
    yLevels.sort((a, b) => a - b);
    
    // Check for sequential Y values (indicates a wall)
    let maxSequential = 1;
    let currentSequential = 1;
    
    for (let i = 1; i < yLevels.length; i++) {
      if (yLevels[i] === yLevels[i - 1] + 1) {
        currentSequential++;
        maxSequential = Math.max(maxSequential, currentSequential);
      } else {
        currentSequential = 1;
      }
    }
    
    // If this looks like a wall (3+ sequential blocks), boost confidence
    if (maxSequential >= 3) {
      const [x, z] = colKey.split(',').map(Number);
      for (const block of blocks) {
        if (block.x === x && block.z === z) {
          block.confidence = Math.min(1, block.confidence * 1.15);
        }
      }
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Merges two reconstruction results
 */
export function mergeReconstructions(
  a: ReconstructionResult,
  b: ReconstructionResult
): ReconstructionResult {
  const blockMap = new Map<string, ReconstructedBlock>();
  
  // Add blocks from first result
  for (const block of a.blocks) {
    const key = `${block.x},${block.y},${block.z}`;
    blockMap.set(key, block);
  }
  
  // Merge blocks from second result
  for (const block of b.blocks) {
    const key = `${block.x},${block.y},${block.z}`;
    const existing = blockMap.get(key);
    
    if (existing) {
      // Average confidence
      existing.confidence = (existing.confidence + block.confidence) / 2;
      existing.voteCount += block.voteCount;
      existing.frameIndices = [...new Set([...existing.frameIndices, ...block.frameIndices])];
    } else {
      blockMap.set(key, block);
    }
  }
  
  const blocks = Array.from(blockMap.values());
  
  return {
    blocks,
    size: {
      x: Math.max(a.size.x, b.size.x),
      y: Math.max(a.size.y, b.size.y),
      z: Math.max(a.size.z, b.size.z),
    },
    stats: {
      totalFrames: a.stats.totalFrames + b.stats.totalFrames,
      totalDetections: a.stats.totalDetections + b.stats.totalDetections,
      uniquePositions: blocks.length,
      highConfidenceBlocks: blocks.filter(b => b.confidence >= 0.7).length,
      gapsFilled: a.stats.gapsFilled + b.stats.gapsFilled,
      conflictsResolved: a.stats.conflictsResolved + b.stats.conflictsResolved,
    },
  };
}

/**
 * Filters blocks by confidence threshold
 */
export function filterByConfidence(
  blocks: ReconstructedBlock[],
  minConfidence: number
): ReconstructedBlock[] {
  return blocks.filter(b => b.confidence >= minConfidence);
}

/**
 * Gets statistics about block type distribution
 */
export function getBlockTypeStats(blocks: ReconstructedBlock[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    counts.set(block.type, (counts.get(block.type) || 0) + 1);
  }
  return counts;
}

/**
 * Converts ReconstructedBlock[] to standard Block[] (strips metadata)
 */
export function toStandardBlocks(blocks: ReconstructedBlock[]): Block[] {
  return blocks.map(b => ({
    x: b.x,
    y: b.y,
    z: b.z,
    type: b.type,
  }));
}
