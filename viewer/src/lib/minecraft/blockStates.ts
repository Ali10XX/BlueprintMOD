/**
 * blockStates.ts - Bedrock Edition Block State Definitions
 * 
 * This module contains comprehensive block state definitions for Minecraft Bedrock Edition.
 * Bedrock uses different state names than Java Edition (e.g., "weirdo_direction" vs "facing").
 * 
 * Reference: https://wiki.bedrock.dev/blocks/block-states.html
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Possible values for a block state property */
export type StateValue = string | number | boolean;

/** Definition of a single block state property */
export interface StateProperty {
  /** Property name as used in Bedrock NBT */
  name: string;
  /** Possible values for this property */
  values: StateValue[];
  /** Default value if not specified */
  default: StateValue;
  /** Human-readable description */
  description?: string;
}

/** Complete definition of a block's states */
export interface BlockStateDefinition {
  /** Block states properties */
  properties: Record<string, StateProperty>;
  /** Whether this block has directional states */
  directional?: boolean;
  /** Category for grouping */
  category?: string;
}

/** Block state values (actual data stored) */
export type BlockStates = Record<string, StateValue>;

// ============================================================================
// COMMON STATE PROPERTIES (reused across many blocks)
// ============================================================================

/** Direction for stairs, trapdoors, etc. (0-3 = east, west, south, north) */
const WEIRDO_DIRECTION: StateProperty = {
  name: 'weirdo_direction',
  values: [0, 1, 2, 3],
  default: 0,
  description: '0=east, 1=west, 2=south, 3=north',
};

/** Upside-down state for stairs, slabs */
const UPSIDE_DOWN_BIT: StateProperty = {
  name: 'upside_down_bit',
  values: [false, true],
  default: false,
  description: 'true if upside-down',
};

/** Top slot for slabs */
const TOP_SLOT_BIT: StateProperty = {
  name: 'top_slot_bit',
  values: [false, true],
  default: false,
  description: 'true if in top half of block',
};

/** Pillar axis for logs, basalt, etc. */
const PILLAR_AXIS: StateProperty = {
  name: 'pillar_axis',
  values: ['x', 'y', 'z'],
  default: 'y',
  description: 'Axis the pillar faces',
};

/** Cardinal direction (0-3) */
const DIRECTION: StateProperty = {
  name: 'direction',
  values: [0, 1, 2, 3],
  default: 0,
  description: '0=south, 1=west, 2=north, 3=east',
};

/** Facing direction (0-5 for all 6 faces) */
const FACING_DIRECTION: StateProperty = {
  name: 'facing_direction',
  values: [0, 1, 2, 3, 4, 5],
  default: 0,
  description: '0=down, 1=up, 2=north, 3=south, 4=west, 5=east',
};

/** Open state for doors, trapdoors, fence gates */
const OPEN_BIT: StateProperty = {
  name: 'open_bit',
  values: [false, true],
  default: false,
  description: 'true if open',
};

/** Door hinge side */
const DOOR_HINGE_BIT: StateProperty = {
  name: 'door_hinge_bit',
  values: [false, true],
  default: false,
  description: 'false=left, true=right',
};

/** Upper block of door */
const UPPER_BLOCK_BIT: StateProperty = {
  name: 'upper_block_bit',
  values: [false, true],
  default: false,
  description: 'true if upper half of door',
};

/** Torch facing direction */
const TORCH_FACING_DIRECTION: StateProperty = {
  name: 'torch_facing_direction',
  values: ['north', 'south', 'east', 'west', 'top', 'unknown'],
  default: 'top',
  description: 'Direction torch faces (attached to opposite side)',
};

/** Button pressed state */
const BUTTON_PRESSED_BIT: StateProperty = {
  name: 'button_pressed_bit',
  values: [false, true],
  default: false,
  description: 'true if pressed',
};

/** Powered state for redstone components */
const POWERED_BIT: StateProperty = {
  name: 'powered_bit',
  values: [false, true],
  default: false,
  description: 'true if powered',
};

// ============================================================================
// BLOCK STATE DEFINITIONS
// ============================================================================

export const BLOCK_STATES: Record<string, BlockStateDefinition> = {
  // ========== STAIRS ==========
  'minecraft:oak_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:spruce_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:birch_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:jungle_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:acacia_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:dark_oak_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:mangrove_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:cherry_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:bamboo_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:crimson_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:warped_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:stone_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:cobblestone_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:stone_brick_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:brick_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:nether_brick_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:quartz_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:sandstone_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:red_sandstone_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:purpur_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:prismarine_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:deepslate_brick_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:deepslate_tile_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:polished_deepslate_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },
  'minecraft:cobbled_deepslate_stairs': {
    properties: { weirdo_direction: WEIRDO_DIRECTION, upside_down_bit: UPSIDE_DOWN_BIT },
    directional: true,
    category: 'stairs',
  },

  // ========== SLABS ==========
  'minecraft:oak_slab': {
    properties: { top_slot_bit: TOP_SLOT_BIT },
    category: 'slabs',
  },
  'minecraft:spruce_slab': {
    properties: { top_slot_bit: TOP_SLOT_BIT },
    category: 'slabs',
  },
  'minecraft:birch_slab': {
    properties: { top_slot_bit: TOP_SLOT_BIT },
    category: 'slabs',
  },
  'minecraft:jungle_slab': {
    properties: { top_slot_bit: TOP_SLOT_BIT },
    category: 'slabs',
  },
  'minecraft:acacia_slab': {
    properties: { top_slot_bit: TOP_SLOT_BIT },
    category: 'slabs',
  },
  'minecraft:dark_oak_slab': {
    properties: { top_slot_bit: TOP_SLOT_BIT },
    category: 'slabs',
  },
  'minecraft:stone_slab': {
    properties: { top_slot_bit: TOP_SLOT_BIT },
    category: 'slabs',
  },
  'minecraft:cobblestone_slab': {
    properties: { top_slot_bit: TOP_SLOT_BIT },
    category: 'slabs',
  },
  'minecraft:brick_slab': {
    properties: { top_slot_bit: TOP_SLOT_BIT },
    category: 'slabs',
  },

  // ========== LOGS ==========
  'minecraft:oak_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:spruce_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:birch_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:jungle_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:acacia_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:dark_oak_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:mangrove_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:cherry_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:stripped_oak_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:stripped_spruce_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:stripped_birch_log': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'logs',
  },
  'minecraft:basalt': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'stone',
  },
  'minecraft:polished_basalt': {
    properties: { pillar_axis: PILLAR_AXIS },
    directional: true,
    category: 'stone',
  },
  'minecraft:bone_block': {
    properties: { 
      pillar_axis: { ...PILLAR_AXIS, name: 'deprecated' },
      direction: { name: 'direction', values: [0, 1, 2, 3], default: 0 }
    },
    directional: true,
    category: 'misc',
  },
  'minecraft:hay_block': {
    properties: { 
      pillar_axis: { ...PILLAR_AXIS, name: 'deprecated' },
      direction: { name: 'direction', values: [0, 1, 2, 3], default: 0 }
    },
    directional: true,
    category: 'misc',
  },

  // ========== DOORS ==========
  'minecraft:oak_door': {
    properties: {
      direction: DIRECTION,
      door_hinge_bit: DOOR_HINGE_BIT,
      open_bit: OPEN_BIT,
      upper_block_bit: UPPER_BLOCK_BIT,
    },
    directional: true,
    category: 'doors',
  },
  'minecraft:spruce_door': {
    properties: {
      direction: DIRECTION,
      door_hinge_bit: DOOR_HINGE_BIT,
      open_bit: OPEN_BIT,
      upper_block_bit: UPPER_BLOCK_BIT,
    },
    directional: true,
    category: 'doors',
  },
  'minecraft:birch_door': {
    properties: {
      direction: DIRECTION,
      door_hinge_bit: DOOR_HINGE_BIT,
      open_bit: OPEN_BIT,
      upper_block_bit: UPPER_BLOCK_BIT,
    },
    directional: true,
    category: 'doors',
  },
  'minecraft:iron_door': {
    properties: {
      direction: DIRECTION,
      door_hinge_bit: DOOR_HINGE_BIT,
      open_bit: OPEN_BIT,
      upper_block_bit: UPPER_BLOCK_BIT,
    },
    directional: true,
    category: 'doors',
  },

  // ========== TRAPDOORS ==========
  'minecraft:oak_trapdoor': {
    properties: {
      direction: DIRECTION,
      open_bit: OPEN_BIT,
      upside_down_bit: UPSIDE_DOWN_BIT,
    },
    directional: true,
    category: 'trapdoors',
  },
  'minecraft:spruce_trapdoor': {
    properties: {
      direction: DIRECTION,
      open_bit: OPEN_BIT,
      upside_down_bit: UPSIDE_DOWN_BIT,
    },
    directional: true,
    category: 'trapdoors',
  },
  'minecraft:iron_trapdoor': {
    properties: {
      direction: DIRECTION,
      open_bit: OPEN_BIT,
      upside_down_bit: UPSIDE_DOWN_BIT,
    },
    directional: true,
    category: 'trapdoors',
  },

  // ========== TORCHES ==========
  'minecraft:torch': {
    properties: { torch_facing_direction: TORCH_FACING_DIRECTION },
    directional: true,
    category: 'lighting',
  },
  'minecraft:soul_torch': {
    properties: { torch_facing_direction: TORCH_FACING_DIRECTION },
    directional: true,
    category: 'lighting',
  },
  'minecraft:redstone_torch': {
    properties: { torch_facing_direction: TORCH_FACING_DIRECTION },
    directional: true,
    category: 'redstone',
  },

  // ========== BUTTONS ==========
  'minecraft:stone_button': {
    properties: {
      facing_direction: FACING_DIRECTION,
      button_pressed_bit: BUTTON_PRESSED_BIT,
    },
    directional: true,
    category: 'redstone',
  },
  'minecraft:oak_button': {
    properties: {
      facing_direction: FACING_DIRECTION,
      button_pressed_bit: BUTTON_PRESSED_BIT,
    },
    directional: true,
    category: 'redstone',
  },

  // ========== LEVERS ==========
  'minecraft:lever': {
    properties: {
      lever_direction: {
        name: 'lever_direction',
        values: ['down_east_west', 'east', 'west', 'south', 'north', 'up_north_south', 'up_east_west', 'down_north_south'],
        default: 'up_north_south',
      },
      open_bit: OPEN_BIT,
    },
    directional: true,
    category: 'redstone',
  },

  // ========== FENCE GATES ==========
  'minecraft:fence_gate': {
    properties: {
      direction: DIRECTION,
      open_bit: OPEN_BIT,
      in_wall_bit: { name: 'in_wall_bit', values: [false, true], default: false },
    },
    directional: true,
    category: 'fences',
  },
  'minecraft:spruce_fence_gate': {
    properties: {
      direction: DIRECTION,
      open_bit: OPEN_BIT,
      in_wall_bit: { name: 'in_wall_bit', values: [false, true], default: false },
    },
    directional: true,
    category: 'fences',
  },

  // ========== PISTONS ==========
  'minecraft:piston': {
    properties: { facing_direction: FACING_DIRECTION },
    directional: true,
    category: 'redstone',
  },
  'minecraft:sticky_piston': {
    properties: { facing_direction: FACING_DIRECTION },
    directional: true,
    category: 'redstone',
  },

  // ========== OBSERVERS ==========
  'minecraft:observer': {
    properties: {
      facing_direction: FACING_DIRECTION,
      powered_bit: POWERED_BIT,
    },
    directional: true,
    category: 'redstone',
  },

  // ========== DISPENSERS/DROPPERS ==========
  'minecraft:dispenser': {
    properties: {
      facing_direction: FACING_DIRECTION,
      triggered_bit: { name: 'triggered_bit', values: [false, true], default: false },
    },
    directional: true,
    category: 'redstone',
  },
  'minecraft:dropper': {
    properties: {
      facing_direction: FACING_DIRECTION,
      triggered_bit: { name: 'triggered_bit', values: [false, true], default: false },
    },
    directional: true,
    category: 'redstone',
  },

  // ========== HOPPERS ==========
  'minecraft:hopper': {
    properties: {
      facing_direction: { ...FACING_DIRECTION, values: [0, 2, 3, 4, 5] }, // No up
      toggle_bit: { name: 'toggle_bit', values: [false, true], default: false },
    },
    directional: true,
    category: 'redstone',
  },

  // ========== CHESTS ==========
  'minecraft:chest': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'storage',
  },
  'minecraft:trapped_chest': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'storage',
  },
  'minecraft:ender_chest': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'storage',
  },
  'minecraft:barrel': {
    properties: {
      facing_direction: FACING_DIRECTION,
      open_bit: OPEN_BIT,
    },
    directional: true,
    category: 'storage',
  },

  // ========== FURNACES ==========
  'minecraft:furnace': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'functional',
  },
  'minecraft:lit_furnace': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'functional',
  },
  'minecraft:blast_furnace': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'functional',
  },
  'minecraft:smoker': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'functional',
  },

  // ========== BEDS ==========
  'minecraft:bed': {
    properties: {
      direction: DIRECTION,
      occupied_bit: { name: 'occupied_bit', values: [false, true], default: false },
      head_piece_bit: { name: 'head_piece_bit', values: [false, true], default: false },
    },
    directional: true,
    category: 'functional',
  },

  // ========== ANVILS ==========
  'minecraft:anvil': {
    properties: {
      direction: DIRECTION,
      damage: { name: 'damage', values: ['undamaged', 'slightly_damaged', 'very_damaged', 'broken'], default: 'undamaged' },
    },
    directional: true,
    category: 'functional',
  },

  // ========== GLAZED TERRACOTTA ==========
  'minecraft:white_glazed_terracotta': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'terracotta',
  },
  'minecraft:orange_glazed_terracotta': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'terracotta',
  },
  // ... (other glazed terracotta colors follow same pattern)

  // ========== CROPS ==========
  'minecraft:wheat': {
    properties: { growth: { name: 'growth', values: [0, 1, 2, 3, 4, 5, 6, 7], default: 0 } },
    category: 'crops',
  },
  'minecraft:carrots': {
    properties: { growth: { name: 'growth', values: [0, 1, 2, 3, 4, 5, 6, 7], default: 0 } },
    category: 'crops',
  },
  'minecraft:potatoes': {
    properties: { growth: { name: 'growth', values: [0, 1, 2, 3, 4, 5, 6, 7], default: 0 } },
    category: 'crops',
  },
  'minecraft:beetroot': {
    properties: { growth: { name: 'growth', values: [0, 1, 2, 3, 4, 5, 6, 7], default: 0 } },
    category: 'crops',
  },

  // ========== LANTERNS ==========
  'minecraft:lantern': {
    properties: { hanging: { name: 'hanging', values: [false, true], default: false } },
    category: 'lighting',
  },
  'minecraft:soul_lantern': {
    properties: { hanging: { name: 'hanging', values: [false, true], default: false } },
    category: 'lighting',
  },

  // ========== CAMPFIRES ==========
  'minecraft:campfire': {
    properties: {
      direction: DIRECTION,
      extinguished: { name: 'extinguished', values: [false, true], default: false },
    },
    directional: true,
    category: 'lighting',
  },
  'minecraft:soul_campfire': {
    properties: {
      direction: DIRECTION,
      extinguished: { name: 'extinguished', values: [false, true], default: false },
    },
    directional: true,
    category: 'lighting',
  },

  // ========== SIGNS ==========
  'minecraft:standing_sign': {
    properties: {
      ground_sign_direction: { name: 'ground_sign_direction', values: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], default: 0 },
    },
    directional: true,
    category: 'signs',
  },
  'minecraft:wall_sign': {
    properties: { facing_direction: { ...FACING_DIRECTION, values: [2, 3, 4, 5] } },
    directional: true,
    category: 'signs',
  },

  // ========== RAILS ==========
  'minecraft:rail': {
    properties: {
      rail_direction: { name: 'rail_direction', values: [0,1,2,3,4,5,6,7,8,9], default: 0 },
    },
    directional: true,
    category: 'redstone',
  },
  'minecraft:golden_rail': {
    properties: {
      rail_direction: { name: 'rail_direction', values: [0,1,2,3,4,5], default: 0 },
      rail_data_bit: { name: 'rail_data_bit', values: [false, true], default: false },
    },
    directional: true,
    category: 'redstone',
  },
  'minecraft:detector_rail': {
    properties: {
      rail_direction: { name: 'rail_direction', values: [0,1,2,3,4,5], default: 0 },
      rail_data_bit: { name: 'rail_data_bit', values: [false, true], default: false },
    },
    directional: true,
    category: 'redstone',
  },
  'minecraft:activator_rail': {
    properties: {
      rail_direction: { name: 'rail_direction', values: [0,1,2,3,4,5], default: 0 },
      rail_data_bit: { name: 'rail_data_bit', values: [false, true], default: false },
    },
    directional: true,
    category: 'redstone',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets the block state definition for a given block type
 * @param blockType - Block ID (e.g., "minecraft:oak_stairs")
 * @returns Block state definition or undefined if not found
 */
export function getBlockStateDefinition(blockType: string): BlockStateDefinition | undefined {
  return BLOCK_STATES[blockType];
}

/**
 * Checks if a block type has directional states
 * @param blockType - Block ID
 * @returns true if the block is directional
 */
export function isDirectionalBlock(blockType: string): boolean {
  const def = BLOCK_STATES[blockType];
  return def?.directional === true;
}

/**
 * Gets default states for a block type
 * @param blockType - Block ID
 * @returns Default block states or empty object
 */
export function getDefaultStates(blockType: string): BlockStates {
  const def = BLOCK_STATES[blockType];
  if (!def) return {};
  
  const states: BlockStates = {};
  for (const [_key, prop] of Object.entries(def.properties)) {
    states[prop.name] = prop.default;
  }
  return states;
}

/**
 * Validates block states against definition
 * @param blockType - Block ID
 * @param states - States to validate
 * @returns Object with valid states (invalid ones replaced with defaults)
 */
export function validateStates(blockType: string, states: BlockStates): BlockStates {
  const def = BLOCK_STATES[blockType];
  if (!def) return {};
  
  const validated: BlockStates = {};
  
  for (const [_key, prop] of Object.entries(def.properties)) {
    const value = states[prop.name];
    
    if (value !== undefined && (prop.values as StateValue[]).includes(value)) {
      validated[prop.name] = value;
    } else {
      validated[prop.name] = prop.default;
    }
  }
  
  return validated;
}

/**
 * Converts stair direction from compass to Bedrock weirdo_direction
 * @param direction - Compass direction ("north", "south", "east", "west")
 * @returns Bedrock weirdo_direction value (0-3)
 */
export function compassToWeirdoDirection(direction: string): number {
  const map: Record<string, number> = {
    'east': 0,
    'west': 1,
    'south': 2,
    'north': 3,
  };
  return map[direction.toLowerCase()] ?? 0;
}

/**
 * Converts Bedrock weirdo_direction to compass direction
 * @param weirdoDir - Bedrock direction value (0-3)
 * @returns Compass direction string
 */
export function weirdoDirectionToCompass(weirdoDir: number): string {
  const map = ['east', 'west', 'south', 'north'];
  return map[weirdoDir] ?? 'east';
}

/**
 * Converts facing_direction to compass/vertical
 * @param facingDir - Facing direction (0-5)
 * @returns Direction string
 */
export function facingDirectionToString(facingDir: number): string {
  const map = ['down', 'up', 'north', 'south', 'west', 'east'];
  return map[facingDir] ?? 'north';
}

/**
 * Converts direction string to facing_direction
 * @param direction - Direction string
 * @returns Facing direction value (0-5)
 */
export function stringToFacingDirection(direction: string): number {
  const map: Record<string, number> = {
    'down': 0,
    'up': 1,
    'north': 2,
    'south': 3,
    'west': 4,
    'east': 5,
  };
  return map[direction.toLowerCase()] ?? 2;
}
