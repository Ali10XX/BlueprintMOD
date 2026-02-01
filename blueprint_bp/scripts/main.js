// ============================================================================
// SIMPLE BLUEPRINT - Optimized Version with Import Support
// ============================================================================
//
// HOW TO USE:
// 1. Convert .mcstructure files using: python converter/convert_structure.py
// 2. Paste the JSON into scripts/blueprints.js
// 3. In-game, use commands:
//    - /scriptevent blueprint:list         - Show available blueprints
//    - /scriptevent blueprint:load <name>  - Load a blueprint at your position
//    - /scriptevent blueprint:clear        - Clear current blueprint
//    - /scriptevent blueprint:hide         - Hide particles temporarily
//    - /scriptevent blueprint:show         - Show particles again
//
// OR use the wand (wooden sword):
//    - Left-click: Set corner 1 (for saving)
//    - Right-click: Set corner 2 (for saving)
//    - Sneak + Right-click: Save selection to memory
//    - Sneak + Left-click: Clear everything
//
// ============================================================================

import { world, system, Player } from "@minecraft/server";
import { BLUEPRINTS } from "./blueprints.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    wandItem: "minecraft:wooden_sword",

    // Size limits
    maxSize: 100,  // Maximum 100x100x100

    // PERFORMANCE SETTINGS
    particleInterval: 5,          // Ticks between particle updates
    maxParticlesPerTick: 200,     // Max particles to spawn per tick (prevents lag)
    renderDistance: 32,           // Only show particles within this distance
    chunkUpdateInterval: 20,      // How often to recalculate visible chunks

    // Particle appearance
    particleType: "minecraft:endrod",
    particleMissing: "minecraft:basic_flame_particle",  // Different particle for missing blocks
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Active blueprints per player: { playerName: { blocks: [], anchor: {x,y,z}, visible: true } }
const activeBlueprints = new Map();

// Selection corners for saving
const playerSelections = new Map();

// Cached decompressed blocks for performance
const decompressedCache = new Map();

// Particle rendering state (for frame spreading)
const renderState = new Map();

// ============================================================================
// DECOMPRESSION - Expand run-length encoded data
// ============================================================================

/**
 * Decompress a blueprint's run-length encoded data into full block list
 * @param {Object} blueprint - The compressed blueprint
 * @returns {Array} - Array of {x, y, z, type} objects
 */
function decompressBlueprint(blueprint) {
    // Check cache first
    if (decompressedCache.has(blueprint.name)) {
        return decompressedCache.get(blueprint.name);
    }

    const blocks = [];
    const palette = blueprint.palette;

    for (const entry of blueprint.data) {
        const x = entry[0];
        const y = entry[1];
        const z = entry[2];
        const typeIdx = entry[3];
        const blockType = palette[typeIdx];

        // Check for run-length encoding (negative 5th element)
        if (entry.length > 4 && entry[4] < 0) {
            const runLength = -entry[4];
            for (let i = 0; i < runLength; i++) {
                blocks.push({ x: x + i, y, z, type: blockType });
            }
        } else {
            blocks.push({ x, y, z, type: blockType });
        }
    }

    // Cache the result
    decompressedCache.set(blueprint.name, blocks);

    return blocks;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function sendMessage(player, message) {
    player.sendMessage(`§e[Blueprint]§r ${message}`);
}

function isHoldingWand(player) {
    const equip = player.getComponent("equippable");
    if (!equip) return false;
    const mainHand = equip.getEquipment("Mainhand");
    return mainHand && mainHand.typeId === CONFIG.wandItem;
}

function getMinMaxCorners(corner1, corner2) {
    return {
        min: {
            x: Math.min(corner1.x, corner2.x),
            y: Math.min(corner1.y, corner2.y),
            z: Math.min(corner1.z, corner2.z)
        },
        max: {
            x: Math.max(corner1.x, corner2.x),
            y: Math.max(corner1.y, corner2.y),
            z: Math.max(corner1.z, corner2.z)
        }
    };
}

/**
 * Calculate distance squared (faster than actual distance)
 */
function distanceSquared(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return dx * dx + dy * dy + dz * dz;
}

// ============================================================================
// BLUEPRINT LOADING
// ============================================================================

/**
 * Load a blueprint from the blueprints.js file
 * @param {Player} player - The player loading the blueprint
 * @param {string} blueprintName - Name of the blueprint to load
 */
function loadBlueprint(player, blueprintName) {
    const blueprint = BLUEPRINTS[blueprintName];

    if (!blueprint) {
        sendMessage(player, `§cBlueprint '${blueprintName}' not found!`);
        sendMessage(player, `§7Use: /scriptevent blueprint:list`);
        return;
    }

    // Decompress the blueprint
    const blocks = decompressBlueprint(blueprint);

    // Set anchor at player's position
    const anchor = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
    };

    // Store the active blueprint for this player
    activeBlueprints.set(player.name, {
        name: blueprintName,
        blocks: blocks,
        anchor: anchor,
        visible: true,
        dimension: player.dimension.id
    });

    // Reset render state
    renderState.set(player.name, { index: 0 });

    sendMessage(player, `§aLoaded '${blueprintName}' (${blocks.length} blocks)`);
    sendMessage(player, `§7Anchor: ${anchor.x}, ${anchor.y}, ${anchor.z}`);
}

/**
 * List all available blueprints
 * @param {Player} player
 */
function listBlueprints(player) {
    const names = Object.keys(BLUEPRINTS);

    if (names.length === 0) {
        sendMessage(player, "§7No blueprints loaded. Add them to scripts/blueprints.js");
        return;
    }

    sendMessage(player, `§a--- Available Blueprints (${names.length}) ---`);
    for (const name of names) {
        const bp = BLUEPRINTS[name];
        sendMessage(player, `§f- ${name} §7(${bp.blockCount} blocks)`);
    }
    sendMessage(player, "§7Use: /scriptevent blueprint:load <name>");
}

// ============================================================================
// PARTICLE RENDERING (OPTIMIZED)
// ============================================================================

/**
 * Render particles for all active blueprints
 * Uses frame spreading to prevent lag spikes
 */
function renderParticles() {
    const renderDistSq = CONFIG.renderDistance * CONFIG.renderDistance;

    for (const [playerName, data] of activeBlueprints) {
        if (!data.visible) continue;

        // Find the player
        const player = world.getAllPlayers().find(p => p.name === playerName);
        if (!player) continue;

        // Make sure player is in the same dimension
        if (player.dimension.id !== data.dimension) continue;

        const playerPos = player.location;
        const anchor = data.anchor;
        const blocks = data.blocks;
        const dimension = player.dimension;

        // Get or create render state for frame spreading
        let state = renderState.get(playerName);
        if (!state) {
            state = { index: 0 };
            renderState.set(playerName, state);
        }

        let particlesThisTick = 0;
        const startIndex = state.index;

        // Process blocks starting from where we left off
        for (let i = 0; i < blocks.length && particlesThisTick < CONFIG.maxParticlesPerTick; i++) {
            const idx = (startIndex + i) % blocks.length;
            const block = blocks[idx];

            // Calculate world position
            const worldX = anchor.x + block.x;
            const worldY = anchor.y + block.y;
            const worldZ = anchor.z + block.z;
            const worldPos = { x: worldX + 0.5, y: worldY + 0.5, z: worldZ + 0.5 };

            // Check distance (use squared distance for performance)
            if (distanceSquared(playerPos, worldPos) > renderDistSq) {
                continue;
            }

            // Check if correct block is already placed
            try {
                const existingBlock = dimension.getBlock({ x: worldX, y: worldY, z: worldZ });

                if (existingBlock) {
                    // Skip if correct block is already there
                    if (existingBlock.typeId === block.type) {
                        continue;
                    }

                    // Spawn particle
                    const particleType = existingBlock.typeId === "minecraft:air"
                        ? CONFIG.particleType           // Empty spot - normal particle
                        : CONFIG.particleMissing;       // Wrong block - different particle

                    dimension.spawnParticle(particleType, worldPos);
                    particlesThisTick++;
                }
            } catch (e) {
                // Block not loaded, skip
            }
        }

        // Update index for next frame
        state.index = (startIndex + CONFIG.maxParticlesPerTick) % blocks.length;
    }
}

// ============================================================================
// SAVE FUNCTIONALITY (for capturing structures in-game)
// ============================================================================

function saveSelection(player) {
    const selection = playerSelections.get(player.name);

    if (!selection || !selection.corner1 || !selection.corner2) {
        sendMessage(player, "§cSelect two corners first!");
        return;
    }

    const { min, max } = getMinMaxCorners(selection.corner1, selection.corner2);

    // Check size
    const sizeX = max.x - min.x + 1;
    const sizeY = max.y - min.y + 1;
    const sizeZ = max.z - min.z + 1;

    if (sizeX > CONFIG.maxSize || sizeY > CONFIG.maxSize || sizeZ > CONFIG.maxSize) {
        sendMessage(player, `§cToo large! Max ${CONFIG.maxSize}x${CONFIG.maxSize}x${CONFIG.maxSize}`);
        return;
    }

    const dimension = player.dimension;
    const blocks = [];

    // Scan blocks
    for (let x = min.x; x <= max.x; x++) {
        for (let y = min.y; y <= max.y; y++) {
            for (let z = min.z; z <= max.z; z++) {
                try {
                    const block = dimension.getBlock({ x, y, z });
                    if (block && block.typeId !== "minecraft:air") {
                        blocks.push({
                            x: x - min.x,
                            y: y - min.y,
                            z: z - min.z,
                            type: block.typeId
                        });
                    }
                } catch (e) {
                    // Block not loaded
                }
            }
        }
    }

    if (blocks.length === 0) {
        sendMessage(player, "§cNo blocks found!");
        return;
    }

    // Store as active blueprint
    activeBlueprints.set(player.name, {
        name: "selection",
        blocks: blocks,
        anchor: { x: min.x, y: min.y, z: min.z },
        visible: true,
        dimension: player.dimension.id
    });

    renderState.set(player.name, { index: 0 });

    sendMessage(player, `§aSaved ${blocks.length} blocks (${sizeX}x${sizeY}x${sizeZ})`);
}

function clearBlueprint(player) {
    activeBlueprints.delete(player.name);
    playerSelections.delete(player.name);
    renderState.delete(player.name);
    sendMessage(player, "§7Blueprint cleared.");
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Script events for commands
system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (!event.sourceEntity || !(event.sourceEntity instanceof Player)) return;

    const player = event.sourceEntity;
    const namespace = event.id.split(':')[0];
    const command = event.id.split(':')[1];

    if (namespace !== 'blueprint') return;

    switch (command) {
        case 'list':
            listBlueprints(player);
            break;

        case 'load':
            const blueprintName = event.message.trim();
            if (!blueprintName) {
                sendMessage(player, "§cUsage: /scriptevent blueprint:load <name>");
                return;
            }
            loadBlueprint(player, blueprintName);
            break;

        case 'clear':
            clearBlueprint(player);
            break;

        case 'hide':
            if (activeBlueprints.has(player.name)) {
                activeBlueprints.get(player.name).visible = false;
                sendMessage(player, "§7Particles hidden.");
            }
            break;

        case 'show':
            if (activeBlueprints.has(player.name)) {
                activeBlueprints.get(player.name).visible = true;
                sendMessage(player, "§aParticles visible.");
            }
            break;

        case 'move':
            // Move anchor to current position
            if (activeBlueprints.has(player.name)) {
                const data = activeBlueprints.get(player.name);
                data.anchor = {
                    x: Math.floor(player.location.x),
                    y: Math.floor(player.location.y),
                    z: Math.floor(player.location.z)
                };
                sendMessage(player, `§aMoved to ${data.anchor.x}, ${data.anchor.y}, ${data.anchor.z}`);
            }
            break;
    }
});

// Wand left-click (set corner 1)
world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const player = event.player;
    if (!isHoldingWand(player)) return;

    event.cancel = true;

    const pos = event.block.location;

    if (player.isSneaking) {
        system.run(() => clearBlueprint(player));
        return;
    }

    if (!playerSelections.has(player.name)) {
        playerSelections.set(player.name, {});
    }

    playerSelections.get(player.name).corner1 = { x: pos.x, y: pos.y, z: pos.z };

    system.run(() => {
        sendMessage(player, `§bCorner 1: ${pos.x}, ${pos.y}, ${pos.z}`);
    });
});

// Wand right-click (set corner 2)
world.beforeEvents.itemUseOn.subscribe((event) => {
    const player = event.source;
    if (!(player instanceof Player)) return;
    if (event.itemStack.typeId !== CONFIG.wandItem) return;

    event.cancel = true;

    const pos = event.block.location;

    if (player.isSneaking) {
        system.run(() => saveSelection(player));
        return;
    }

    if (!playerSelections.has(player.name)) {
        playerSelections.set(player.name, {});
    }

    playerSelections.get(player.name).corner2 = { x: pos.x, y: pos.y, z: pos.z };

    system.run(() => {
        sendMessage(player, `§dCorner 2: ${pos.x}, ${pos.y}, ${pos.z}`);
    });
});

// ============================================================================
// MAIN LOOP
// ============================================================================

system.runInterval(() => {
    renderParticles();
}, CONFIG.particleInterval);

// ============================================================================
// STARTUP
// ============================================================================

world.afterEvents.worldInitialize.subscribe(() => {
    const blueprintCount = Object.keys(BLUEPRINTS).length;
    console.warn(`[Blueprint] Loaded with ${blueprintCount} blueprints`);
});

world.afterEvents.playerSpawn.subscribe((event) => {
    if (event.initialSpawn) {
        system.runTimeout(() => {
            sendMessage(event.player, "§a--- Simple Blueprint ---");
            sendMessage(event.player, "§7Commands: /scriptevent blueprint:list");
            sendMessage(event.player, "§7Or use wooden sword as wand");
        }, 60);
    }
});
