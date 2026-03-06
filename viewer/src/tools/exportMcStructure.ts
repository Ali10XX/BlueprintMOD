/**
 * exportMcStructure.ts
 *
 * Converts a slice-based blueprint into a Bedrock Edition .mcstructure file
 * (uncompressed little-endian NBT), suitable for loading with a structure block
 * or the /structure command in Bedrock 1.20+.
 *
 * Usage:
 *   const bytes = await exportToMcStructure(blueprint);
 *   downloadMcStructure(bytes, 'al_shaheed.mcstructure');
 *
 * Block version 18105860 ≈ Bedrock 1.20.75 — accepted by 1.20+ structure blocks.
 * NOTE: Bedrock block IDs / states can change between major versions. If a block
 * fails to load, check the Bedrock wiki for the current canonical name + states.
 */

import { write, NBTData, Int32 } from 'nbtify';
import type { SliceBlueprint } from '../components/VoxelPreview/blueprintTypes';
import { voxelizeBlueprint } from '../components/VoxelPreview/voxelizeBlueprint';

// ─── Block version ────────────────────────────────────────────────────────────

const BLOCK_VERSION = new Int32(18105860); // 1.20.x compatible

// ─── Java → Bedrock block mapping ─────────────────────────────────────────────

interface BedrockBlock {
  name: string;
  states: Record<string, unknown>;
}

/**
 * Maps a Java-style block name + optional block state to the Bedrock
 * block name and state properties.
 *
 * Stair weirdo_direction: 0=east, 1=west, 2=south, 3=north
 * Slab / stair top_slot_bit / upside_down_bit: false=bottom, true=top
 */
function toBedrockBlock(
  blockType: string,
  blockState?: {
    facing?: string;
    half?: string;
    shape?: string;
    type?: string;
  },
): BedrockBlock {
  const clean = blockType.replace('minecraft:', '');

  switch (clean) {
    // ── Prismarine family ───────────────────────────────────────────────────
    case 'prismarine':
      return { name: 'minecraft:prismarine', states: {} };
    case 'dark_prismarine':
      return { name: 'minecraft:dark_prismarine', states: {} };
    case 'prismarine_bricks':
      return { name: 'minecraft:prismarine_bricks', states: {} };

    case 'prismarine_stairs': {
      const dirMap: Record<string, number> = {
        east: 0, west: 1, south: 2, north: 3,
      };
      const dir = new Int32(dirMap[blockState?.facing ?? 'east'] ?? 0);
      const upsideDown = blockState?.half === 'top';
      return {
        name: 'minecraft:prismarine_stairs',
        states: { weirdo_direction: dir, upside_down_bit: upsideDown },
      };
    }

    case 'prismarine_slab': {
      const top = blockState?.type === 'top';
      return {
        name: 'minecraft:prismarine_slab',
        states: { top_slot_bit: top },
      };
    }

    // ── Quartz family ────────────────────────────────────────────────────────
    case 'smooth_quartz':
    case 'smooth_quartz_block':
      // Bedrock 1.20+ uses minecraft:smooth_quartz_block directly
      return { name: 'minecraft:smooth_quartz_block', states: {} };

    case 'smooth_quartz_slab': {
      const top = blockState?.type === 'top';
      return {
        name: 'minecraft:smooth_quartz_slab',
        states: { top_slot_bit: top },
      };
    }

    case 'chiseled_quartz_block':
    case 'quartz_pillar':
    case 'quartz_block':
      return { name: 'minecraft:quartz_block', states: {} };

    // ── Oxidized copper family ───────────────────────────────────────────────
    case 'waxed_oxidized_cut_copper':
      return { name: 'minecraft:waxed_oxidized_cut_copper', states: {} };
    case 'oxidized_cut_copper':
      return { name: 'minecraft:oxidized_cut_copper', states: {} };

    case 'waxed_oxidized_cut_copper_stairs': {
      const dirMap: Record<string, number> = {
        east: 0, west: 1, south: 2, north: 3,
      };
      const dir = new Int32(dirMap[blockState?.facing ?? 'east'] ?? 0);
      const upsideDown = blockState?.half === 'top';
      return {
        name: 'minecraft:waxed_oxidized_cut_copper_stairs',
        states: { weirdo_direction: dir, upside_down_bit: upsideDown },
      };
    }

    case 'waxed_oxidized_cut_copper_slab': {
      const top = blockState?.type === 'top';
      return {
        name: 'minecraft:waxed_oxidized_cut_copper_slab',
        states: { top_slot_bit: top },
      };
    }

    // ── Terracotta / concrete ────────────────────────────────────────────────
    case 'cyan_terracotta':
      return { name: 'minecraft:cyan_terracotta', states: {} };
    case 'cyan_concrete':
      return { name: 'minecraft:cyan_concrete', states: {} };

    // ── Fallback: air ────────────────────────────────────────────────────────
    default:
      return { name: 'minecraft:air', states: {} };
  }
}

// ─── Palette helpers ──────────────────────────────────────────────────────────

function paletteKey(b: BedrockBlock): string {
  return `${b.name}:${JSON.stringify(b.states, Object.keys(b.states).sort())}`;
}

// ─── Main export function ─────────────────────────────────────────────────────

/**
 * Converts a slice blueprint into a Bedrock .mcstructure Uint8Array.
 *
 * The structure origin in-game is (0, 0, 0). Use a structure block or
 * /structure load to place it in the world.
 */
export async function exportToMcStructure(
  blueprint: SliceBlueprint,
): Promise<Uint8Array> {
  const { voxels, bounds } = voxelizeBlueprint(blueprint);

  if (voxels.length === 0) {
    throw new Error('Blueprint has no voxels — nothing to export');
  }

  // Tight bounding box
  const oX = bounds.minX;
  const oY = bounds.minY;
  const oZ = bounds.minZ;
  const W  = bounds.maxX - bounds.minX + 1; // x dimension
  const H  = bounds.maxY - bounds.minY + 1; // y dimension
  const D  = bounds.maxZ - bounds.minZ + 1; // z dimension

  // ── Build block palette ──────────────────────────────────────────────────
  // Palette index 0 is always air.
  const paletteMap  = new Map<string, number>();
  const paletteList: BedrockBlock[] = [];

  function getPaletteIndex(block: BedrockBlock): number {
    const k = paletteKey(block);
    let idx = paletteMap.get(k);
    if (idx === undefined) {
      idx = paletteList.length;
      paletteMap.set(k, idx);
      paletteList.push(block);
    }
    return idx;
  }

  // Air is always at index 0
  getPaletteIndex({ name: 'minecraft:air', states: {} });

  // Pre-register all voxel block types to build the palette
  for (const v of voxels) {
    getPaletteIndex(toBedrockBlock(v.blockType, v.blockState));
  }

  // ── Build flat index array ─────────────────────────────────────────────
  // Bedrock index: x + W * (z + D * y)  — x innermost, y outermost.
  const total   = W * H * D;
  const indices = new Int32Array(total); // default 0 = air

  for (const v of voxels) {
    const block = toBedrockBlock(v.blockType, v.blockState);
    const idx   = paletteMap.get(paletteKey(block))!;
    const x = v.x - oX;
    const y = v.y - oY;
    const z = v.z - oZ;
    indices[x + W * (z + D * y)] = idx;
  }

  // ── Build NBT palette entries ────────────────────────────────────────────
  const nbtPalette = paletteList.map(entry => {
    // Wrap integer states in Int32 to produce TAG_INT (not TAG_DOUBLE).
    const nbtStates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(entry.states)) {
      if (v instanceof Int32) {
        nbtStates[k] = v;
      } else if (typeof v === 'boolean') {
        nbtStates[k] = v; // boolean → TAG_BYTE 0/1 via nbtify
      } else {
        nbtStates[k] = v;
      }
    }
    return { name: entry.name, states: nbtStates, version: BLOCK_VERSION };
  });

  // ── Build block index arrays ─────────────────────────────────────────────
  // layer0 = main block indices; layer1 = liquid layer (all -1 = empty).
  // nbtify infers TAG_LIST<TAG_INT> from an array of Int32 instances.
  const layer0 = Array.from(indices, i => new Int32(i));
  const layer1 = Array.from({ length: total }, () => new Int32(-1));

  // ── Assemble NBT structure ────────────────────────────────────────────────
  const structureData = {
    format_version: new Int32(1),

    // [width, height, depth] as TAG_LIST<TAG_INT>
    size: [new Int32(W), new Int32(H), new Int32(D)],

    structure: {
      // TAG_LIST containing two TAG_LIST<TAG_INT> layers
      block_indices: [layer0, layer1],

      // Empty entity list — TAG_LIST with no elements
      entities: [] as never[],

      palette: {
        default: {
          block_palette: nbtPalette,
          block_position_data: {} as Record<string, never>,
        },
      },
    },

    // World origin for the structure — TAG_LIST<TAG_INT>
    structure_world_origin: [new Int32(0), new Int32(0), new Int32(0)],
  };

  return write(
    new NBTData(structureData as Parameters<typeof write>[0], {
      rootName:     '',
      endian:       'little',
      compression:  null,
      bedrockLevel: false,
    }),
  );
}

// ─── Browser download helper ──────────────────────────────────────────────────

/**
 * Triggers a browser file-download for a .mcstructure Uint8Array.
 *
 * Place the downloaded file in:
 *   <Bedrock world folder>/structures/
 * Then load it in-game with a structure block (Load mode) or
 *   /structure load <name> ~ ~ ~
 */
export function downloadMcStructure(
  bytes: Uint8Array,
  filename = 'al_shaheed.mcstructure',
): void {
  // Convert Uint8Array to ArrayBuffer for Blob (ensure proper ArrayBuffer type)
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
