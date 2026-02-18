import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import YTDlpWrap from 'yt-dlp-wrap';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;
const WS_PORT = 3002;

// ============================================================================
// WEBSOCKET SERVER FOR MINECRAFT BEDROCK SYNC
// ============================================================================

/**
 * Blueprint sync state - maintains connection state and blueprint data
 * for real-time synchronization with Minecraft Bedrock client
 */
const wsState = {
  // Connected Minecraft clients
  clients: new Map(), // clientId -> { ws, playerName, dimension, lastPosition }
  
  // Current blueprint being synced
  activeBlueprint: null, // { name, blocks, size, anchor, palette }
  
  // Layer mode state
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
};

/**
 * Generates a unique client ID
 */
function generateClientId() {
  return `mc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Compresses blueprint data into chunks for efficient transmission
 * @param {Object} blueprint - Full blueprint data
 * @returns {Array} - Array of chunk objects
 */
function chunkifyBlueprint(blueprint) {
  if (!blueprint || !blueprint.blocks) return [];
  
  const CHUNK_SIZE = 16; // 16x16x16 chunks
  const chunks = new Map();
  
  // Group blocks into chunks
  for (const block of blueprint.blocks) {
    const chunkX = Math.floor(block.x / CHUNK_SIZE);
    const chunkY = Math.floor(block.y / CHUNK_SIZE);
    const chunkZ = Math.floor(block.z / CHUNK_SIZE);
    const chunkId = `${chunkX}_${chunkY}_${chunkZ}`;
    
    if (!chunks.has(chunkId)) {
      chunks.set(chunkId, {
        chunkId,
        origin: { x: chunkX * CHUNK_SIZE, y: chunkY * CHUNK_SIZE, z: chunkZ * CHUNK_SIZE },
        blocks: [],
      });
    }
    
    // Store block with local coordinates within chunk
    chunks.get(chunkId).blocks.push({
      x: block.x % CHUNK_SIZE,
      y: block.y % CHUNK_SIZE,
      z: block.z % CHUNK_SIZE,
      type: block.type,
      states: block.states || {},
    });
  }
  
  return Array.from(chunks.values());
}

/**
 * Broadcasts a message to all connected Minecraft clients
 * @param {Object} message - Message to broadcast
 * @param {string} excludeClientId - Optional client ID to exclude
 */
function broadcastToMinecraft(message, excludeClientId = null) {
  const msgStr = JSON.stringify(message);
  
  for (const [clientId, client] of wsState.clients) {
    if (clientId !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msgStr);
    }
  }
}

/**
 * Handles incoming WebSocket messages from Minecraft clients
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} clientId - Client identifier
 * @param {Object} message - Parsed message object
 */
function handleMinecraftMessage(ws, clientId, message) {
  const client = wsState.clients.get(clientId);
  
  switch (message.type) {
    // ========== CLIENT REGISTRATION ==========
    case 'register':
      // Minecraft client identifying itself
      if (client) {
        client.playerName = message.playerName || 'Unknown';
        client.dimension = message.dimension || 'overworld';
        console.log(`[WS] server.js: Player registered: ${client.playerName} in ${client.dimension}`);
        
        // Send current blueprint if one is active
        if (wsState.activeBlueprint) {
          ws.send(JSON.stringify({
            type: 'blueprint_load',
            name: wsState.activeBlueprint.name,
            size: wsState.activeBlueprint.size,
            anchor: wsState.activeBlueprint.anchor,
            totalChunks: chunkifyBlueprint(wsState.activeBlueprint).length,
          }));
        }
      }
      break;
      
    // ========== PLAYER EVENTS ==========
    case 'player_position':
      // Update player position for proximity-based chunk loading
      if (client) {
        client.lastPosition = message.position;
        // Could implement proximity-based chunk streaming here
      }
      break;
      
    case 'block_placed':
      // Player placed a block - update progress
      wsState.progress.placedBlocks++;
      broadcastToMinecraft({
        type: 'progress_update',
        progress: wsState.progress,
      }, clientId);
      console.log(`[WS] server.js: Block placed at ${message.x},${message.y},${message.z} - ${message.blockType}`);
      break;
      
    case 'block_broken':
      // Player broke a block - update progress
      if (wsState.progress.placedBlocks > 0) {
        wsState.progress.placedBlocks--;
      }
      broadcastToMinecraft({
        type: 'progress_update',
        progress: wsState.progress,
      }, clientId);
      break;
      
    // ========== LAYER MODE COMMANDS ==========
    case 'layer_set':
      wsState.layerMode.currentY = Math.max(0, message.layer || 0);
      broadcastToMinecraft({
        type: 'layer_update',
        layer: wsState.layerMode.currentY,
        enabled: wsState.layerMode.enabled,
      });
      break;
      
    case 'layer_toggle':
      wsState.layerMode.enabled = !wsState.layerMode.enabled;
      broadcastToMinecraft({
        type: 'layer_update',
        layer: wsState.layerMode.currentY,
        enabled: wsState.layerMode.enabled,
      });
      break;
      
    // ========== CHUNK REQUESTS ==========
    case 'request_chunk':
      // Client requesting a specific chunk
      if (wsState.activeBlueprint) {
        const chunks = chunkifyBlueprint(wsState.activeBlueprint);
        const chunk = chunks.find(c => c.chunkId === message.chunkId);
        if (chunk) {
          ws.send(JSON.stringify({
            type: 'blueprint_chunk',
            ...chunk,
          }));
        }
      }
      break;
      
    case 'request_all_chunks':
      // Client requesting all chunks (initial load)
      if (wsState.activeBlueprint) {
        const chunks = chunkifyBlueprint(wsState.activeBlueprint);
        for (const chunk of chunks) {
          ws.send(JSON.stringify({
            type: 'blueprint_chunk',
            ...chunk,
          }));
        }
        ws.send(JSON.stringify({
          type: 'blueprint_complete',
          totalChunks: chunks.length,
        }));
      }
      break;
      
    // ========== MATERIALS REQUEST ==========
    case 'request_materials':
      // Send materials list
      if (wsState.activeBlueprint) {
        const materials = {};
        for (const block of wsState.activeBlueprint.blocks) {
          materials[block.type] = (materials[block.type] || 0) + 1;
        }
        ws.send(JSON.stringify({
          type: 'materials_list',
          materials,
          totalBlocks: wsState.activeBlueprint.blocks.length,
        }));
      }
      break;
      
    default:
      console.log(`[WS] server.js: Unknown message type: ${message.type}`);
  }
}

/**
 * Creates and initializes the WebSocket server
 */
function createWebSocketServer() {
  const wss = new WebSocketServer({ port: WS_PORT });
  
  wss.on('connection', (ws) => {
    const clientId = generateClientId();
    
    // Register new client
    wsState.clients.set(clientId, {
      ws,
      playerName: null,
      dimension: null,
      lastPosition: null,
      connectedAt: Date.now(),
    });
    
    console.log(`[WS] server.js: Minecraft client connected (${clientId}). Total clients: ${wsState.clients.size}`);
    
    // Send welcome message with client ID
    ws.send(JSON.stringify({
      type: 'welcome',
      clientId,
      serverVersion: '1.0.0',
      features: ['blueprint_sync', 'layer_mode', 'materials_list', 'progress_tracking'],
    }));
    
    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMinecraftMessage(ws, clientId, message);
      } catch (err) {
        console.error(`[WS] server.js: Failed to parse message:`, err.message);
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      const client = wsState.clients.get(clientId);
      console.log(`[WS] server.js: Client disconnected: ${client?.playerName || clientId}`);
      wsState.clients.delete(clientId);
    });
    
    // Handle errors
    ws.on('error', (err) => {
      console.error(`[WS] server.js: Client error (${clientId}):`, err.message);
    });
  });
  
  console.log(`[WS] server.js: WebSocket server running on ws://localhost:${WS_PORT}`);
  return wss;
}

// ============================================================================
// API ENDPOINTS FOR BLUEPRINT MANAGEMENT (called by viewer app)
// ============================================================================

/**
 * Load a blueprint and broadcast to all Minecraft clients
 * POST /api/blueprint/load
 * Body: { name, blocks, size, anchor }
 */
app.post('/api/blueprint/load', express.json({ limit: '50mb' }), (req, res) => {
  const { name, blocks, size, anchor } = req.body;
  
  if (!blocks || !Array.isArray(blocks)) {
    return res.status(400).json({ error: 'Invalid blueprint data' });
  }
  
  // Store active blueprint
  wsState.activeBlueprint = {
    name: name || 'Unnamed',
    blocks,
    size: size || { x: 0, y: 0, z: 0 },
    anchor: anchor || { x: 0, y: 0, z: 0 },
  };
  
  // Reset progress
  wsState.progress = {
    totalBlocks: blocks.length,
    placedBlocks: 0,
    wrongBlocks: 0,
  };
  
  // Calculate size if not provided
  if (!size || (size.x === 0 && size.y === 0 && size.z === 0)) {
    const maxX = Math.max(...blocks.map(b => b.x)) + 1;
    const maxY = Math.max(...blocks.map(b => b.y)) + 1;
    const maxZ = Math.max(...blocks.map(b => b.z)) + 1;
    wsState.activeBlueprint.size = { x: maxX, y: maxY, z: maxZ };
  }
  
  // Broadcast to all connected clients
  const chunks = chunkifyBlueprint(wsState.activeBlueprint);
  broadcastToMinecraft({
    type: 'blueprint_load',
    name: wsState.activeBlueprint.name,
    size: wsState.activeBlueprint.size,
    anchor: wsState.activeBlueprint.anchor,
    totalChunks: chunks.length,
  });
  
  console.log(`[API] server.js: Blueprint loaded: ${name} (${blocks.length} blocks, ${chunks.length} chunks)`);
  
  res.json({
    success: true,
    name: wsState.activeBlueprint.name,
    blockCount: blocks.length,
    chunkCount: chunks.length,
    connectedClients: wsState.clients.size,
  });
});

/**
 * Update layer mode
 * POST /api/blueprint/layer
 * Body: { enabled, currentY, showBelow }
 */
app.post('/api/blueprint/layer', express.json(), (req, res) => {
  const { enabled, currentY, showBelow } = req.body;
  
  if (enabled !== undefined) wsState.layerMode.enabled = enabled;
  if (currentY !== undefined) wsState.layerMode.currentY = currentY;
  if (showBelow !== undefined) wsState.layerMode.showBelow = showBelow;
  
  broadcastToMinecraft({
    type: 'layer_update',
    ...wsState.layerMode,
  });
  
  res.json({ success: true, layerMode: wsState.layerMode });
});

/**
 * Get current connection status
 * GET /api/blueprint/status
 */
app.get('/api/blueprint/status', (req, res) => {
  const clients = Array.from(wsState.clients.values()).map(c => ({
    playerName: c.playerName,
    dimension: c.dimension,
    connectedAt: c.connectedAt,
  }));
  
  res.json({
    connected: wsState.clients.size > 0,
    clientCount: wsState.clients.size,
    clients,
    activeBlueprint: wsState.activeBlueprint ? {
      name: wsState.activeBlueprint.name,
      blockCount: wsState.activeBlueprint.blocks.length,
      size: wsState.activeBlueprint.size,
    } : null,
    layerMode: wsState.layerMode,
    progress: wsState.progress,
  });
});

/**
 * Clear the active blueprint
 * POST /api/blueprint/clear
 */
app.post('/api/blueprint/clear', (req, res) => {
  wsState.activeBlueprint = null;
  wsState.progress = { totalBlocks: 0, placedBlocks: 0, wrongBlocks: 0 };
  
  broadcastToMinecraft({ type: 'blueprint_clear' });
  
  res.json({ success: true });
});

/**
 * Move blueprint anchor
 * POST /api/blueprint/move
 * Body: { anchor: { x, y, z } }
 */
app.post('/api/blueprint/move', express.json(), (req, res) => {
  const { anchor } = req.body;
  
  if (!wsState.activeBlueprint) {
    return res.status(400).json({ error: 'No active blueprint' });
  }
  
  wsState.activeBlueprint.anchor = anchor;
  
  broadcastToMinecraft({
    type: 'blueprint_move',
    anchor,
  });
  
  res.json({ success: true, anchor });
});

// Global error handlers to prevent server crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - keep server running
});

app.use(cors());
app.use(express.json());

// Directory for downloaded videos
const DOWNLOADS_DIR = join(__dirname, 'downloads');
if (!existsSync(DOWNLOADS_DIR)) {
  mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// yt-dlp binary path
const ytDlpPath = join(__dirname, 'yt-dlp.exe');
let ytDlpWrap = null;

// Download yt-dlp binary if not present
async function ensureYtDlp() {
  if (!existsSync(ytDlpPath)) {
    console.log('Downloading yt-dlp binary...');
    try {
      // Try the static method first
      await YTDlpWrap.downloadFromGithub(ytDlpPath);
    } catch (e) {
      // If that doesn't work, try the default export
      const YTDlp = YTDlpWrap.default || YTDlpWrap;
      if (YTDlp.downloadFromGithub) {
        await YTDlp.downloadFromGithub(ytDlpPath);
      } else {
        // Manual download
        console.log('Auto-download failed. Please download yt-dlp manually:');
        console.log('  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
        console.log(`  Save to: ${ytDlpPath}`);
        throw new Error('yt-dlp binary not found and auto-download failed');
      }
    }
    console.log('yt-dlp downloaded successfully');
  }

  const YTDlp = YTDlpWrap.default || YTDlpWrap;
  ytDlpWrap = new YTDlp(ytDlpPath);
}

// Common yt-dlp arguments - keep it simple, defaults work best with latest yt-dlp
const YT_DLP_COMMON_ARGS = [
  '--no-warnings',  // Suppress warnings in output
  '--socket-timeout', '30',  // Timeout for network operations
];

// Helper function to execute yt-dlp commands
async function execYtDlp(args) {
  try {
    return await ytDlpWrap.execPromise([...args, ...YT_DLP_COMMON_ARGS]);
  } catch (error) {
    console.error('yt-dlp error:', error.message);
    throw error;
  }
}

// Get video info
app.get('/api/video-info', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    await ensureYtDlp();

    // Use execPromise with custom args for better compatibility
    const result = await execYtDlp([
      url,
      '--dump-json',
      '--no-download',
    ]);
    
    // yt-dlp sometimes outputs extra text before/after JSON
    // Extract only the JSON portion (starts with { and ends with })
    let jsonStr = result;
    
    // Find the first { and last } to extract the JSON object
    const jsonStart = result.indexOf('{');
    const jsonEnd = result.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error('Invalid response from yt-dlp: no JSON found');
    }
    
    jsonStr = result.substring(jsonStart, jsonEnd + 1);
    
    const info = JSON.parse(jsonStr);

    res.json({
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      uploader: info.uploader,
    });
  } catch (error) {
    console.error('Error getting video info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download video
app.post('/api/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    await ensureYtDlp();

    // Generate unique filename
    const filename = `video_${Date.now()}.mp4`;
    const outputPath = join(DOWNLOADS_DIR, filename);

    console.log(`Downloading: ${url}`);

    // Download with yt-dlp - use format that doesn't need ffmpeg merge
    await execYtDlp([
      url,
      '-f', 'best[height<=720][ext=mp4]/best[ext=mp4]/best',
      '-o', outputPath,
      '--no-playlist',
    ]);

    console.log(`Downloaded to: ${outputPath}`);

    res.json({
      success: true,
      filename,
      path: `/api/video/${filename}`,
    });
  } catch (error) {
    console.error('Error downloading video:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve downloaded video
app.get('/api/video/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = join(DOWNLOADS_DIR, filename);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  res.sendFile(filePath);
});

// Clean up old videos (optional endpoint)
app.delete('/api/video/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = join(DOWNLOADS_DIR, filename);

  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }

  res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, async () => {
  console.log(`[HTTP] server.js: Express server running on http://localhost:${PORT}`);
  console.log('[HTTP] server.js: Checking yt-dlp...');
  try {
    await ensureYtDlp();
    console.log('[HTTP] server.js: Ready to download videos!');
  } catch (error) {
    console.error('[HTTP] server.js: Warning:', error.message);
    console.log('[HTTP] server.js: Server started but yt-dlp may not work until binary is installed.');
  }
});

// Start WebSocket server for Minecraft sync
const wss = createWebSocketServer();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] server.js: Shutting down...');
  
  // Close all WebSocket connections
  for (const [clientId, client] of wsState.clients) {
    client.ws.close(1000, 'Server shutting down');
  }
  wss.close();
  
  process.exit(0);
});
