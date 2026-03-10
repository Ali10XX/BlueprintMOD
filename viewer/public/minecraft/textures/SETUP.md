# Minecraft Texture Setup

The VoxelPreview "Minecraft Exact Colors" mode loads individual block texture PNGs
from this folder to compute accurate preview colors.

## Where to get the textures

### Option A — Extract from Minecraft Java Edition (recommended)

1. Locate the Minecraft JAR:
   ```
   %APPDATA%\.minecraft\versions\<version>\<version>.jar
   ```
2. Open the JAR with 7-Zip or WinRAR (it is a ZIP archive).
3. Navigate to:
   ```
   assets/minecraft/textures/block/
   ```
4. Copy the PNG files you need into **this folder** (`public/minecraft/textures/`).

### Option B — Bedrock Edition

Bedrock textures are in the resource pack at:
```
%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\
  resource_packs\vanilla\textures\blocks\
```
Copy the relevant PNGs here (rename to match the Java names below if needed).

---

## Required file names

Place files here with these exact names (no subdirectories):

| File name                    | Block                    |
|------------------------------|--------------------------|
| `prismarine.png`             | Prismarine               |
| `dark_prismarine.png`        | Dark Prismarine          |
| `prismarine_bricks.png`      | Prismarine Bricks        |
| `smooth_quartz.png`          | Smooth Quartz (side)     |
| `quartz_block_side.png`      | Quartz Block             |
| `cyan_terracotta.png`        | Cyan Terracotta          |
| `cyan_concrete.png`          | Cyan Concrete            |
| `stone.png`                  | Stone                    |
| `cobblestone.png`            | Cobblestone              |
| `sandstone_side.png`         | Sandstone                |
| `obsidian.png`               | Obsidian                 |
| `oak_planks.png`             | Oak Planks               |
| `iron_block.png`             | Iron Block               |
| `gold_block.png`             | Gold Block               |
| `diamond_block.png`          | Diamond Block            |
| `emerald_block.png`          | Emerald Block            |

Only the files for blocks used in your blueprint are actually needed.
Any missing file will silently fall back to the built-in color palette.

---

## Optional: texture atlas

You may also place a full Minecraft terrain atlas at:
```
public/minecraft/terrain_texture.png
```
The viewer uses it as a secondary fallback (after individual PNGs, before hard-coded colors).

---

## Notes

- Textures must be the standard **16×16 px** PNG format.
- The viewer samples all non-transparent pixels and computes the per-channel **median**
  RGB, which gives accurate Minecraft tones while ignoring dark outlines.
- Color loading is cached per session — reload the page to refresh after adding new files.
