/**
 * textureManager.ts
 *
 * Loads and caches THREE.js Texture objects for Minecraft block types.
 * Uses NearestFilter for pixel-perfect Minecraft-style rendering.
 *
 * Resolution order:
 *   1. Individual PNG at /minecraft/textures/<blockName>.png
 *   2. null (warned) — caller falls back to color mode
 *
 * Setup:
 *   Place texture PNGs at:  public/minecraft/textures/<blockName>.png
 *
 *   Java Edition:   open minecraft.jar → assets/minecraft/textures/block/
 *   Bedrock Edition: extract vanilla resource pack → textures/blocks/
 *
 *   See public/minecraft_resource_pack/README.md for detailed instructions.
 */

import * as THREE from 'three';

// ─── Texture path registry ─────────────────────────────────────────────────────

/** Maps clean block names (no 'minecraft:' prefix) → PNG path under /public. */
const BLOCK_TEXTURE_PATHS: Readonly<Record<string, string>> = {
  // ── Prismarine ──────────────────────────────────────────────────────────────
  prismarine:                       '/minecraft/textures/prismarine.png',
  dark_prismarine:                  '/minecraft/textures/dark_prismarine.png',
  prismarine_bricks:                '/minecraft/textures/prismarine_bricks.png',
  prismarine_stairs:                '/minecraft/textures/prismarine.png',
  prismarine_slab:                  '/minecraft/textures/prismarine.png',

  // ── Oxidized copper ─────────────────────────────────────────────────────────
  waxed_oxidized_cut_copper:        '/minecraft/textures/waxed_oxidized_cut_copper.png',
  oxidized_cut_copper:              '/minecraft/textures/oxidized_cut_copper.png',
  waxed_oxidized_cut_copper_stairs: '/minecraft/textures/waxed_oxidized_cut_copper.png',
  waxed_oxidized_cut_copper_slab:   '/minecraft/textures/waxed_oxidized_cut_copper.png',

  // ── Quartz ──────────────────────────────────────────────────────────────────
  smooth_quartz:                    '/minecraft/textures/smooth_quartz.png',
  smooth_quartz_slab:               '/minecraft/textures/smooth_quartz.png',
  smooth_quartz_stairs:             '/minecraft/textures/smooth_quartz.png',
  quartz_block:                     '/minecraft/textures/quartz_block_side.png',
  quartz_slab:                      '/minecraft/textures/quartz_block_side.png',
  quartz_stairs:                    '/minecraft/textures/quartz_block_side.png',
  quartz_bricks:                    '/minecraft/textures/quartz_bricks.png',
  chiseled_quartz_block:            '/minecraft/textures/chiseled_quartz_block.png',

  // ── Concrete ────────────────────────────────────────────────────────────────
  cyan_concrete:                    '/minecraft/textures/cyan_concrete.png',
  cyan_concrete_slab:               '/minecraft/textures/cyan_concrete.png',
  cyan_concrete_stairs:             '/minecraft/textures/cyan_concrete.png',
  light_blue_concrete:              '/minecraft/textures/light_blue_concrete.png',
  white_concrete:                   '/minecraft/textures/white_concrete.png',
  gray_concrete:                    '/minecraft/textures/gray_concrete.png',
  black_concrete:                   '/minecraft/textures/black_concrete.png',
  orange_concrete:                  '/minecraft/textures/orange_concrete.png',
  blue_concrete:                    '/minecraft/textures/blue_concrete.png',
  red_concrete:                     '/minecraft/textures/red_concrete.png',
  lime_concrete:                    '/minecraft/textures/lime_concrete.png',
  yellow_concrete:                  '/minecraft/textures/yellow_concrete.png',

  // ── Terracotta ──────────────────────────────────────────────────────────────
  cyan_terracotta:                  '/minecraft/textures/cyan_terracotta.png',
  terracotta:                       '/minecraft/textures/terracotta.png',
  white_terracotta:                 '/minecraft/textures/white_terracotta.png',
  light_gray_terracotta:            '/minecraft/textures/light_gray_terracotta.png',

  // ── Stone / misc ────────────────────────────────────────────────────────────
  stone:                            '/minecraft/textures/stone.png',
  cobblestone:                      '/minecraft/textures/cobblestone.png',
  sandstone:                        '/minecraft/textures/sandstone_side.png',
  obsidian:                         '/minecraft/textures/obsidian.png',
  calcite:                          '/minecraft/textures/calcite.png',
  nether_bricks:                    '/minecraft/textures/nether_bricks.png',
  blackstone:                       '/minecraft/textures/blackstone.png',
  basalt:                           '/minecraft/textures/basalt_side.png',

  // ── Planks ──────────────────────────────────────────────────────────────────
  oak_planks:                       '/minecraft/textures/oak_planks.png',
  spruce_planks:                    '/minecraft/textures/spruce_planks.png',
  birch_planks:                     '/minecraft/textures/birch_planks.png',
  dark_oak_planks:                  '/minecraft/textures/dark_oak_planks.png',
  acacia_planks:                    '/minecraft/textures/acacia_planks.png',
  warped_planks:                    '/minecraft/textures/warped_planks.png',
  crimson_planks:                   '/minecraft/textures/crimson_planks.png',

  // ── Metal / gem blocks ──────────────────────────────────────────────────────
  iron_block:                       '/minecraft/textures/iron_block.png',
  gold_block:                       '/minecraft/textures/gold_block.png',
  diamond_block:                    '/minecraft/textures/diamond_block.png',
  emerald_block:                    '/minecraft/textures/emerald_block.png',
  copper_block:                     '/minecraft/textures/copper_block.png',

  // ── Terrain ─────────────────────────────────────────────────────────────────
  dirt:                             '/minecraft/textures/dirt.png',
  grass_block:                      '/minecraft/textures/grass_block_top.png',
  sand:                             '/minecraft/textures/sand.png',
  gravel:                           '/minecraft/textures/gravel.png',
  clay:                             '/minecraft/textures/clay.png',
  snow_block:                       '/minecraft/textures/snow.png',
  ice:                              '/minecraft/textures/ice.png',
  packed_ice:                       '/minecraft/textures/packed_ice.png',
};

// ─── Module-level cache ────────────────────────────────────────────────────────

const _loader = new THREE.TextureLoader();
/** Deduplicates concurrent load requests for the same block name. */
const _cache  = new Map<string, Promise<THREE.Texture | null>>();

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns the registered texture path for a block, or null if unknown. */
export function getTexturePath(blockName: string): string | null {
  return BLOCK_TEXTURE_PATHS[blockName.replace('minecraft:', '')] ?? null;
}

/**
 * Loads (or returns cached) a THREE.Texture for a block name.
 *
 * - Returns null if the block is unknown or its PNG cannot be fetched.
 * - NearestFilter gives crisp Minecraft pixel-art rendering.
 * - SRGBColorSpace matches browser gamma and Three.js sRGB output.
 */
export function loadBlockTexture(blockName: string): Promise<THREE.Texture | null> {
  const clean = blockName.replace('minecraft:', '');
  if (_cache.has(clean)) return _cache.get(clean)!;

  const path = BLOCK_TEXTURE_PATHS[clean];
  if (!path) {
    const p = Promise.resolve<THREE.Texture | null>(null);
    _cache.set(clean, p);
    return p;
  }

  const promise = _loader.loadAsync(path)
    .then(tex => {
      tex.colorSpace     = THREE.SRGBColorSpace;
      tex.magFilter      = THREE.NearestFilter;
      tex.minFilter      = THREE.NearestFilter;
      tex.generateMipmaps = false;
      return tex as THREE.Texture | null;
    })
    .catch(err => {
      console.warn(`textureManager: failed to load "${path}" for "${clean}"`, err);
      return null;
    });

  _cache.set(clean, promise);
  return promise;
}

/**
 * Loads textures for multiple block names in parallel.
 * Returns Map<cleanBlockName, Texture | null>.
 */
export async function loadBlockTextures(
  blockNames: string[],
): Promise<Map<string, THREE.Texture | null>> {
  const entries = await Promise.all(
    blockNames.map(async name => {
      const clean = name.replace('minecraft:', '');
      const tex   = await loadBlockTexture(name);
      return [clean, tex] as const;
    }),
  );
  return new Map(entries);
}

/** Clears the texture cache (useful for hot-reload during development). */
export function clearTextureCache(): void {
  _cache.clear();
}
