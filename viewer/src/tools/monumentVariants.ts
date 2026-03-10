/**
 * monumentVariants.ts
 *
 * Block palette variants for the Al-Shaheed Monument generator.
 * Each variant defines the block types used for different structural roles.
 * Geometry (radius, height, thickness) is identical across all variants.
 */

export interface MonumentVariantPalette {
  /** Human-readable display name */
  name: string;
  /** Primary shell block (~80 % coverage) */
  shellPrimary: string;
  /** Secondary shell block (~20 % patch variation via materialNoise) */
  shellSecondary: string;
  /** Rim / accent block used on the cut-plane rim detail */
  shellAccent: string;
  /** Slab block for surface curvature detail */
  slab: string;
  /** Stair block for surface curvature detail */
  stairs: string;
  /** Base / plinth block */
  base: string;
  /** Top-slab variant used on plinth step edges */
  plinthSlab: string;
}

export const MONUMENT_VARIANTS: Record<string, MonumentVariantPalette> = {
  copper: {
    name: 'Oxidized Copper',
    shellPrimary:   'waxed_oxidized_cut_copper',
    shellSecondary: 'oxidized_cut_copper',
    shellAccent:    'waxed_oxidized_cut_copper',
    slab:           'waxed_oxidized_cut_copper_slab',
    stairs:         'waxed_oxidized_cut_copper_stairs',
    base:           'smooth_quartz',
    plinthSlab:     'smooth_quartz_slab',
  },
  prismarine: {
    name: 'Sea Prismarine',
    shellPrimary:   'prismarine',
    shellSecondary: 'dark_prismarine',
    shellAccent:    'prismarine_bricks',
    slab:           'prismarine_slab',
    stairs:         'prismarine_stairs',
    base:           'smooth_quartz',
    plinthSlab:     'smooth_quartz_slab',
  },
  modern: {
    name: 'Modern Concrete',
    shellPrimary:   'cyan_concrete',
    shellSecondary: 'light_blue_concrete',
    shellAccent:    'cyan_terracotta',
    slab:           'cyan_concrete_slab',
    stairs:         'cyan_concrete_stairs',
    base:           'smooth_quartz',
    plinthSlab:     'smooth_quartz_slab',
  },
  marble: {
    name: 'Marble Quartz',
    shellPrimary:   'smooth_quartz',
    shellSecondary: 'calcite',
    shellAccent:    'quartz_bricks',
    slab:           'quartz_slab',
    stairs:         'quartz_stairs',
    base:           'smooth_quartz',
    plinthSlab:     'smooth_quartz_slab',
  },
};

export type VariantKey = keyof typeof MONUMENT_VARIANTS;
