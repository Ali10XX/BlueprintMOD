# Minecraft Texture Setup

Place block texture PNGs in:

```
public/minecraft/textures/<blockName>.png
```

The renderer looks for individual PNG files named after the clean block name
(no `minecraft:` prefix). Examples:

```
public/minecraft/textures/prismarine.png
public/minecraft/textures/waxed_oxidized_cut_copper.png
public/minecraft/textures/smooth_quartz.png
```

---

## Java Edition

1. Locate your Minecraft installation:
   - Windows: `%APPDATA%\.minecraft\versions\<version>\`
   - macOS: `~/Library/Application Support/minecraft/versions/<version>/`

2. Open the `.jar` file (it is a ZIP archive). Use 7-Zip, WinRAR, or:
   ```
   unzip <version>.jar -d mc_jar_contents
   ```

3. Copy textures from:
   ```
   mc_jar_contents/assets/minecraft/textures/block/
   ```
   into:
   ```
   public/minecraft/textures/
   ```

---

## Bedrock Edition

1. Download the official **Vanilla Resource Pack** from the Minecraft creator portal:
   https://aka.ms/resourcepacktemplate

2. Extract the archive. Textures are located in:
   ```
   textures/blocks/
   ```

3. Copy the PNGs into `public/minecraft/textures/`.

   > **Note**: Bedrock texture names may differ slightly from Java Edition.
   > E.g., `waxed_oxidized_cut_copper` vs `waxed_oxidized_cut_copper_block`.
   > Rename files to match the block names listed in `textureManager.ts`.

---

## Fallback behaviour

If a texture PNG is missing, the renderer automatically falls back to:
1. **Colors mode**: median color sampled from the texture atlas (if present)
2. **Simple mode**: hard-coded hex colour approximation

No textures are required — the preview will always render, just without pixel-perfect Minecraft textures.
