/**
 * minecraftColors.ts
 *
 * Derives representative preview colors for Minecraft block types by loading
 * actual texture images at runtime and computing a per-channel median RGB.
 *
 * Priority:
 *   1. Individual PNG  (e.g. /minecraft/textures/prismarine.png)
 *   2. Atlas PNG tile  (e.g. /minecraft/terrain_texture.png, col/row coords)
 *   3. Hard-coded fallback hex
 *
 * Usage:
 *   const colorMap = await loadAllBlockColors();
 *   const hex = colorMap.get('prismarine') ?? '#808080';
 *
 * Place texture files at:
 *   public/minecraft/textures/<blockName>.png        (individual textures)
 *   public/minecraft/terrain_texture.png             (optional atlas)
 *
 * See public/minecraft/textures/SETUP.md for download instructions.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlockTextureConfig {
  /** URL path relative to public root (e.g. '/minecraft/textures/prismarine.png'). */
  singleTexturePath: string;
  /** Horizontal tile index in the atlas (0-based). */
  atlasCol: number;
  /** Vertical tile index in the atlas (0-based). */
  atlasRow: number;
  /** Hex color used when all image loading fails. */
  fallback: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Standard Minecraft texture tile size in pixels. */
export const ATLAS_TILE_PX = 16;

/**
 * Maps clean block names (without 'minecraft:' prefix) to texture config.
 * Stairs and slabs point to their base block texture.
 * Atlas col/row values are approximate and only used if individual PNGs are absent.
 */
export const BLOCK_TEXTURE_CONFIGS: Readonly<Record<string, BlockTextureConfig>> = {
  // Prismarine family
  prismarine:              { singleTexturePath: '/minecraft/textures/prismarine.png',              atlasCol: 0, atlasRow: 12, fallback: '#4d9a96' },
  dark_prismarine:         { singleTexturePath: '/minecraft/textures/dark_prismarine.png',         atlasCol: 2, atlasRow: 12, fallback: '#2d5e59' },
  prismarine_bricks:       { singleTexturePath: '/minecraft/textures/prismarine_bricks.png',       atlasCol: 1, atlasRow: 12, fallback: '#4a8585' },
  // Stairs / slabs share base block texture
  prismarine_stairs:       { singleTexturePath: '/minecraft/textures/prismarine.png',              atlasCol: 0, atlasRow: 12, fallback: '#4d9a96' },
  prismarine_slab:         { singleTexturePath: '/minecraft/textures/prismarine.png',              atlasCol: 0, atlasRow: 12, fallback: '#4d9a96' },

  // Oxidized copper family (dome shell)
  // Fallback hex = Minecraft Java Edition texture median (seafoam patina)
  waxed_oxidized_cut_copper:        { singleTexturePath: '/minecraft/textures/waxed_oxidized_cut_copper.png',        atlasCol: 0, atlasRow: 0, fallback: '#5fb882' },
  oxidized_cut_copper:              { singleTexturePath: '/minecraft/textures/oxidized_cut_copper.png',              atlasCol: 0, atlasRow: 0, fallback: '#4da06e' },
  // Stairs / slabs share base copper texture
  waxed_oxidized_cut_copper_stairs: { singleTexturePath: '/minecraft/textures/waxed_oxidized_cut_copper.png',        atlasCol: 0, atlasRow: 0, fallback: '#5fb882' },
  waxed_oxidized_cut_copper_slab:   { singleTexturePath: '/minecraft/textures/waxed_oxidized_cut_copper.png',        atlasCol: 0, atlasRow: 0, fallback: '#5fb882' },

  // Quartz family
  smooth_quartz:           { singleTexturePath: '/minecraft/textures/smooth_quartz.png',           atlasCol: 6, atlasRow:  1, fallback: '#f0ede2' },
  smooth_quartz_block:     { singleTexturePath: '/minecraft/textures/smooth_quartz.png',           atlasCol: 6, atlasRow:  1, fallback: '#f0ede2' },
  smooth_quartz_slab:      { singleTexturePath: '/minecraft/textures/smooth_quartz.png',           atlasCol: 6, atlasRow:  1, fallback: '#f0ede2' },
  smooth_quartz_stairs:    { singleTexturePath: '/minecraft/textures/smooth_quartz.png',           atlasCol: 6, atlasRow:  1, fallback: '#f0ede2' },
  quartz_block:            { singleTexturePath: '/minecraft/textures/quartz_block_side.png',       atlasCol: 7, atlasRow:  1, fallback: '#ede9d3' },

  // Terracotta / concrete
  cyan_terracotta:         { singleTexturePath: '/minecraft/textures/cyan_terracotta.png',         atlasCol: 0, atlasRow: 14, fallback: '#4a8a8a' },
  cyan_concrete:           { singleTexturePath: '/minecraft/textures/cyan_concrete.png',           atlasCol: 0, atlasRow: 15, fallback: '#16a5a5' },
  cyan_concrete_slab:      { singleTexturePath: '/minecraft/textures/cyan_concrete.png',           atlasCol: 0, atlasRow: 15, fallback: '#16a5a5' },
  cyan_concrete_stairs:    { singleTexturePath: '/minecraft/textures/cyan_concrete.png',           atlasCol: 0, atlasRow: 15, fallback: '#16a5a5' },
  light_blue_concrete:     { singleTexturePath: '/minecraft/textures/light_blue_concrete.png',     atlasCol: 0, atlasRow: 15, fallback: '#2cb2da' },

  // Quartz variants (for marble variant)
  quartz_slab:             { singleTexturePath: '/minecraft/textures/quartz_block_side.png',       atlasCol: 7, atlasRow:  1, fallback: '#ede9d3' },
  quartz_stairs:           { singleTexturePath: '/minecraft/textures/quartz_block_side.png',       atlasCol: 7, atlasRow:  1, fallback: '#ede9d3' },
  quartz_bricks:           { singleTexturePath: '/minecraft/textures/quartz_bricks.png',           atlasCol: 7, atlasRow:  1, fallback: '#e8e3ca' },

  // Calcite (geode stone — Minecraft 1.17+)
  calcite:                 { singleTexturePath: '/minecraft/textures/calcite.png',                 atlasCol: 0, atlasRow:  0, fallback: '#f4f2ec' },

  // Common stone blocks
  stone:                   { singleTexturePath: '/minecraft/textures/stone.png',                   atlasCol: 1, atlasRow:  0, fallback: '#7d7d7d' },
  cobblestone:             { singleTexturePath: '/minecraft/textures/cobblestone.png',             atlasCol: 0, atlasRow:  1, fallback: '#6b6b6b' },
  sandstone:               { singleTexturePath: '/minecraft/textures/sandstone_side.png',          atlasCol: 0, atlasRow:  2, fallback: '#d9cc8f' },
  obsidian:                { singleTexturePath: '/minecraft/textures/obsidian.png',                atlasCol: 5, atlasRow:  2, fallback: '#1a0a24' },

  // Planks
  oak_planks:              { singleTexturePath: '/minecraft/textures/oak_planks.png',              atlasCol: 4, atlasRow:  0, fallback: '#bc9862' },
  spruce_planks:           { singleTexturePath: '/minecraft/textures/spruce_planks.png',           atlasCol: 6, atlasRow:  0, fallback: '#735431' },
  birch_planks:            { singleTexturePath: '/minecraft/textures/birch_planks.png',            atlasCol: 6, atlasRow:  0, fallback: '#c5b77a' },
  dark_oak_planks:         { singleTexturePath: '/minecraft/textures/dark_oak_planks.png',         atlasCol: 6, atlasRow:  0, fallback: '#4a3321' },
  acacia_planks:           { singleTexturePath: '/minecraft/textures/acacia_planks.png',           atlasCol: 6, atlasRow:  0, fallback: '#ba6337' },

  // Nether
  warped_planks:           { singleTexturePath: '/minecraft/textures/warped_planks.png',           atlasCol: 0, atlasRow: 16, fallback: '#2d7a7a' },
  crimson_planks:          { singleTexturePath: '/minecraft/textures/crimson_planks.png',          atlasCol: 0, atlasRow: 16, fallback: '#7a3344' },
  basalt:                  { singleTexturePath: '/minecraft/textures/basalt_side.png',             atlasCol: 0, atlasRow: 16, fallback: '#4a4a4a' },
  blackstone:              { singleTexturePath: '/minecraft/textures/blackstone.png',              atlasCol: 0, atlasRow: 16, fallback: '#2d2a2d' },
  nether_bricks:           { singleTexturePath: '/minecraft/textures/nether_bricks.png',           atlasCol: 0, atlasRow:  6, fallback: '#2d1518' },

  // Metal / gems
  iron_block:              { singleTexturePath: '/minecraft/textures/iron_block.png',              atlasCol: 6, atlasRow:  1, fallback: '#d8d8d8' },
  gold_block:              { singleTexturePath: '/minecraft/textures/gold_block.png',              atlasCol: 7, atlasRow:  1, fallback: '#f9d849' },
  diamond_block:           { singleTexturePath: '/minecraft/textures/diamond_block.png',           atlasCol: 8, atlasRow:  1, fallback: '#62ede6' },
  emerald_block:           { singleTexturePath: '/minecraft/textures/emerald_block.png',           atlasCol: 9, atlasRow:  1, fallback: '#41d979' },
  copper_block:            { singleTexturePath: '/minecraft/textures/copper_block.png',            atlasCol:10, atlasRow:  1, fallback: '#c06e4f' },

  // Concrete (common colors)
  white_concrete:          { singleTexturePath: '/minecraft/textures/white_concrete.png',          atlasCol: 0, atlasRow: 15, fallback: '#cfd5d6' },
  gray_concrete:           { singleTexturePath: '/minecraft/textures/gray_concrete.png',           atlasCol: 0, atlasRow: 15, fallback: '#36393d' },
  black_concrete:          { singleTexturePath: '/minecraft/textures/black_concrete.png',          atlasCol: 0, atlasRow: 15, fallback: '#080a0f' },
  orange_concrete:         { singleTexturePath: '/minecraft/textures/orange_concrete.png',         atlasCol: 0, atlasRow: 15, fallback: '#e06101' },
  blue_concrete:           { singleTexturePath: '/minecraft/textures/blue_concrete.png',           atlasCol: 0, atlasRow: 15, fallback: '#2d2f8f' },
  red_concrete:            { singleTexturePath: '/minecraft/textures/red_concrete.png',            atlasCol: 0, atlasRow: 15, fallback: '#8e2121' },
  lime_concrete:           { singleTexturePath: '/minecraft/textures/lime_concrete.png',           atlasCol: 0, atlasRow: 15, fallback: '#5ea918' },
  yellow_concrete:         { singleTexturePath: '/minecraft/textures/yellow_concrete.png',         atlasCol: 0, atlasRow: 15, fallback: '#f1af15' },

  // Terrain
  dirt:                    { singleTexturePath: '/minecraft/textures/dirt.png',                    atlasCol: 2, atlasRow:  0, fallback: '#8b6b4a' },
  grass_block:             { singleTexturePath: '/minecraft/textures/grass_block_top.png',         atlasCol: 0, atlasRow:  0, fallback: '#5d9c4a' },
  sand:                    { singleTexturePath: '/minecraft/textures/sand.png',                    atlasCol: 2, atlasRow:  1, fallback: '#dbd3a0' },
  gravel:                  { singleTexturePath: '/minecraft/textures/gravel.png',                  atlasCol: 3, atlasRow:  1, fallback: '#8a8279' },
  clay:                    { singleTexturePath: '/minecraft/textures/clay.png',                    atlasCol: 4, atlasRow:  1, fallback: '#9ea4b0' },
  snow_block:              { singleTexturePath: '/minecraft/textures/snow.png',                    atlasCol: 2, atlasRow:  4, fallback: '#f0f0f0' },
  ice:                     { singleTexturePath: '/minecraft/textures/ice.png',                     atlasCol: 3, atlasRow:  4, fallback: '#92b5e8' },
  packed_ice:              { singleTexturePath: '/minecraft/textures/packed_ice.png',              atlasCol: 4, atlasRow:  4, fallback: '#8aaae4' },
};

// ─── Image utilities ──────────────────────────────────────────────────────────

/**
 * Computes per-channel median of all non-transparent pixels in a raw RGBA buffer.
 * Alpha threshold = 128 (pixels with alpha < 128 are ignored).
 * Returns [128, 128, 128] for fully transparent tiles.
 */
export function medianRGB(data: Uint8ClampedArray): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128) {
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  if (rs.length === 0) return [128, 128, 128];
  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  const mid = Math.floor(rs.length / 2);
  return [rs[mid], gs[mid], bs[mid]];
}

/** Converts R, G, B (0-255) to a CSS hex string. */
export function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Extracts pixel data from a sub-region of an HTMLImageElement via a temporary canvas.
 * Uses willReadFrequently for better performance in browsers that support it.
 */
export function imageToPixels(
  img: HTMLImageElement,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width  = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  return ctx.getImageData(0, 0, srcW, srcH).data;
}

/** Loads an HTMLImageElement from a URL. crossOrigin='anonymous' enables canvas read-back. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`minecraftColors: failed to load "${url}"`));
    img.src = url;
  });
}

// ─── Module-level caches ──────────────────────────────────────────────────────

// Deduplicates concurrent requests for the same URL
const _imageCache = new Map<string, Promise<HTMLImageElement>>();

// Final resolved hex colors — cleared by clearColorCache()
const _colorCache = new Map<string, string>();

function _getCachedImage(url: string): Promise<HTMLImageElement> {
  if (!_imageCache.has(url)) {
    _imageCache.set(url, loadImage(url));
  }
  return _imageCache.get(url)!;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves the representative hex color for a single block name.
 *
 * Resolution order:
 *   1. Cached result (fastest)
 *   2. Individual PNG at `config.singleTexturePath`
 *   3. Atlas tile at (atlasCol, atlasRow) if `atlasUrl` is provided
 *   4. `config.fallback` hex
 *
 * @param blockName  Block name with or without 'minecraft:' prefix.
 * @param atlasUrl   Optional atlas PNG URL (e.g. '/minecraft/terrain_texture.png').
 * @param tileSize   Atlas tile size in pixels (default 16).
 */
export async function resolveBlockColor(
  blockName: string,
  atlasUrl?: string,
  tileSize = ATLAS_TILE_PX,
): Promise<string> {
  const clean    = blockName.replace('minecraft:', '');
  const cacheKey = `${clean}:${atlasUrl ?? ''}:${tileSize}`;

  if (_colorCache.has(cacheKey)) return _colorCache.get(cacheKey)!;

  const config = BLOCK_TEXTURE_CONFIGS[clean];
  if (!config) {
    const hex = '#808080';
    _colorCache.set(cacheKey, hex);
    return hex;
  }

  // 1 — individual PNG
  try {
    const img    = await _getCachedImage(config.singleTexturePath);
    const pixels = imageToPixels(img, 0, 0, img.naturalWidth, img.naturalHeight);
    const hex    = toHex(...medianRGB(pixels));
    _colorCache.set(cacheKey, hex);
    return hex;
  } catch {
    // individual texture not found → try atlas
  }

  // 2 — atlas tile
  if (atlasUrl) {
    try {
      const img    = await _getCachedImage(atlasUrl);
      const srcX   = config.atlasCol * tileSize;
      const srcY   = config.atlasRow * tileSize;
      const pixels = imageToPixels(img, srcX, srcY, tileSize, tileSize);
      const hex    = toHex(...medianRGB(pixels));
      _colorCache.set(cacheKey, hex);
      return hex;
    } catch {
      // atlas not found either → use fallback
    }
  }

  // 3 — hard-coded fallback
  _colorCache.set(cacheKey, config.fallback);
  return config.fallback;
}

/**
 * Loads representative colors for all known block types in parallel.
 * Returns a Map<cleanBlockName, hexColor>.
 *
 * @param atlasUrl  Optional atlas PNG URL, used if individual PNGs are absent.
 * @param tileSize  Atlas tile size in pixels (default 16).
 */
export async function loadAllBlockColors(
  atlasUrl?: string,
  tileSize = ATLAS_TILE_PX,
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    Object.keys(BLOCK_TEXTURE_CONFIGS).map(async (name) => {
      const color = await resolveBlockColor(name, atlasUrl, tileSize);
      return [name, color] as const;
    }),
  );
  return new Map(entries);
}

/** Clears all cached images and computed colors. */
export function clearColorCache(): void {
  _colorCache.clear();
  _imageCache.clear();
}

/**
 * Returns the hard-coded fallback hex for a block name without touching the network.
 * Useful for server-side or initial render before textures are loaded.
 */
export function getFallbackColor(blockName: string): string {
  const clean = blockName.replace('minecraft:', '');
  return BLOCK_TEXTURE_CONFIGS[clean]?.fallback ?? '#808080';
}
