// Block color mapping for rendering
// Colors are approximate Minecraft block colors

export const BLOCK_COLORS: Record<string, string> = {
  // Stone types
  'minecraft:stone': '#7d7d7d',
  'minecraft:cobblestone': '#6b6b6b',
  'minecraft:stone_bricks': '#7a7a7a',
  'minecraft:mossy_stone_bricks': '#6b7d5f',
  'minecraft:cracked_stone_bricks': '#757575',
  'minecraft:deepslate': '#4a4a4a',
  'minecraft:granite': '#9a6b4d',
  'minecraft:diorite': '#b5b5b5',
  'minecraft:andesite': '#8a8a8a',
  'minecraft:smooth_stone': '#9e9e9e',
  'minecraft:bricks': '#9b5d4a',

  // Dirt/grass
  'minecraft:dirt': '#8b6b4a',
  'minecraft:grass_block': '#5d9c4a',
  'minecraft:grass': '#5d9c4a',
  'minecraft:podzol': '#6b5638',
  'minecraft:mycelium': '#8b7b88',
  'minecraft:coarse_dirt': '#7a5d3d',

  // Sand
  'minecraft:sand': '#dbd3a0',
  'minecraft:sandstone': '#d9cc8f',
  'minecraft:red_sand': '#bf6d2e',
  'minecraft:red_sandstone': '#b85c2b',
  'minecraft:gravel': '#8a8279',

  // Wood - Oak
  'minecraft:oak_planks': '#bc9862',
  'minecraft:oak_log': '#6b5130',
  'minecraft:oak_wood': '#6b5130',
  'minecraft:stripped_oak_log': '#bc9862',
  'minecraft:oak_stairs': '#bc9862',
  'minecraft:oak_slab': '#bc9862',
  'minecraft:oak_fence': '#bc9862',
  'minecraft:oak_door': '#bc9862',
  'minecraft:oak_trapdoor': '#bc9862',

  // Wood - Spruce
  'minecraft:spruce_planks': '#735431',
  'minecraft:spruce_log': '#3d2e1d',
  'minecraft:spruce_wood': '#3d2e1d',
  'minecraft:stripped_spruce_log': '#735431',
  'minecraft:spruce_stairs': '#735431',
  'minecraft:spruce_slab': '#735431',

  // Wood - Birch
  'minecraft:birch_planks': '#c5b77a',
  'minecraft:birch_log': '#d4d4d4',
  'minecraft:birch_wood': '#d4d4d4',
  'minecraft:stripped_birch_log': '#c5b77a',

  // Wood - Jungle
  'minecraft:jungle_planks': '#b88855',
  'minecraft:jungle_log': '#5b4825',

  // Wood - Acacia
  'minecraft:acacia_planks': '#ba6337',
  'minecraft:acacia_log': '#6a6a6a',

  // Wood - Dark Oak
  'minecraft:dark_oak_planks': '#4a3321',
  'minecraft:dark_oak_log': '#3d2e1d',

  // Wood - Mangrove
  'minecraft:mangrove_planks': '#7a3636',
  'minecraft:mangrove_log': '#5a3d30',

  // Wood - Cherry
  'minecraft:cherry_planks': '#e4b7b7',
  'minecraft:cherry_log': '#3d2d32',

  // Wood - Bamboo
  'minecraft:bamboo_planks': '#c5a93c',
  'minecraft:bamboo_block': '#6b8a35',

  // Wool
  'minecraft:white_wool': '#e9e9e9',
  'minecraft:orange_wool': '#d87f33',
  'minecraft:magenta_wool': '#b24cd8',
  'minecraft:light_blue_wool': '#6699d8',
  'minecraft:yellow_wool': '#e5e533',
  'minecraft:lime_wool': '#7fcc19',
  'minecraft:pink_wool': '#f27fa5',
  'minecraft:gray_wool': '#4c4c4c',
  'minecraft:light_gray_wool': '#999999',
  'minecraft:cyan_wool': '#4c7f99',
  'minecraft:purple_wool': '#7f3fb2',
  'minecraft:blue_wool': '#334cb2',
  'minecraft:brown_wool': '#664c33',
  'minecraft:green_wool': '#667f33',
  'minecraft:red_wool': '#993333',
  'minecraft:black_wool': '#191919',

  // Concrete
  'minecraft:white_concrete': '#cfd5d6',
  'minecraft:orange_concrete': '#e06101',
  'minecraft:magenta_concrete': '#a9309f',
  'minecraft:light_blue_concrete': '#2389c7',
  'minecraft:yellow_concrete': '#f1af15',
  'minecraft:lime_concrete': '#5ea918',
  'minecraft:pink_concrete': '#d6658f',
  'minecraft:gray_concrete': '#36393d',
  'minecraft:light_gray_concrete': '#7d7d73',
  'minecraft:cyan_concrete': '#157788',
  'minecraft:purple_concrete': '#64209c',
  'minecraft:blue_concrete': '#2d2f8f',
  'minecraft:brown_concrete': '#603b1f',
  'minecraft:green_concrete': '#495b24',
  'minecraft:red_concrete': '#8e2121',
  'minecraft:black_concrete': '#080a0f',

  // Terracotta
  'minecraft:terracotta': '#985f45',
  'minecraft:white_terracotta': '#d1b2a1',
  'minecraft:orange_terracotta': '#a05325',
  'minecraft:magenta_terracotta': '#95586c',
  'minecraft:light_blue_terracotta': '#706c8a',
  'minecraft:yellow_terracotta': '#ba8523',
  'minecraft:lime_terracotta': '#677534',
  'minecraft:pink_terracotta': '#a04d4e',
  'minecraft:gray_terracotta': '#392a24',
  'minecraft:light_gray_terracotta': '#876a61',
  'minecraft:cyan_terracotta': '#565a5b',
  'minecraft:purple_terracotta': '#764556',
  'minecraft:blue_terracotta': '#4a3b5b',
  'minecraft:brown_terracotta': '#4d3224',
  'minecraft:green_terracotta': '#4c532a',
  'minecraft:red_terracotta': '#8e3b2e',
  'minecraft:black_terracotta': '#251610',

  // Glass
  'minecraft:glass': '#c0d5d5',
  'minecraft:white_stained_glass': '#ffffff',
  'minecraft:orange_stained_glass': '#d87f33',
  'minecraft:magenta_stained_glass': '#b24cd8',
  'minecraft:light_blue_stained_glass': '#6699d8',
  'minecraft:yellow_stained_glass': '#e5e533',
  'minecraft:lime_stained_glass': '#7fcc19',
  'minecraft:pink_stained_glass': '#f27fa5',
  'minecraft:gray_stained_glass': '#4c4c4c',
  'minecraft:light_gray_stained_glass': '#999999',
  'minecraft:cyan_stained_glass': '#4c7f99',
  'minecraft:purple_stained_glass': '#7f3fb2',
  'minecraft:blue_stained_glass': '#334cb2',
  'minecraft:brown_stained_glass': '#664c33',
  'minecraft:green_stained_glass': '#667f33',
  'minecraft:red_stained_glass': '#993333',
  'minecraft:black_stained_glass': '#191919',
  'minecraft:glass_pane': '#c0d5d5',

  // Ores
  'minecraft:coal_ore': '#6b6b6b',
  'minecraft:iron_ore': '#8a7766',
  'minecraft:gold_ore': '#8a7a50',
  'minecraft:diamond_ore': '#7a9a9a',
  'minecraft:emerald_ore': '#6b8a6b',
  'minecraft:lapis_ore': '#6b7a8a',
  'minecraft:redstone_ore': '#8a5050',
  'minecraft:copper_ore': '#8a7a6b',

  // Metal blocks
  'minecraft:iron_block': '#d8d8d8',
  'minecraft:gold_block': '#f9d849',
  'minecraft:diamond_block': '#62ede6',
  'minecraft:emerald_block': '#41d979',
  'minecraft:lapis_block': '#1e4a99',
  'minecraft:redstone_block': '#aa0000',
  'minecraft:copper_block': '#c06e4f',
  'minecraft:netherite_block': '#3d3535',

  // Nether
  'minecraft:netherrack': '#6b3333',
  'minecraft:nether_bricks': '#2d1518',
  'minecraft:soul_sand': '#4a3c2f',
  'minecraft:soul_soil': '#4a3c2f',
  'minecraft:glowstone': '#f9d849',
  'minecraft:basalt': '#4a4a4a',
  'minecraft:blackstone': '#2d2a2d',
  'minecraft:crimson_planks': '#7a3344',
  'minecraft:warped_planks': '#2d7a7a',
  'minecraft:crimson_stem': '#6b2a3a',
  'minecraft:warped_stem': '#2a6b6b',

  // End
  'minecraft:end_stone': '#d9d99e',
  'minecraft:end_stone_bricks': '#d9d99e',
  'minecraft:purpur_block': '#a77ba7',
  'minecraft:purpur_pillar': '#a77ba7',

  // Prismarine
  'minecraft:prismarine': '#5f9a9a',
  'minecraft:prismarine_bricks': '#5f9a9a',
  'minecraft:dark_prismarine': '#3a5f5f',
  'minecraft:sea_lantern': '#9ad5d5',

  // Misc
  'minecraft:obsidian': '#1a0a24',
  'minecraft:crying_obsidian': '#1a0a24',
  'minecraft:bedrock': '#353535',
  'minecraft:ice': '#92b5e8',
  'minecraft:packed_ice': '#8aaae4',
  'minecraft:blue_ice': '#74a8ea',
  'minecraft:snow_block': '#f0f0f0',
  'minecraft:clay': '#9ea4b0',
  'minecraft:sponge': '#c2b545',
  'minecraft:wet_sponge': '#a99929',
  'minecraft:hay_block': '#b5970c',
  'minecraft:honey_block': '#eba934',
  'minecraft:honeycomb_block': '#e09a1b',
  'minecraft:slime_block': '#7ebf6e',
  'minecraft:moss_block': '#5d7a3d',
  'minecraft:sculk': '#0d3d49',
  'minecraft:amethyst_block': '#8b5fb5',
  'minecraft:tuff': '#6b6b60',
  'minecraft:calcite': '#e0ddd5',
  'minecraft:dripstone_block': '#8a7a6b',
  'minecraft:mud': '#3d3a35',
  'minecraft:mud_bricks': '#8a7a6b',
  'minecraft:packed_mud': '#8a7766',

  // Leaves (semi-transparent in game, solid color here)
  'minecraft:oak_leaves': '#4a7a2d',
  'minecraft:spruce_leaves': '#3a5a2d',
  'minecraft:birch_leaves': '#5a8a4a',
  'minecraft:jungle_leaves': '#3a8a2d',
  'minecraft:acacia_leaves': '#5a7a3a',
  'minecraft:dark_oak_leaves': '#3a5a2d',
  'minecraft:azalea_leaves': '#5a8a4a',
  'minecraft:flowering_azalea_leaves': '#7a5a8a',
  'minecraft:mangrove_leaves': '#4a6a2d',
  'minecraft:cherry_leaves': '#e8b8c8',

  // Torch/light sources
  'minecraft:torch': '#ffcc00',
  'minecraft:wall_torch': '#ffcc00',
  'minecraft:lantern': '#f5d26c',
  'minecraft:soul_lantern': '#6cd5f5',
  'minecraft:campfire': '#ff6600',
  'minecraft:soul_campfire': '#00ccff',
  'minecraft:shroomlight': '#f5c26c',
  'minecraft:jack_o_lantern': '#f5a500',

  // Redstone
  'minecraft:redstone_wire': '#aa0000',
  'minecraft:redstone_torch': '#ff3300',
  'minecraft:repeater': '#9e9e9e',
  'minecraft:comparator': '#9e9e9e',
  'minecraft:piston': '#9a8a6a',
  'minecraft:sticky_piston': '#7a9a4a',
  'minecraft:observer': '#7d7d7d',
  'minecraft:dispenser': '#7d7d7d',
  'minecraft:dropper': '#7d7d7d',
  'minecraft:hopper': '#4a4a4a',
  'minecraft:lever': '#6b5130',
  'minecraft:tripwire_hook': '#6b5130',

  // Rails
  'minecraft:rail': '#8a7766',
  'minecraft:powered_rail': '#d4a84a',
  'minecraft:detector_rail': '#8a4a4a',
  'minecraft:activator_rail': '#8a4a4a',

  // Flowers and plants
  'minecraft:dandelion': '#f5e500',
  'minecraft:poppy': '#e03030',
  'minecraft:blue_orchid': '#3090e0',
  'minecraft:allium': '#b080d0',
  'minecraft:azure_bluet': '#d0e0e0',
  'minecraft:red_tulip': '#e03030',
  'minecraft:orange_tulip': '#e07030',
  'minecraft:white_tulip': '#e0e0e0',
  'minecraft:pink_tulip': '#e080a0',
  'minecraft:oxeye_daisy': '#e0e0a0',
  'minecraft:cornflower': '#5090d0',
  'minecraft:lily_of_the_valley': '#e0e0e0',
  'minecraft:wither_rose': '#202020',
  'minecraft:sunflower': '#f5c500',
  'minecraft:lilac': '#b080b0',
  'minecraft:rose_bush': '#e03030',
  'minecraft:peony': '#e0a0b0',
  'minecraft:tall_grass': '#5a8a4a',
  'minecraft:fern': '#4a7a3a',
  'minecraft:dead_bush': '#8a6a4a',

  // Crops
  'minecraft:wheat': '#d4a84a',
  'minecraft:carrots': '#e08030',
  'minecraft:potatoes': '#c5a045',
  'minecraft:beetroots': '#8a3030',
  'minecraft:melon': '#8a9a3a',
  'minecraft:pumpkin': '#d47a20',
  'minecraft:carved_pumpkin': '#d47a20',
  'minecraft:cactus': '#4a7a30',
  'minecraft:sugar_cane': '#8aba6a',
  'minecraft:bamboo': '#6a9a30',
  'minecraft:cocoa': '#8a5a30',

  // Water/lava (will be semi-transparent)
  'minecraft:water': '#3f76e4',
  'minecraft:lava': '#cf4a00',

  // Chests and storage
  'minecraft:chest': '#8a6a3a',
  'minecraft:trapped_chest': '#8a6a3a',
  'minecraft:ender_chest': '#0a2a2a',
  'minecraft:barrel': '#8a6a3a',
  'minecraft:shulker_box': '#8a5080',

  // Workstations
  'minecraft:crafting_table': '#8a6a3a',
  'minecraft:furnace': '#6b6b6b',
  'minecraft:blast_furnace': '#4a4a4a',
  'minecraft:smoker': '#6b5130',
  'minecraft:anvil': '#4a4a4a',
  'minecraft:enchanting_table': '#4a0a4a',
  'minecraft:brewing_stand': '#6b5130',
  'minecraft:cauldron': '#4a4a4a',
  'minecraft:lectern': '#bc9862',
  'minecraft:cartography_table': '#6b5130',
  'minecraft:fletching_table': '#c5b77a',
  'minecraft:smithing_table': '#2a2a4a',
  'minecraft:loom': '#bc9862',
  'minecraft:stonecutter': '#7d7d7d',
  'minecraft:grindstone': '#7d7d7d',
  'minecraft:composter': '#8a6a3a',
  'minecraft:beehive': '#bc9862',
  'minecraft:bee_nest': '#c5a045',

  // Beds
  'minecraft:white_bed': '#e9e9e9',
  'minecraft:red_bed': '#993333',
  'minecraft:blue_bed': '#334cb2',
  'minecraft:green_bed': '#667f33',

  // Misc items as blocks
  'minecraft:bookshelf': '#8a6a3a',
  'minecraft:ladder': '#8a6a3a',
  'minecraft:scaffolding': '#bc9862',
  'minecraft:chain': '#4a4a4a',
  'minecraft:iron_bars': '#8a8a8a',
  'minecraft:bell': '#d4a84a',
  'minecraft:lightning_rod': '#c06e4f',

  // Default fallback
  'default': '#ff00ff', // Magenta for unknown blocks
};

// Get block color with fallback
export function getBlockColor(blockType: string): string {
  return BLOCK_COLORS[blockType] || BLOCK_COLORS['default'];
}

// Get display name from block ID
export function getBlockDisplayName(blockType: string): string {
  // Remove minecraft: prefix and convert underscores to spaces
  const name = blockType.replace('minecraft:', '').replace(/_/g, ' ');
  // Capitalize each word
  return name.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

// Get block category for materials list grouping
export function getBlockCategory(blockType: string): string {
  const type = blockType.toLowerCase();

  if (type.includes('wool')) return 'Wool';
  if (type.includes('concrete')) return 'Concrete';
  if (type.includes('terracotta')) return 'Terracotta';
  if (type.includes('glass')) return 'Glass';
  if (type.includes('planks') || type.includes('log') || type.includes('wood') ||
      type.includes('fence') || type.includes('door') || type.includes('trapdoor') ||
      type.includes('stairs') || type.includes('slab')) return 'Wood';
  if (type.includes('stone') || type.includes('cobble') || type.includes('brick') ||
      type.includes('deepslate') || type.includes('granite') || type.includes('diorite') ||
      type.includes('andesite')) return 'Stone';
  if (type.includes('ore')) return 'Ores';
  if (type.includes('_block') && (type.includes('iron') || type.includes('gold') ||
      type.includes('diamond') || type.includes('emerald') || type.includes('lapis') ||
      type.includes('redstone') || type.includes('copper') || type.includes('netherite'))) return 'Metal Blocks';
  if (type.includes('sand')) return 'Sand';
  if (type.includes('nether') || type.includes('soul') || type.includes('basalt') ||
      type.includes('blackstone') || type.includes('crimson') || type.includes('warped')) return 'Nether';
  if (type.includes('end_') || type.includes('purpur')) return 'End';
  if (type.includes('prismarine') || type.includes('sea_lantern')) return 'Prismarine';
  if (type.includes('leaves')) return 'Leaves';
  if (type.includes('flower') || type.includes('tulip') || type.includes('daisy') ||
      type.includes('dandelion') || type.includes('poppy') || type.includes('orchid') ||
      type.includes('allium') || type.includes('bluet') || type.includes('lily') ||
      type.includes('rose') || type.includes('cornflower') || type.includes('sunflower') ||
      type.includes('lilac') || type.includes('peony')) return 'Flowers';
  if (type.includes('torch') || type.includes('lantern') || type.includes('glowstone') ||
      type.includes('shroomlight') || type.includes('sea_lantern')) return 'Light Sources';
  if (type.includes('redstone') || type.includes('piston') || type.includes('observer') ||
      type.includes('dispenser') || type.includes('dropper') || type.includes('hopper') ||
      type.includes('repeater') || type.includes('comparator')) return 'Redstone';

  return 'Misc';
}
