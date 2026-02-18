// ============================================================================
// BLUEPRINT PRO - Advanced Blueprint System with Real-Time Desktop Sync
// ============================================================================
//
// HOW TO USE:
// 1. Start the desktop viewer app (npm run start in viewer folder)
// 2. Load blueprints from the desktop app - they sync automatically!
// 3. Or use legacy mode with static blueprints from blueprints.js
//
// IN-GAME COMMANDS:
//    - /scriptevent blueprint:list         - Show available blueprints
//    - /scriptevent blueprint:load <name>  - Load a blueprint at your position
//    - /scriptevent blueprint:clear        - Clear current blueprint
//    - /scriptevent blueprint:hide         - Hide particles temporarily
//    - /scriptevent blueprint:show         - Show particles again
//    - /scriptevent blueprint:move         - Move blueprint to current position
//    - /scriptevent blueprint:sync         - Manual sync with desktop app
//    - /scriptevent blueprint:status       - Show connection status
//    - /scriptevent blueprint:layer on     - Enable layer mode
//    - /scriptevent blueprint:layer off    - Disable layer mode
//    - /scriptevent blueprint:layer up     - Go up one layer
//    - /scriptevent blueprint:layer down   - Go down one layer
//    - /scriptevent blueprint:layer <num>  - Go to specific layer
//
// WAND CONTROLS (wooden sword):
//    - Left-click: Set corner 1 (for saving)
//    - Right-click: Set corner 2 (for saving)
//    - Sneak + Right-click: Save selection to memory
//    - Sneak + Left-click: Clear everything
//
// ============================================================================

import { world, system, Player } from "@minecraft/server";
import { BLUEPRINTS } from "./blueprints.js";
import * as wsClient from "./wsClient.js";

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

    // Particle appearance - context-aware particles
    particles: {
        guide: "minecraft:endrod",              // White - guide particle for empty spots
        missingEasy: "minecraft:villager_happy", // Green - block available nearby/inventory
        missingHard: "minecraft:basic_flame_particle", // Orange - need to find/craft
        wrongBlock: "minecraft:critical_hit",   // Red - wrong block placed
        layerGuide: "minecraft:falling_dust",   // Gray - shows other layers dimly
    },
    
    // Legacy particle names (for backwards compatibility)
    particleType: "minecraft:endrod",
    particleMissing: "minecraft:basic_flame_particle",
    
    // Desktop sync settings
    sync: {
        enabled: true,              // Enable desktop app sync
        serverUrl: "http://localhost:3001",
        autoConnect: true,          // Auto-connect on world load
    },
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

// Synced blueprint from desktop app (shared across all players)
let syncedBlueprint = null;

// Layer mode state
const layerMode = {
    enabled: false,
    currentY: 0,
    maxY: 0,
    showBelow: true,  // Show layers below current (dimmed)
};

// Connection status
let isDesktopConnected = false;

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
 * Supports layer mode for building layer-by-layer
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

            // Layer mode filtering
            if (layerMode.enabled) {
                // Only show blocks at or below current layer
                if (block.y > layerMode.currentY) {
                    continue;
                }
                // Skip blocks well below current layer unless showBelow is true
                if (!layerMode.showBelow && block.y < layerMode.currentY) {
                    continue;
                }
            }

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

                    // Determine particle type based on context
                    let particleType;
                    
                    if (layerMode.enabled && block.y < layerMode.currentY) {
                        // Lower layer - show dimmed/different particle
                        particleType = CONFIG.particles.layerGuide;
                    } else if (existingBlock.typeId === "minecraft:air") {
                        // Empty spot - check if it's the current layer
                        if (layerMode.enabled && block.y === layerMode.currentY) {
                            particleType = CONFIG.particles.missingEasy; // Green for current layer
                        } else {
                            particleType = CONFIG.particles.guide; // White for general guide
                        }
                    } else {
                        // Wrong block placed
                        particleType = CONFIG.particles.wrongBlock;
                    }

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
            
        // ========== NEW SYNC COMMANDS ==========
        case 'sync':
            // Manual sync trigger
            sendMessage(player, "§7Syncing with desktop app...");
            if (wsClient.isConnected()) {
                sendMessage(player, "§aAlready connected to desktop!");
            } else {
                wsClient.startClient({
                    playerName: player.name,
                    dimension: player.dimension.id,
                });
                sendMessage(player, "§eAttempting to connect...");
            }
            break;
            
        case 'status':
            // Show connection status
            const debugState = wsClient.getDebugState();
            sendMessage(player, "§a--- Blueprint Pro Status ---");
            sendMessage(player, `§7Desktop: ${debugState.connected ? "§aConnected" : "§cDisconnected"}`);
            if (debugState.activeBlueprint) {
                sendMessage(player, `§7Blueprint: §f${debugState.activeBlueprint.name}`);
                sendMessage(player, `§7Blocks: §f${debugState.activeBlueprint.blockCount}`);
            }
            if (layerMode.enabled) {
                sendMessage(player, `§7Layer Mode: §aON §7(Y=${layerMode.currentY})`);
            }
            sendMessage(player, `§7Progress: §f${debugState.progress.placedBlocks}/${debugState.progress.totalBlocks}`);
            break;
            
        // ========== LAYER MODE COMMANDS ==========
        case 'layer':
            handleLayerCommand(player, event.message.trim());
            break;
    }
});

/**
 * Handles layer mode subcommands
 * @param {Player} player 
 * @param {string} args - Command arguments
 */
function handleLayerCommand(player, args) {
    const parts = args.toLowerCase().split(/\s+/);
    const subCommand = parts[0] || 'toggle';
    
    // Get the active blueprint to determine max Y
    const bp = activeBlueprints.get(player.name) || syncedBlueprint;
    if (!bp && subCommand !== 'off') {
        sendMessage(player, "§cNo blueprint loaded!");
        return;
    }
    
    const maxY = bp ? (bp.size?.y || Math.max(...bp.blocks.map(b => b.y)) + 1) : 0;
    layerMode.maxY = maxY;
    
    switch (subCommand) {
        case 'on':
            layerMode.enabled = true;
            layerMode.currentY = 0;
            sendMessage(player, `§aLayer mode ON - Layer Y=${layerMode.currentY} (max ${maxY - 1})`);
            wsClient.toggleLayerMode();
            break;
            
        case 'off':
            layerMode.enabled = false;
            sendMessage(player, "§7Layer mode OFF - Showing all blocks");
            wsClient.toggleLayerMode();
            break;
            
        case 'up':
            if (!layerMode.enabled) {
                layerMode.enabled = true;
                layerMode.currentY = 0;
            }
            layerMode.currentY = Math.min(layerMode.currentY + 1, maxY - 1);
            sendMessage(player, `§aLayer Y=${layerMode.currentY}`);
            wsClient.requestLayerChange(layerMode.currentY);
            break;
            
        case 'down':
            if (!layerMode.enabled) {
                layerMode.enabled = true;
                layerMode.currentY = maxY - 1;
            }
            layerMode.currentY = Math.max(layerMode.currentY - 1, 0);
            sendMessage(player, `§aLayer Y=${layerMode.currentY}`);
            wsClient.requestLayerChange(layerMode.currentY);
            break;
            
        case 'toggle':
            layerMode.enabled = !layerMode.enabled;
            sendMessage(player, layerMode.enabled 
                ? `§aLayer mode ON - Layer Y=${layerMode.currentY}` 
                : "§7Layer mode OFF");
            wsClient.toggleLayerMode();
            break;
            
        default:
            // Try to parse as a number
            const layerNum = parseInt(subCommand, 10);
            if (!isNaN(layerNum)) {
                layerMode.enabled = true;
                layerMode.currentY = Math.max(0, Math.min(layerNum, maxY - 1));
                sendMessage(player, `§aLayer Y=${layerMode.currentY}`);
                wsClient.requestLayerChange(layerMode.currentY);
            } else {
                sendMessage(player, "§cUsage: /scriptevent blueprint:layer <on|off|up|down|NUMBER>");
            }
            break;
    }
}

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
// WEBSOCKET EVENT HANDLERS
// ============================================================================

// Handle desktop connection established
wsClient.onConnect((data) => {
    isDesktopConnected = true;
    console.warn(`[Blueprint] main.js: Connected to desktop at ${data.serverUrl}`);
    
    // Notify all players
    for (const player of world.getAllPlayers()) {
        sendMessage(player, "§a[Blueprint Pro] Connected to desktop app!");
    }
});

// Handle desktop disconnection
wsClient.onDisconnect((data) => {
    isDesktopConnected = false;
    console.warn(`[Blueprint] main.js: Disconnected from desktop: ${data.reason}`);
    
    // Notify all players
    for (const player of world.getAllPlayers()) {
        sendMessage(player, "§c[Blueprint Pro] Desktop connection lost");
    }
});

// Handle blueprint loaded from desktop
wsClient.onBlueprintLoad((blueprint) => {
    console.warn(`[Blueprint] main.js: Blueprint received from desktop: ${blueprint.name}`);
    
    // Store as synced blueprint (available to all players)
    syncedBlueprint = {
        name: blueprint.name,
        blocks: [],  // Will be populated by chunks
        size: blueprint.size,
        visible: true,
    };
    
    // Notify all players
    for (const player of world.getAllPlayers()) {
        sendMessage(player, `§a[Desktop Sync] Blueprint loaded: §f${blueprint.name}`);
        sendMessage(player, `§7${blueprint.blockCount} blocks - Use wooden sword to move`);
        
        // Auto-load for the player at their position
        if (!activeBlueprints.has(player.name)) {
            activeBlueprints.set(player.name, {
                name: blueprint.name,
                blocks: syncedBlueprint.blocks,
                anchor: {
                    x: Math.floor(player.location.x),
                    y: Math.floor(player.location.y),
                    z: Math.floor(player.location.z)
                },
                visible: true,
                dimension: player.dimension.id,
                synced: true,  // Mark as synced from desktop
            });
            renderState.set(player.name, { index: 0 });
        }
    }
});

// Handle blueprint cleared from desktop
wsClient.onBlueprintClear(() => {
    console.warn("[Blueprint] main.js: Blueprint cleared by desktop");
    syncedBlueprint = null;
    
    // Clear synced blueprints for all players
    for (const [playerName, data] of activeBlueprints) {
        if (data.synced) {
            activeBlueprints.delete(playerName);
            renderState.delete(playerName);
        }
    }
    
    // Notify players
    for (const player of world.getAllPlayers()) {
        sendMessage(player, "§7[Desktop Sync] Blueprint cleared");
    }
});

// Handle layer mode update from desktop
wsClient.onLayerUpdate((layerData) => {
    layerMode.enabled = layerData.enabled;
    layerMode.currentY = layerData.currentY;
    layerMode.showBelow = layerData.showBelow;
    
    console.warn(`[Blueprint] main.js: Layer mode updated: Y=${layerData.currentY}, enabled=${layerData.enabled}`);
});

// Handle progress updates from desktop
wsClient.onProgressUpdate((progress) => {
    // Could display progress bar or notifications
    // For now, just log
    console.warn(`[Blueprint] main.js: Progress: ${progress.placedBlocks}/${progress.totalBlocks}`);
});

// Handle errors from WebSocket client
wsClient.onError((error) => {
    console.error(`[Blueprint] main.js: Sync error: ${error.message}`);
    
    // Only notify players for significant errors
    if (error.type === 'connection') {
        for (const player of world.getAllPlayers()) {
            sendMessage(player, `§c[Blueprint Pro] ${error.message}`);
        }
    }
});

// ============================================================================
// STARTUP
// ============================================================================

world.afterEvents.worldInitialize.subscribe(() => {
    const blueprintCount = Object.keys(BLUEPRINTS).length;
    console.warn(`[Blueprint] main.js: Loaded with ${blueprintCount} static blueprints`);
    
    // Start WebSocket client if enabled
    if (CONFIG.sync.enabled && CONFIG.sync.autoConnect) {
        console.warn("[Blueprint] main.js: Starting desktop sync client...");
        system.runTimeout(() => {
            wsClient.startClient({
                serverUrl: CONFIG.sync.serverUrl,
            });
        }, 40); // Wait 2 seconds after world init
    }
});

world.afterEvents.playerSpawn.subscribe((event) => {
    if (event.initialSpawn) {
        system.runTimeout(() => {
            sendMessage(event.player, "§a--- Blueprint Pro ---");
            sendMessage(event.player, "§7Commands: /scriptevent blueprint:list");
            sendMessage(event.player, "§7Desktop sync: /scriptevent blueprint:status");
            sendMessage(event.player, "§7Layer mode: /scriptevent blueprint:layer");
            sendMessage(event.player, "§7Or use wooden sword as wand");
            
            // Update wsClient with player info
            wsClient.startClient({
                playerName: event.player.name,
                dimension: event.player.dimension.id,
            });
        }, 60);
    }
});

// Track block placement for progress updates
world.afterEvents.playerPlaceBlock.subscribe((event) => {
    const block = event.block;
    const bp = activeBlueprints.get(event.player.name);
    
    if (bp && bp.synced && isDesktopConnected) {
        // Calculate relative position
        const relX = block.location.x - bp.anchor.x;
        const relY = block.location.y - bp.anchor.y;
        const relZ = block.location.z - bp.anchor.z;
        
        // Send to desktop
        wsClient.sendBlockPlaced(relX, relY, relZ, block.typeId);
    }
});

// Track block breaking for progress updates
world.afterEvents.playerBreakBlock.subscribe((event) => {
    const bp = activeBlueprints.get(event.player.name);
    
    if (bp && bp.synced && isDesktopConnected) {
        const relX = event.block.location.x - bp.anchor.x;
        const relY = event.block.location.y - bp.anchor.y;
        const relZ = event.block.location.z - bp.anchor.z;
        
        wsClient.sendBlockBroken(relX, relY, relZ);
    }
});
