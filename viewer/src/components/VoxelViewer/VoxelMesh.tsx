import { useMemo } from 'react';
import * as THREE from 'three';
import { getBlockColor } from '../../lib/minecraft/blocks';
import type { Block } from '../../types';

interface VoxelMeshProps {
  blocks: Block[];
}

// Create a lookup set for fast neighbor checking
function createBlockLookup(blocks: Block[]): Set<string> {
  const lookup = new Set<string>();
  for (const block of blocks) {
    lookup.add(`${block.x},${block.y},${block.z}`);
  }
  return lookup;
}

// Check if a face should be visible (no neighbor in that direction)
function isFaceVisible(
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  lookup: Set<string>
): boolean {
  return !lookup.has(`${x + dx},${y + dy},${z + dz}`);
}

// Face vertices (relative to block position)
const FACE_VERTICES: Record<string, number[][]> = {
  top: [
    [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]
  ],
  bottom: [
    [0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]
  ],
  front: [
    [0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]
  ],
  back: [
    [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]
  ],
  right: [
    [1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]
  ],
  left: [
    [0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]
  ],
};

// Face normals
const FACE_NORMALS: Record<string, number[]> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
};

// Direction offsets for neighbor checking
const FACE_DIRECTIONS: Record<string, number[]> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
};

export function VoxelMesh({ blocks }: VoxelMeshProps) {
  const geometry = useMemo(() => {
    if (blocks.length === 0) {
      return new THREE.BufferGeometry();
    }

    const lookup = createBlockLookup(blocks);

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    let vertexIndex = 0;

    for (const block of blocks) {
      const color = new THREE.Color(getBlockColor(block.type));

      // Check each face
      for (const [faceName, vertices] of Object.entries(FACE_VERTICES)) {
        const dir = FACE_DIRECTIONS[faceName];

        // Only add face if no neighbor blocks it
        if (isFaceVisible(block.x, block.y, block.z, dir[0], dir[1], dir[2], lookup)) {
          const normal = FACE_NORMALS[faceName];

          // Add 4 vertices for this face
          for (const vertex of vertices) {
            positions.push(
              block.x + vertex[0],
              block.y + vertex[1],
              block.z + vertex[2]
            );
            normals.push(normal[0], normal[1], normal[2]);
            colors.push(color.r, color.g, color.b);
          }

          // Add 2 triangles (6 indices) for the quad
          indices.push(
            vertexIndex, vertexIndex + 1, vertexIndex + 2,
            vertexIndex, vertexIndex + 2, vertexIndex + 3
          );
          vertexIndex += 4;
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);

    return geo;
  }, [blocks]);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial vertexColors side={THREE.FrontSide} />
    </mesh>
  );
}
