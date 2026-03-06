# Simple Blueprint - Bedrock Edition

A lightweight Litematica alternative for Minecraft Bedrock. Import external structures and display ghost particle guides.

## How It Works

```
.mcstructure file  ──►  Python converter  ──►  blueprints.js  ──►  Minecraft
    (from Structure Block)      (on your PC)       (in behavior pack)    (particles!)
```

## Installation

### Step 1: Copy to Minecraft

Press `Win + R`, paste this, press Enter:
```
%localappdata%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\
```

Copy:
- `blueprint_bp` → `development_behavior_packs/`
- `blueprint_rp` → `development_resource_packs/`

### Step 2: Add pack icons

Add a `pack_icon.png` (64x64) to both `blueprint_bp/` and `blueprint_rp/`.

### Step 3: Create world with Beta APIs

1. Create new world
2. Enable **Beta APIs** in Experiments
3. Add both packs

---

## Importing External Structures

### Method 1: From Structure Block

1. In Minecraft, get a Structure Block: `/give @s structure_block`
2. Place it, set to **Save** mode
3. Define the area, name it, click Save
4. File saves to: `com.mojang/structures/yourname.mcstructure`

### Method 2: Download from internet

Many websites offer `.mcstructure` files for Bedrock.

### Converting to Blueprint Format

#### Option 1: Web Converter (No install needed - works on any device!)

1. Open `converter/index.html` in any browser (or host it online)
2. Drag & drop your `.mcstructure` file
3. Click "Copy to Clipboard"
4. Paste into `blueprints.js`

**Works on:** PC, phone, tablet, Xbox/PlayStation browser, anywhere!

#### Option 2: Python (for batch conversion)

1. Install Python (python.org)
2. Install the NBT library: `pip install nbtlib`
3. Run: `python converter/convert_structure.py myhouse.mcstructure`
4. Copy the contents of `myhouse.json`

### Adding to the Add-on

Paste into `blueprint_bp/scripts/blueprints.js`:
```javascript
export const BLUEPRINTS = {
    "myhouse": { /* paste converted JSON here */ },
    "castle": { /* another structure */ },
};
```

---

## In-Game Commands

| Command | Description |
|---------|-------------|
| `/scriptevent blueprint:list` | Show available blueprints |
| `/scriptevent blueprint:load <name>` | Load blueprint at your position |
| `/scriptevent blueprint:move` | Move blueprint to your current position |
| `/scriptevent blueprint:hide` | Hide particles |
| `/scriptevent blueprint:show` | Show particles |
| `/scriptevent blueprint:clear` | Clear blueprint |

### Wand Controls (Wooden Sword)

| Action | Input |
|--------|-------|
| Set Corner 1 | Left-click block |
| Set Corner 2 | Right-click block |
| Save Selection | Sneak + Right-click |
| Clear All | Sneak + Left-click |

---

## Optimization Features

| Feature | Benefit |
|---------|---------|
| Run-length encoding | Smaller file size |
| Frame spreading | Max 200 particles/tick |
| Distance culling | Only render within 32 blocks |
| Decompression cache | Load once, use forever |
| Squared distance | Faster math |

---

## Limits

- **100x100x100** maximum blueprint size
- Particles only (no true ghost blocks)
- One active blueprint per player

---

## File Structure

```
Minecraft blueprint/
├── converter/
│   └── convert_structure.py    # Converts .mcstructure to JSON
├── blueprint_bp/
│   ├── manifest.json
│   ├── pack_icon.png           # Create this (64x64)
│   └── scripts/
│       ├── main.js             # Main code
│       └── blueprints.js       # Your blueprints go here
└── blueprint_rp/
    ├── manifest.json
    └── pack_icon.png           # Create this (64x64)
```

---

---

## Importing the Al-Shaheed Monument

The web viewer can export a procedural Al-Shaheed Monument blueprint as a
ready-to-use Bedrock `.mcstructure` file.

### Step 1 — Export from the viewer

1. Open the viewer in your browser (`npm run dev` → `http://localhost:5173`)
2. Navigate to the **VoxelPreview Demo** page
3. Click **Export .mcstructure** — your browser downloads `al_shaheed.mcstructure`

### Step 2 — Copy the file into Bedrock

Press `Win + R`, paste the path below, press Enter:

```
%LOCALAPPDATA%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\
```

Copy `al_shaheed.mcstructure` into:

```
structures\al_shaheed.mcstructure
```

> **Tip:** The `structures` folder may not exist yet — create it if needed.

### Step 3 — Load in-game

**Option A — Structure Block (recommended)**

1. Get a structure block: `/give @s structure_block`
2. Place it, set mode to **Load**
3. Enter structure name: `al_shaheed`
4. Click **Load**

**Option B — Command**

```
/structure load al_shaheed ~ ~ ~
```

### Block palette

| Block | Role |
|-------|------|
| `minecraft:prismarine` | Shell body (≈50 %) |
| `minecraft:prismarine_bricks` | Shell accent (≈30 %), rim band |
| `minecraft:dark_prismarine` | Shell shadow patches (≈20 %) |
| `minecraft:prismarine_stairs` | Curvature transitions |
| `minecraft:prismarine_slab` | Curvature transitions |
| `minecraft:smooth_quartz_block` | Plinth base |

### Requirements

- Minecraft Bedrock **1.20+**
- No behavior pack required — the structure uses vanilla blocks only

---

## Troubleshooting

**"nbtlib not found"**
```
pip install nbtlib
```

**Particles not showing**
- Check you're within 32 blocks
- Use `/scriptevent blueprint:show`
- Make sure Beta APIs is enabled

**Script errors**
- Check `blueprints.js` for JSON syntax errors
- Make sure commas are correct between entries
