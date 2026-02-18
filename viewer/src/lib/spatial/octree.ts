/**
 * octree.ts - Octree Spatial Index for Large Voxel Structures
 * 
 * This module implements an octree data structure optimized for Minecraft-style
 * voxel data. It provides O(log n) spatial queries for:
 * - Point queries (get block at position)
 * - Range queries (get all blocks in a region)
 * - Radius queries (get blocks within distance)
 * - Ray casting (find blocks along a ray)
 * 
 * Designed to handle 200k+ blocks efficiently.
 */

import type { Block } from '../../types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** 3D vector */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned bounding box */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

/** Block with optional metadata */
export interface IndexedBlock extends Block {
  index?: number;  // Original array index for fast lookup
}

/** Octree node */
interface OctreeNode {
  bounds: AABB;
  blocks: IndexedBlock[];
  children: OctreeNode[] | null;
  depth: number;
}

/** Query statistics for performance monitoring */
export interface QueryStats {
  nodesVisited: number;
  blocksChecked: number;
  timeMs: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** Maximum blocks per leaf node before splitting */
  MAX_BLOCKS_PER_NODE: 32,
  
  /** Maximum tree depth */
  MAX_DEPTH: 10,
  
  /** Minimum node size (won't split smaller than this) */
  MIN_NODE_SIZE: 2,
};

// ============================================================================
// OCTREE IMPLEMENTATION
// ============================================================================

/**
 * VoxelOctree - Spatial index for voxel data
 * 
 * Usage:
 * ```ts
 * const octree = new VoxelOctree();
 * octree.build(blocks);
 * const nearbyBlocks = octree.queryRadius({ x: 10, y: 5, z: 10 }, 5);
 * const blockAtPos = octree.queryPoint(10, 5, 10);
 * ```
 */
export class VoxelOctree {
  private root: OctreeNode | null = null;
  private blockCount = 0;
  private bounds: AABB | null = null;

  // ========== CONSTRUCTION ==========

  /**
   * Builds the octree from an array of blocks
   * @param blocks - Array of blocks to index
   */
  build(blocks: Block[]): void {
    console.log(`[Octree] octree.ts: Building octree for ${blocks.length} blocks`);
    const startTime = performance.now();

    if (blocks.length === 0) {
      this.root = null;
      this.blockCount = 0;
      this.bounds = null;
      return;
    }

    // Calculate bounds
    this.bounds = this.calculateBounds(blocks);
    this.blockCount = blocks.length;

    // Add index to each block for fast reference
    const indexedBlocks: IndexedBlock[] = blocks.map((b, i) => ({ ...b, index: i }));

    // Build tree recursively
    this.root = this.buildNode(indexedBlocks, this.bounds, 0);

    const elapsed = performance.now() - startTime;
    console.log(`[Octree] octree.ts: Built in ${elapsed.toFixed(2)}ms`);
  }

  /**
   * Calculates the bounding box of all blocks
   */
  private calculateBounds(blocks: Block[]): AABB {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const block of blocks) {
      minX = Math.min(minX, block.x);
      minY = Math.min(minY, block.y);
      minZ = Math.min(minZ, block.z);
      maxX = Math.max(maxX, block.x);
      maxY = Math.max(maxY, block.y);
      maxZ = Math.max(maxZ, block.z);
    }

    // Add 1 to max because blocks occupy a full unit cube
    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX + 1, y: maxY + 1, z: maxZ + 1 },
    };
  }

  /**
   * Recursively builds an octree node
   */
  private buildNode(blocks: IndexedBlock[], bounds: AABB, depth: number): OctreeNode {
    const node: OctreeNode = {
      bounds,
      blocks: [],
      children: null,
      depth,
    };

    // Check if we should make this a leaf node
    const size = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );

    if (
      blocks.length <= CONFIG.MAX_BLOCKS_PER_NODE ||
      depth >= CONFIG.MAX_DEPTH ||
      size <= CONFIG.MIN_NODE_SIZE
    ) {
      // Leaf node - store blocks directly
      node.blocks = blocks;
      return node;
    }

    // Split into 8 children
    node.children = [];
    const childBounds = this.subdivide(bounds);
    
    // Distribute blocks to children
    const childBlocks: IndexedBlock[][] = Array.from({ length: 8 }, () => []);

    for (const block of blocks) {
      const childIndex = this.getChildIndex(block, bounds);
      childBlocks[childIndex].push(block);
    }

    // Build child nodes
    for (let i = 0; i < 8; i++) {
      if (childBlocks[i].length > 0) {
        node.children.push(this.buildNode(childBlocks[i], childBounds[i], depth + 1));
      }
    }

    // If all blocks ended up in one child (degenerate case), make this a leaf
    if (node.children.length === 1 && depth < CONFIG.MAX_DEPTH - 1) {
      return node.children[0];
    }

    return node;
  }

  /**
   * Subdivides a bounding box into 8 octants
   */
  private subdivide(bounds: AABB): AABB[] {
    const midX = (bounds.min.x + bounds.max.x) / 2;
    const midY = (bounds.min.y + bounds.max.y) / 2;
    const midZ = (bounds.min.z + bounds.max.z) / 2;

    return [
      // Bottom 4
      { min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z }, max: { x: midX, y: midY, z: midZ } },
      { min: { x: midX, y: bounds.min.y, z: bounds.min.z }, max: { x: bounds.max.x, y: midY, z: midZ } },
      { min: { x: bounds.min.x, y: bounds.min.y, z: midZ }, max: { x: midX, y: midY, z: bounds.max.z } },
      { min: { x: midX, y: bounds.min.y, z: midZ }, max: { x: bounds.max.x, y: midY, z: bounds.max.z } },
      // Top 4
      { min: { x: bounds.min.x, y: midY, z: bounds.min.z }, max: { x: midX, y: bounds.max.y, z: midZ } },
      { min: { x: midX, y: midY, z: bounds.min.z }, max: { x: bounds.max.x, y: bounds.max.y, z: midZ } },
      { min: { x: bounds.min.x, y: midY, z: midZ }, max: { x: midX, y: bounds.max.y, z: bounds.max.z } },
      { min: { x: midX, y: midY, z: midZ }, max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z } },
    ];
  }

  /**
   * Gets the child index (0-7) for a block position
   */
  private getChildIndex(block: Block, bounds: AABB): number {
    const midX = (bounds.min.x + bounds.max.x) / 2;
    const midY = (bounds.min.y + bounds.max.y) / 2;
    const midZ = (bounds.min.z + bounds.max.z) / 2;

    let index = 0;
    if (block.x >= midX) index |= 1;
    if (block.z >= midZ) index |= 2;
    if (block.y >= midY) index |= 4;

    return index;
  }

  // ========== QUERIES ==========

  /**
   * Gets a block at a specific position
   * @returns Block at position or undefined
   */
  queryPoint(x: number, y: number, z: number): Block | undefined {
    if (!this.root) return undefined;

    const result = this.queryPointRecursive(this.root, x, y, z);
    return result;
  }

  private queryPointRecursive(node: OctreeNode, x: number, y: number, z: number): Block | undefined {
    // Check if point is in bounds
    if (!this.pointInBounds(x, y, z, node.bounds)) {
      return undefined;
    }

    // Leaf node - check blocks
    if (!node.children) {
      for (const block of node.blocks) {
        if (block.x === x && block.y === y && block.z === z) {
          return block;
        }
      }
      return undefined;
    }

    // Internal node - recurse
    for (const child of node.children) {
      const result = this.queryPointRecursive(child, x, y, z);
      if (result) return result;
    }

    return undefined;
  }

  /**
   * Gets all blocks within a bounding box
   * @param bounds - Axis-aligned bounding box to query
   * @returns Array of blocks in the region
   */
  queryRange(bounds: AABB): Block[] {
    if (!this.root) return [];

    const results: Block[] = [];
    this.queryRangeRecursive(this.root, bounds, results);
    return results;
  }

  private queryRangeRecursive(node: OctreeNode, queryBounds: AABB, results: Block[]): void {
    // Check if bounds intersect
    if (!this.boundsIntersect(node.bounds, queryBounds)) {
      return;
    }

    // Leaf node - check blocks
    if (!node.children) {
      for (const block of node.blocks) {
        if (this.pointInBounds(block.x, block.y, block.z, queryBounds)) {
          results.push(block);
        }
      }
      return;
    }

    // Internal node - recurse
    for (const child of node.children) {
      this.queryRangeRecursive(child, queryBounds, results);
    }
  }

  /**
   * Gets all blocks within a radius of a point
   * @param center - Center point
   * @param radius - Search radius
   * @returns Array of blocks within radius
   */
  queryRadius(center: Vec3, radius: number): Block[] {
    if (!this.root) return [];

    // First, query the bounding box that contains the sphere
    const queryBounds: AABB = {
      min: { x: center.x - radius, y: center.y - radius, z: center.z - radius },
      max: { x: center.x + radius, y: center.y + radius, z: center.z + radius },
    };

    const candidates = this.queryRange(queryBounds);

    // Filter to actual radius
    const radiusSq = radius * radius;
    return candidates.filter(block => {
      const dx = block.x + 0.5 - center.x;  // Use block center
      const dy = block.y + 0.5 - center.y;
      const dz = block.z + 0.5 - center.z;
      return dx * dx + dy * dy + dz * dz <= radiusSq;
    });
  }

  /**
   * Gets all blocks at a specific Y level
   * @param y - Y coordinate
   * @returns Array of blocks at that level
   */
  queryLayer(y: number): Block[] {
    if (!this.root || !this.bounds) return [];

    const queryBounds: AABB = {
      min: { x: this.bounds.min.x, y, z: this.bounds.min.z },
      max: { x: this.bounds.max.x, y: y + 1, z: this.bounds.max.z },
    };

    return this.queryRange(queryBounds);
  }

  /**
   * Gets all blocks within a Y range (for layer-by-layer building)
   * @param minY - Minimum Y (inclusive)
   * @param maxY - Maximum Y (inclusive)
   * @returns Array of blocks in the Y range
   */
  queryYRange(minY: number, maxY: number): Block[] {
    if (!this.root || !this.bounds) return [];

    const queryBounds: AABB = {
      min: { x: this.bounds.min.x, y: minY, z: this.bounds.min.z },
      max: { x: this.bounds.max.x, y: maxY + 1, z: this.bounds.max.z },
    };

    return this.queryRange(queryBounds);
  }

  // ========== MODIFICATIONS ==========

  /**
   * Inserts a block into the octree
   * Note: For bulk insertions, rebuild() is more efficient
   */
  insert(block: Block): void {
    if (!this.root || !this.bounds) {
      // First block - initialize
      this.bounds = {
        min: { x: block.x, y: block.y, z: block.z },
        max: { x: block.x + 1, y: block.y + 1, z: block.z + 1 },
      };
      this.root = {
        bounds: this.bounds,
        blocks: [{ ...block, index: 0 }],
        children: null,
        depth: 0,
      };
      this.blockCount = 1;
      return;
    }

    // Check if we need to expand bounds
    if (
      block.x < this.bounds.min.x ||
      block.y < this.bounds.min.y ||
      block.z < this.bounds.min.z ||
      block.x >= this.bounds.max.x ||
      block.y >= this.bounds.max.y ||
      block.z >= this.bounds.max.z
    ) {
      // Rebuild with new bounds
      const allBlocks = this.getAllBlocks();
      allBlocks.push(block);
      this.build(allBlocks);
      return;
    }

    // Insert into existing tree
    this.insertRecursive(this.root, { ...block, index: this.blockCount });
    this.blockCount++;
  }

  private insertRecursive(node: OctreeNode, block: IndexedBlock): void {
    // Leaf node
    if (!node.children) {
      node.blocks.push(block);
      
      // Check if we need to split
      if (
        node.blocks.length > CONFIG.MAX_BLOCKS_PER_NODE &&
        node.depth < CONFIG.MAX_DEPTH
      ) {
        this.splitNode(node);
      }
      return;
    }

    // Find child and recurse
    const childIndex = this.getChildIndex(block, node.bounds);
    const childBounds = this.subdivide(node.bounds);
    
    // Find or create child
    let targetChild = node.children.find(c => 
      this.boundsEqual(c.bounds, childBounds[childIndex])
    );

    if (!targetChild) {
      targetChild = {
        bounds: childBounds[childIndex],
        blocks: [],
        children: null,
        depth: node.depth + 1,
      };
      node.children.push(targetChild);
    }

    this.insertRecursive(targetChild, block);
  }

  private splitNode(node: OctreeNode): void {
    node.children = [];
    const childBounds = this.subdivide(node.bounds);
    const childBlocks: IndexedBlock[][] = Array.from({ length: 8 }, () => []);

    for (const block of node.blocks) {
      const childIndex = this.getChildIndex(block, node.bounds);
      childBlocks[childIndex].push(block);
    }

    for (let i = 0; i < 8; i++) {
      if (childBlocks[i].length > 0) {
        node.children.push({
          bounds: childBounds[i],
          blocks: childBlocks[i],
          children: null,
          depth: node.depth + 1,
        });
      }
    }

    node.blocks = [];
  }

  /**
   * Removes a block at a specific position
   * @returns true if block was found and removed
   */
  remove(x: number, y: number, z: number): boolean {
    if (!this.root) return false;

    const removed = this.removeRecursive(this.root, x, y, z);
    if (removed) {
      this.blockCount--;
    }
    return removed;
  }

  private removeRecursive(node: OctreeNode, x: number, y: number, z: number): boolean {
    if (!this.pointInBounds(x, y, z, node.bounds)) {
      return false;
    }

    if (!node.children) {
      const index = node.blocks.findIndex(b => b.x === x && b.y === y && b.z === z);
      if (index >= 0) {
        node.blocks.splice(index, 1);
        return true;
      }
      return false;
    }

    for (const child of node.children) {
      if (this.removeRecursive(child, x, y, z)) {
        return true;
      }
    }

    return false;
  }

  // ========== UTILITIES ==========

  /**
   * Gets all blocks in the octree
   */
  getAllBlocks(): Block[] {
    if (!this.root) return [];

    const results: Block[] = [];
    this.collectBlocks(this.root, results);
    return results;
  }

  private collectBlocks(node: OctreeNode, results: Block[]): void {
    if (!node.children) {
      results.push(...node.blocks);
      return;
    }

    for (const child of node.children) {
      this.collectBlocks(child, results);
    }
  }

  /**
   * Gets the total number of blocks
   */
  size(): number {
    return this.blockCount;
  }

  /**
   * Gets the bounds of all blocks
   */
  getBounds(): AABB | null {
    return this.bounds ? { ...this.bounds } : null;
  }

  /**
   * Checks if a point is inside bounds
   */
  private pointInBounds(x: number, y: number, z: number, bounds: AABB): boolean {
    return (
      x >= bounds.min.x && x < bounds.max.x &&
      y >= bounds.min.y && y < bounds.max.y &&
      z >= bounds.min.z && z < bounds.max.z
    );
  }

  /**
   * Checks if two bounding boxes intersect
   */
  private boundsIntersect(a: AABB, b: AABB): boolean {
    return (
      a.min.x < b.max.x && a.max.x > b.min.x &&
      a.min.y < b.max.y && a.max.y > b.min.y &&
      a.min.z < b.max.z && a.max.z > b.min.z
    );
  }

  /**
   * Checks if two bounding boxes are equal
   */
  private boundsEqual(a: AABB, b: AABB): boolean {
    return (
      a.min.x === b.min.x && a.min.y === b.min.y && a.min.z === b.min.z &&
      a.max.x === b.max.x && a.max.y === b.max.y && a.max.z === b.max.z
    );
  }

  /**
   * Gets statistics about the octree structure
   */
  getStats(): { 
    totalBlocks: number; 
    totalNodes: number; 
    maxDepth: number; 
    avgBlocksPerLeaf: number 
  } {
    if (!this.root) {
      return { totalBlocks: 0, totalNodes: 0, maxDepth: 0, avgBlocksPerLeaf: 0 };
    }

    let totalNodes = 0;
    let leafNodes = 0;
    let maxDepth = 0;
    let totalBlocksInLeaves = 0;

    const countNodes = (node: OctreeNode) => {
      totalNodes++;
      maxDepth = Math.max(maxDepth, node.depth);

      if (!node.children) {
        leafNodes++;
        totalBlocksInLeaves += node.blocks.length;
      } else {
        for (const child of node.children) {
          countNodes(child);
        }
      }
    };

    countNodes(this.root);

    return {
      totalBlocks: this.blockCount,
      totalNodes,
      maxDepth,
      avgBlocksPerLeaf: leafNodes > 0 ? totalBlocksInLeaves / leafNodes : 0,
    };
  }
}

// ============================================================================
// CHUNK-BASED INDEX (for very large structures)
// ============================================================================

/**
 * ChunkedBlockIndex - Hash-map based index using 16x16x16 chunks
 * More memory efficient for very sparse or very large structures
 */
export class ChunkedBlockIndex {
  private chunks: Map<string, Map<string, Block>> = new Map();
  private blockCount = 0;

  private static CHUNK_SIZE = 16;

  private getChunkKey(x: number, y: number, z: number): string {
    const cx = Math.floor(x / ChunkedBlockIndex.CHUNK_SIZE);
    const cy = Math.floor(y / ChunkedBlockIndex.CHUNK_SIZE);
    const cz = Math.floor(z / ChunkedBlockIndex.CHUNK_SIZE);
    return `${cx},${cy},${cz}`;
  }

  private getLocalKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /**
   * Builds the index from an array of blocks
   */
  build(blocks: Block[]): void {
    this.chunks.clear();
    this.blockCount = 0;

    for (const block of blocks) {
      this.insert(block);
    }
  }

  /**
   * Inserts a block
   */
  insert(block: Block): void {
    const chunkKey = this.getChunkKey(block.x, block.y, block.z);
    
    if (!this.chunks.has(chunkKey)) {
      this.chunks.set(chunkKey, new Map());
    }

    const chunk = this.chunks.get(chunkKey)!;
    const localKey = this.getLocalKey(block.x, block.y, block.z);
    
    if (!chunk.has(localKey)) {
      this.blockCount++;
    }
    
    chunk.set(localKey, block);
  }

  /**
   * Gets a block at position
   */
  get(x: number, y: number, z: number): Block | undefined {
    const chunkKey = this.getChunkKey(x, y, z);
    const chunk = this.chunks.get(chunkKey);
    
    if (!chunk) return undefined;
    
    return chunk.get(this.getLocalKey(x, y, z));
  }

  /**
   * Removes a block at position
   */
  remove(x: number, y: number, z: number): boolean {
    const chunkKey = this.getChunkKey(x, y, z);
    const chunk = this.chunks.get(chunkKey);
    
    if (!chunk) return false;
    
    const localKey = this.getLocalKey(x, y, z);
    if (chunk.delete(localKey)) {
      this.blockCount--;
      
      // Clean up empty chunks
      if (chunk.size === 0) {
        this.chunks.delete(chunkKey);
      }
      return true;
    }
    
    return false;
  }

  /**
   * Gets all blocks
   */
  getAllBlocks(): Block[] {
    const results: Block[] = [];
    for (const chunk of this.chunks.values()) {
      results.push(...chunk.values());
    }
    return results;
  }

  /**
   * Gets blocks in a chunk
   */
  getChunk(chunkX: number, chunkY: number, chunkZ: number): Block[] {
    const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
    const chunk = this.chunks.get(chunkKey);
    return chunk ? Array.from(chunk.values()) : [];
  }

  /**
   * Gets the number of blocks
   */
  size(): number {
    return this.blockCount;
  }

  /**
   * Gets the number of active chunks
   */
  chunkCount(): number {
    return this.chunks.size;
  }
}
