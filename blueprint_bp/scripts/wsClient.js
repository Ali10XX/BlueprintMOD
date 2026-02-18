// ============================================================================
// WEBSOCKET CLIENT - HTTP Polling Bridge for Bedrock Scripting API
// ============================================================================
//
// Bedrock Scripting API doesn't support native WebSockets, so this module
// implements a polling-based approach using @minecraft/server-net.
//
// The desktop server maintains the true WebSocket connections and state,
// while we poll for updates and send events via HTTP.
//
// REQUIREMENTS:
// - Beta APIs enabled in world settings
// - @minecraft/server-net module (requires 1.21.0+)
//
// ============================================================================

import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";
import { system } from "@minecraft/server";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Server connection
    serverUrl: "http://localhost:3001",
    
    // Polling intervals (in ticks, 20 ticks = 1 second)
    pollInterval: 20,           // Poll every 1 second when idle
    fastPollInterval: 5,        // Poll every 0.25 seconds when active
    
    // Timeouts
    requestTimeout: 5000,       // 5 second timeout for HTTP requests
    
    // Retry settings
    maxRetries: 3,
    retryDelay: 60,             // 3 seconds between retries (in ticks)
    
    // Debug logging
    debug: true,
};

// ============================================================================
// STATE
// ============================================================================

/** Connection state */
const state = {
    connected: false,
    lastPollTime: 0,
    retryCount: 0,
    pollRunId: null,
    
    // Server-assigned client ID
    clientId: null,
    
    // Current player info
    playerName: null,
    dimension: null,
    
    // Cached blueprint data
    activeBlueprint: null,
    blueprintChunks: new Map(),  // chunkId -> chunk data
    
    // Layer mode state (synced from server)
    layerMode: {
        enabled: false,
        currentY: 0,
        showBelow: true,
    },
    
    // Progress tracking
    progress: {
        totalBlocks: 0,
        placedBlocks: 0,
        wrongBlocks: 0,
    },
    
    // Event queue for outgoing events
    eventQueue: [],
};

/** Event callbacks registered by other modules */
const callbacks = {
    onConnect: [],
    onDisconnect: [],
    onBlueprintLoad: [],
    onBlueprintClear: [],
    onBlueprintChunk: [],
    onLayerUpdate: [],
    onProgressUpdate: [],
    onError: [],
};

// ============================================================================
// LOGGING
// ============================================================================

function log(message, ...args) {
    if (CONFIG.debug) {
        console.warn(`[WSClient] wsClient.js: ${message}`, ...args);
    }
}

function logError(message, error) {
    console.error(`[WSClient] wsClient.js: ${message}`, error?.message || error);
}

// ============================================================================
// HTTP HELPERS
// ============================================================================

/**
 * Makes an HTTP request to the server
 * @param {string} endpoint - API endpoint (e.g., "/api/blueprint/status")
 * @param {string} method - HTTP method (GET, POST)
 * @param {Object} body - Request body for POST requests
 * @returns {Promise<Object>} - Parsed JSON response
 */
async function makeRequest(endpoint, method = "GET", body = null) {
    const request = new HttpRequest(`${CONFIG.serverUrl}${endpoint}`);
    request.method = method === "POST" ? HttpRequestMethod.Post : HttpRequestMethod.Get;
    request.timeout = CONFIG.requestTimeout;
    
    request.headers = [
        new HttpHeader("Content-Type", "application/json"),
        new HttpHeader("Accept", "application/json"),
    ];
    
    if (body) {
        request.body = JSON.stringify(body);
    }
    
    try {
        const response = await http.request(request);
        
        if (response.status >= 200 && response.status < 300) {
            return JSON.parse(response.body);
        } else {
            throw new Error(`HTTP ${response.status}: ${response.body}`);
        }
    } catch (error) {
        throw error;
    }
}

// ============================================================================
// POLLING LOGIC
// ============================================================================

/**
 * Polls the server for status updates
 */
async function pollServer() {
    try {
        // Get current status from server
        const status = await makeRequest("/api/blueprint/status");
        
        // Update connection state
        if (!state.connected) {
            state.connected = true;
            state.retryCount = 0;
            log("Connected to server");
            triggerCallbacks("onConnect", { serverUrl: CONFIG.serverUrl });
        }
        
        // Process blueprint updates
        if (status.activeBlueprint) {
            const bp = status.activeBlueprint;
            
            // Check if this is a new blueprint
            if (!state.activeBlueprint || state.activeBlueprint.name !== bp.name) {
                log(`New blueprint detected: ${bp.name} (${bp.blockCount} blocks)`);
                state.activeBlueprint = bp;
                triggerCallbacks("onBlueprintLoad", bp);
                
                // Request all chunks for the new blueprint
                await requestAllChunks();
            }
        } else if (state.activeBlueprint) {
            // Blueprint was cleared
            log("Blueprint cleared");
            state.activeBlueprint = null;
            state.blueprintChunks.clear();
            triggerCallbacks("onBlueprintClear");
        }
        
        // Process layer mode updates
        if (status.layerMode) {
            const changed = 
                state.layerMode.enabled !== status.layerMode.enabled ||
                state.layerMode.currentY !== status.layerMode.currentY;
                
            if (changed) {
                state.layerMode = { ...status.layerMode };
                triggerCallbacks("onLayerUpdate", state.layerMode);
            }
        }
        
        // Process progress updates
        if (status.progress) {
            state.progress = { ...status.progress };
            triggerCallbacks("onProgressUpdate", state.progress);
        }
        
        // Send any queued events
        await flushEventQueue();
        
    } catch (error) {
        handleConnectionError(error);
    }
}

/**
 * Requests all blueprint chunks from the server
 */
async function requestAllChunks() {
    if (!state.activeBlueprint) return;
    
    try {
        log("Requesting all blueprint chunks...");
        
        // The server exposes full blueprint data via the load API response
        // For large blueprints, we'd stream chunks, but for now we request the full data
        const response = await makeRequest("/api/blueprint/status");
        
        if (response.activeBlueprint) {
            // For now, chunks are loaded all at once through the main.js integration
            log(`Blueprint ready: ${response.activeBlueprint.blockCount} blocks`);
        }
    } catch (error) {
        logError("Failed to request chunks", error);
    }
}

/**
 * Handles connection errors with retry logic
 */
function handleConnectionError(error) {
    if (state.connected) {
        state.connected = false;
        log("Disconnected from server");
        triggerCallbacks("onDisconnect", { reason: error.message });
    }
    
    state.retryCount++;
    
    if (state.retryCount <= CONFIG.maxRetries) {
        log(`Connection failed, retry ${state.retryCount}/${CONFIG.maxRetries}`);
    } else {
        logError("Max retries reached, server may be offline", error);
        triggerCallbacks("onError", { 
            type: "connection", 
            message: "Cannot connect to desktop server. Is it running?" 
        });
    }
}

/**
 * Flushes queued events to the server
 */
async function flushEventQueue() {
    while (state.eventQueue.length > 0) {
        const event = state.eventQueue.shift();
        
        try {
            await makeRequest("/api/blueprint/event", "POST", event);
        } catch (error) {
            // Re-queue failed events
            state.eventQueue.unshift(event);
            logError("Failed to send event", error);
            break;
        }
    }
}

// ============================================================================
// CALLBACK MANAGEMENT
// ============================================================================

/**
 * Triggers all callbacks for an event
 * @param {string} eventName - Event name
 * @param {Object} data - Event data
 */
function triggerCallbacks(eventName, data) {
    const eventCallbacks = callbacks[eventName];
    if (eventCallbacks) {
        for (const callback of eventCallbacks) {
            try {
                callback(data);
            } catch (error) {
                logError(`Callback error for ${eventName}`, error);
            }
        }
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Starts the WebSocket client (polling mode)
 * @param {Object} options - Configuration options
 */
export function startClient(options = {}) {
    if (state.pollRunId !== null) {
        log("Client already running");
        return;
    }
    
    // Apply options
    if (options.serverUrl) CONFIG.serverUrl = options.serverUrl;
    if (options.playerName) state.playerName = options.playerName;
    if (options.dimension) state.dimension = options.dimension;
    
    log(`Starting client, polling ${CONFIG.serverUrl}`);
    
    // Start polling loop
    state.pollRunId = system.runInterval(() => {
        pollServer();
    }, CONFIG.pollInterval);
}

/**
 * Stops the WebSocket client
 */
export function stopClient() {
    if (state.pollRunId !== null) {
        system.clearRun(state.pollRunId);
        state.pollRunId = null;
        state.connected = false;
        log("Client stopped");
    }
}

/**
 * Checks if client is connected to server
 * @returns {boolean}
 */
export function isConnected() {
    return state.connected;
}

/**
 * Gets the current blueprint state
 * @returns {Object|null}
 */
export function getActiveBlueprint() {
    return state.activeBlueprint;
}

/**
 * Gets the current layer mode state
 * @returns {Object}
 */
export function getLayerMode() {
    return { ...state.layerMode };
}

/**
 * Gets the current progress
 * @returns {Object}
 */
export function getProgress() {
    return { ...state.progress };
}

/**
 * Gets all loaded blueprint chunks
 * @returns {Map}
 */
export function getBlueprintChunks() {
    return state.blueprintChunks;
}

// ============================================================================
// EVENT REGISTRATION
// ============================================================================

/**
 * Registers a callback for when connection is established
 * @param {Function} callback
 */
export function onConnect(callback) {
    callbacks.onConnect.push(callback);
}

/**
 * Registers a callback for when connection is lost
 * @param {Function} callback
 */
export function onDisconnect(callback) {
    callbacks.onDisconnect.push(callback);
}

/**
 * Registers a callback for when a blueprint is loaded
 * @param {Function} callback - Receives { name, blockCount, size }
 */
export function onBlueprintLoad(callback) {
    callbacks.onBlueprintLoad.push(callback);
}

/**
 * Registers a callback for when blueprint is cleared
 * @param {Function} callback
 */
export function onBlueprintClear(callback) {
    callbacks.onBlueprintClear.push(callback);
}

/**
 * Registers a callback for when a blueprint chunk is received
 * @param {Function} callback - Receives chunk data
 */
export function onBlueprintChunk(callback) {
    callbacks.onBlueprintChunk.push(callback);
}

/**
 * Registers a callback for layer mode updates
 * @param {Function} callback - Receives { enabled, currentY, showBelow }
 */
export function onLayerUpdate(callback) {
    callbacks.onLayerUpdate.push(callback);
}

/**
 * Registers a callback for progress updates
 * @param {Function} callback - Receives { totalBlocks, placedBlocks, wrongBlocks }
 */
export function onProgressUpdate(callback) {
    callbacks.onProgressUpdate.push(callback);
}

/**
 * Registers a callback for errors
 * @param {Function} callback - Receives { type, message }
 */
export function onError(callback) {
    callbacks.onError.push(callback);
}

// ============================================================================
// OUTGOING EVENTS
// ============================================================================

/**
 * Sends a player position update to the server
 * @param {Object} position - { x, y, z }
 */
export function sendPlayerPosition(position) {
    state.eventQueue.push({
        type: "player_position",
        position,
        playerName: state.playerName,
    });
}

/**
 * Sends a block placed event to the server
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @param {string} blockType 
 */
export function sendBlockPlaced(x, y, z, blockType) {
    state.eventQueue.push({
        type: "block_placed",
        x, y, z,
        blockType,
        playerName: state.playerName,
    });
}

/**
 * Sends a block broken event to the server
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 */
export function sendBlockBroken(x, y, z) {
    state.eventQueue.push({
        type: "block_broken",
        x, y, z,
        playerName: state.playerName,
    });
}

/**
 * Requests a layer mode change
 * @param {number} layer - Y level
 */
export function requestLayerChange(layer) {
    state.eventQueue.push({
        type: "layer_set",
        layer,
    });
}

/**
 * Toggles layer mode on/off
 */
export function toggleLayerMode() {
    state.eventQueue.push({
        type: "layer_toggle",
    });
}

/**
 * Requests materials list from server
 */
export function requestMaterials() {
    state.eventQueue.push({
        type: "request_materials",
    });
}

// ============================================================================
// EXPORT STATE FOR DEBUGGING
// ============================================================================

export function getDebugState() {
    return {
        connected: state.connected,
        clientId: state.clientId,
        playerName: state.playerName,
        activeBlueprint: state.activeBlueprint,
        chunksLoaded: state.blueprintChunks.size,
        layerMode: state.layerMode,
        progress: state.progress,
        eventQueueLength: state.eventQueue.length,
        retryCount: state.retryCount,
    };
}
