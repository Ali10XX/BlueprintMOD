/**
 * geminiDetector.ts - Gemini AI integration for Minecraft block detection
 * 
 * ARCHITECTURE:
 * - Single-frame 2.5D detection (x,z grid + estimated y height)
 * - Strict JSON schema enforcement
 * - Comprehensive error logging
 * - Debug fields for observability
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Block } from '../../types';
import {
  waitForRateLimit,
  waitForBackoff,
  recordRequest,
  parseRetryDelay,
  isDailyQuotaExhausted,
  is429Error,
  setRateLimiterCallback,
  setLogCallback,
  getRequestsInLastMinute,
  getRateLimiterStats,
  resetRateLimiter,
  startRequest,
  completeRequest,
  failRequest,
  getRequestLog,
  clearRequestLog,
  RATE_LIMIT_CONFIG,
  type RequestLogEntry,
} from './rateLimiter';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  API_TIMEOUT_MS: 60000,           // 60s - Gemini can be slow with images
  MAX_RETRIES: 2,                  // 3 total attempts
  INTER_FRAME_DELAY_MS: 1000,      // 1s between frames
} as const;

// ============================================================================
// STATE
// ============================================================================

let genAI: GoogleGenerativeAI | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initGemini(apiKey: string) {
  genAI = new GoogleGenerativeAI(apiKey);
  resetRateLimiter();
  console.log('[Gemini] geminiDetector.ts: Initialized with new API key');
}

export function isGeminiInitialized(): boolean {
  return genAI !== null;
}

// Re-export rate limiter functions
export { 
  setRateLimiterCallback, 
  setLogCallback,
  getRequestsInLastMinute, 
  getRateLimiterStats, 
  resetRateLimiter,
  getRequestLog,
  clearRequestLog,
  type RequestLogEntry,
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * Debug information returned with every detection
 */
export interface DetectionDebug {
  imageSummary: string;           // What Gemini saw in the image
  confidence: 'high' | 'medium' | 'low' | 'none';
  reasonIfZeroBlocks: string | null;
  gridAssumptions: {
    estimatedBlockSizePixels: number;
    estimatedGridWidth: number;
    estimatedGridDepth: number;
    viewAngle: string;            // 'isometric' | 'side' | 'top' | 'perspective'
  } | null;
  rawResponsePreview: string;     // First 500 chars of raw response
  parseSuccessful: boolean;
  responseFormat: 'json' | 'markdown' | 'text' | 'unknown';
}

/**
 * A detected block with position, type, and confidence
 */
export interface DetectedBlock {
  x: number;                      // Horizontal position (left=0)
  y: number;                      // Vertical/height (bottom=0)
  z: number;                      // Depth (front=0)
  type: string;                   // Block type with minecraft: prefix
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Full detection result
 */
export interface DetectionResult {
  blocks: Block[];
  confidence: 'high' | 'medium' | 'low' | 'none';
  notes: string;
  debug: DetectionDebug;
}

interface FrameResult {
  frameIndex: number;
  success: boolean;
  blocks: Block[];
  error?: string;
  attempts: number;
  durationMs: number;
  debug?: DetectionDebug;
}

// ============================================================================
// IMPROVED DETECTION PROMPT
// ============================================================================

const DETECTION_PROMPT = `You are analyzing a Minecraft screenshot to identify blocks and their positions.

CRITICAL INSTRUCTIONS:
1. Return ONLY a JSON object. No markdown, no code fences, no explanation text.
2. If you cannot identify blocks, still return valid JSON with empty blocks array.
3. Use the EXACT schema below.

JSON SCHEMA (you MUST follow this exactly):
{
  "blocks": [
    {
      "x": <integer>,
      "y": <integer>,
      "z": <integer>,
      "type": "<string>",
      "confidence": "<high|medium|low>"
    }
  ],
  "debug": {
    "imageSummary": "<string describing what you see>",
    "confidence": "<high|medium|low|none>",
    "reasonIfZeroBlocks": "<string or null>",
    "gridAssumptions": {
      "estimatedBlockSizePixels": <integer>,
      "estimatedGridWidth": <integer>,
      "estimatedGridDepth": <integer>,
      "viewAngle": "<isometric|side|top|perspective|unknown>"
    }
  }
}

COORDINATE SYSTEM:
- Origin (0,0,0) is at the BOTTOM-LEFT-FRONT corner of the visible structure
- X axis: LEFT to RIGHT (increases rightward)
- Y axis: BOTTOM to TOP (increases upward, ground level = 0)
- Z axis: FRONT to BACK (increases into the screen/image)

DETECTION STRATEGY (for single screenshot):
1. First, identify if this is a Minecraft screenshot (blocks visible, pixel art style)
2. Estimate the viewing angle (isometric, side view, top-down, etc.)
3. Identify a reference point (ground level, corner of structure)
4. For each visible block:
   - Estimate its x position (columns from left)
   - Estimate its y position (rows from bottom/ground)
   - Estimate its z position (depth layers, 0=front, 1=behind, etc.)
   - Identify the block type
5. If depth is ambiguous, use z=0 for front-most visible blocks

BLOCK TYPE FORMAT:
Always use "minecraft:" prefix. Common blocks:
- minecraft:stone, minecraft:cobblestone, minecraft:stone_bricks
- minecraft:oak_planks, minecraft:spruce_planks, minecraft:oak_log
- minecraft:oak_stairs, minecraft:cobblestone_stairs
- minecraft:glass, minecraft:glass_pane
- minecraft:dirt, minecraft:grass_block
- minecraft:bricks, minecraft:sandstone
- minecraft:iron_block, minecraft:gold_block, minecraft:diamond_block

EXAMPLE OUTPUT (for a small 3-block L-shape):
{"blocks":[{"x":0,"y":0,"z":0,"type":"minecraft:cobblestone","confidence":"high"},{"x":1,"y":0,"z":0,"type":"minecraft:cobblestone","confidence":"high"},{"x":0,"y":1,"z":0,"type":"minecraft:cobblestone","confidence":"high"}],"debug":{"imageSummary":"Small L-shaped structure made of 3 cobblestone blocks on grass","confidence":"high","reasonIfZeroBlocks":null,"gridAssumptions":{"estimatedBlockSizePixels":32,"estimatedGridWidth":2,"estimatedGridDepth":1,"viewAngle":"isometric"}}}

IMPORTANT:
- Return VALID JSON only. No other text before or after.
- If the image is not Minecraft or has no blocks, return: {"blocks":[],"debug":{"imageSummary":"<describe what you see>","confidence":"none","reasonIfZeroBlocks":"<explanation>","gridAssumptions":null}}
- Be generous with detection - it's better to detect blocks with medium confidence than miss them.
- For large structures, detect at least the first 100-200 most visible blocks.`;

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Wraps a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  }) as Promise<T>;
}

/**
 * Normalizes block type names
 */
function normalizeBlockType(blockType: string): string {
  if (!blockType || typeof blockType !== 'string') {
    return 'minecraft:stone';
  }
  
  let normalized = blockType.toLowerCase().trim();
  
  if (!normalized.includes(':')) {
    normalized = `minecraft:${normalized}`;
  }
  
  // Common fixes
  const fixes: Record<string, string> = {
    'minecraft:grass_block': 'minecraft:grass',
    'minecraft:oak_wood': 'minecraft:oak_log',
    'minecraft:wooden_planks': 'minecraft:oak_planks',
    'minecraft:wood_planks': 'minecraft:oak_planks',
    'minecraft:cobble': 'minecraft:cobblestone',
  };
  
  return fixes[normalized] || normalized;
}

/**
 * Strips base64 data URL prefix if present
 */
function stripBase64Prefix(base64: string): string {
  if (base64.startsWith('data:')) {
    const commaIndex = base64.indexOf(',');
    if (commaIndex !== -1) {
      console.log('[Gemini] geminiDetector.ts: Stripped data URL prefix from base64');
      return base64.substring(commaIndex + 1);
    }
  }
  return base64;
}

/**
 * Detects the actual image format from base64 header
 */
function detectImageFormat(base64: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  // PNG: starts with iVBORw0KGgo
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  // JPEG: starts with /9j/
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  // WebP: starts with UklGR
  if (base64.startsWith('UklGR')) return 'image/webp';
  // GIF: starts with R0lGOD
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  // Default to PNG
  return 'image/png';
}

/**
 * Determines response format
 */
function detectResponseFormat(response: string): 'json' | 'markdown' | 'text' | 'unknown' {
  const trimmed = response.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('```')) return 'markdown';
  if (trimmed.includes('"blocks"') && trimmed.includes('{')) return 'text'; // JSON embedded in text
  return 'unknown';
}

/**
 * Extracts JSON from various response formats
 */
function extractJSON(response: string): string {
  let str = response.trim();
  
  // Remove markdown code fences
  if (str.startsWith('```json')) {
    str = str.slice(7);
  } else if (str.startsWith('```')) {
    str = str.slice(3);
  }
  if (str.endsWith('```')) {
    str = str.slice(0, -3);
  }
  str = str.trim();
  
  // If still not JSON, try to extract JSON object
  if (!str.startsWith('{') && !str.startsWith('[')) {
    const jsonStart = str.indexOf('{');
    const jsonEnd = str.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      str = str.substring(jsonStart, jsonEnd + 1);
    }
  }
  
  return str;
}

/**
 * Creates default debug info for errors
 */
function createErrorDebug(rawResponse: string, error: string): DetectionDebug {
  return {
    imageSummary: 'Failed to parse response',
    confidence: 'none',
    reasonIfZeroBlocks: error,
    gridAssumptions: null,
    rawResponsePreview: rawResponse.substring(0, 500),
    parseSuccessful: false,
    responseFormat: detectResponseFormat(rawResponse),
  };
}

// ============================================================================
// CORE DETECTION
// ============================================================================

/**
 * Makes a single API call with comprehensive error handling
 */
async function makeApiCall(
  imageBase64: string,
  requestId: number,
  frameNumber: number,
  totalFrames: number
): Promise<DetectionResult> {
  if (!genAI) {
    throw new Error('Gemini not initialized. Call initGemini(apiKey) first.');
  }

  // DIAGNOSTIC: Check base64 format
  const hadPrefix = imageBase64.startsWith('data:');
  const cleanBase64 = stripBase64Prefix(imageBase64);
  const detectedMimeType = detectImageFormat(cleanBase64);
  
  console.log(`[Gemini] geminiDetector.ts: Request #${requestId}: Diagnostics:
    - Had data URL prefix: ${hadPrefix}
    - Detected MIME type: ${detectedMimeType}
    - Base64 length: ${cleanBase64.length}
    - Base64 preview: ${cleanBase64.substring(0, 30)}...`);

  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.1,  // Low temperature for consistent structured output
      topP: 0.8,
      maxOutputTokens: 8192,
    },
  });
  
  console.log(`[Gemini] geminiDetector.ts: Request #${requestId}: Sending to Gemini (frame ${frameNumber}/${totalFrames})...`);
  
  const result = await withTimeout(
    model.generateContent([
      {
        inlineData: {
          mimeType: detectedMimeType,
          data: cleanBase64,
        },
      },
      { text: DETECTION_PROMPT },
    ]),
    CONFIG.API_TIMEOUT_MS,
    `Gemini API call for frame ${frameNumber}`
  );

  const rawResponse = result.response.text();
  const responseFormat = detectResponseFormat(rawResponse);
  
  console.log(`[Gemini] geminiDetector.ts: Request #${requestId}: Response received
    - Length: ${rawResponse.length}
    - Format: ${responseFormat}
    - Preview: ${rawResponse.substring(0, 200)}...`);

  // Try to parse JSON
  let parsed: any;
  let parseSuccessful = false;
  
  try {
    const jsonStr = extractJSON(rawResponse);
    parsed = JSON.parse(jsonStr);
    parseSuccessful = true;
    console.log(`[Gemini] geminiDetector.ts: Request #${requestId}: JSON parsed successfully`);
  } catch (parseError) {
    console.error(`[Gemini] geminiDetector.ts: Request #${requestId}: JSON PARSE FAILED
    - Error: ${parseError}
    - Raw response (first 500 chars): ${rawResponse.substring(0, 500)}
    - Response format detected: ${responseFormat}`);
    
    return {
      blocks: [],
      confidence: 'none',
      notes: `JSON parse failed: ${parseError}`,
      debug: createErrorDebug(rawResponse, String(parseError)),
    };
  }

  // DIAGNOSTIC: Validate response structure
  console.log(`[Gemini] geminiDetector.ts: Request #${requestId}: Parsed object keys: ${Object.keys(parsed).join(', ')}`);
  
  if (!parsed.blocks) {
    console.warn(`[Gemini] geminiDetector.ts: Request #${requestId}: WARNING - 'blocks' field missing!
    - Available keys: ${Object.keys(parsed).join(', ')}
    - Full parsed object: ${JSON.stringify(parsed).substring(0, 500)}`);
  }
  
  if (parsed.blocks && !Array.isArray(parsed.blocks)) {
    console.warn(`[Gemini] geminiDetector.ts: Request #${requestId}: WARNING - 'blocks' is not an array!
    - Type: ${typeof parsed.blocks}
    - Value: ${JSON.stringify(parsed.blocks).substring(0, 200)}`);
  }

  // Process blocks
  const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const processedBlocks: Block[] = rawBlocks.map((block: any, index: number) => {
    if (typeof block.x !== 'number' || typeof block.y !== 'number' || typeof block.z !== 'number') {
      console.warn(`[Gemini] geminiDetector.ts: Request #${requestId}: Block ${index} has invalid coordinates:`, block);
    }
    
    return {
      x: typeof block.x === 'number' ? Math.round(block.x) : 0,
      y: typeof block.y === 'number' ? Math.round(block.y) : 0,
      z: typeof block.z === 'number' ? Math.round(block.z) : 0,
      type: normalizeBlockType(block.type || 'minecraft:stone'),
    };
  });

  // Extract debug info from response
  const debugFromResponse = parsed.debug || {};
  const debug: DetectionDebug = {
    imageSummary: debugFromResponse.imageSummary || 'No summary provided',
    confidence: debugFromResponse.confidence || (processedBlocks.length > 0 ? 'medium' : 'none'),
    reasonIfZeroBlocks: processedBlocks.length === 0 
      ? (debugFromResponse.reasonIfZeroBlocks || 'No blocks detected by AI')
      : null,
    gridAssumptions: debugFromResponse.gridAssumptions || null,
    rawResponsePreview: rawResponse.substring(0, 500),
    parseSuccessful,
    responseFormat,
  };

  console.log(`[Gemini] geminiDetector.ts: Request #${requestId}: Detection complete
    - Blocks found: ${processedBlocks.length}
    - Confidence: ${debug.confidence}
    - Image summary: ${debug.imageSummary.substring(0, 100)}...`);

  if (processedBlocks.length === 0) {
    console.warn(`[Gemini] geminiDetector.ts: Request #${requestId}: ZERO BLOCKS DETECTED
    - Reason: ${debug.reasonIfZeroBlocks}
    - Grid assumptions: ${JSON.stringify(debug.gridAssumptions)}`);
  }

  return {
    blocks: processedBlocks,
    confidence: debug.confidence,
    notes: parsed.notes || debug.imageSummary,
    debug,
  };
}

// ============================================================================
// DETECTION WITH RETRIES
// ============================================================================

/**
 * Detects blocks from a single frame with retries
 */
export async function detectBlocksFromFrame(
  imageBase64: string,
  context: {
    frameNumber: number;
    totalFrames: number;
    previousBlocks?: Block[];
    buildStyle?: string;
  }
): Promise<DetectionResult> {
  const maxAttempts = CONFIG.MAX_RETRIES + 1;
  let lastError: Error | null = null;
  let lastDebug: DetectionDebug | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const requestId = startRequest(attempt, maxAttempts);
    const startTime = Date.now();
    
    try {
      const rateLimitResult = await waitForRateLimit();
      if (rateLimitResult.waitedMs > 0) {
        console.log(`[Gemini] geminiDetector.ts: Request #${requestId}: Waited ${rateLimitResult.waitedMs}ms for rate limit`);
      }
      
      const result = await makeApiCall(
        imageBase64,
        requestId,
        context.frameNumber,
        context.totalFrames
      );
      
      const duration = Date.now() - startTime;
      recordRequest();
      completeRequest(requestId, duration);
      
      console.log(`[Gemini] geminiDetector.ts: Request #${requestId}: SUCCESS in ${duration}ms, ${result.blocks.length} blocks`);
      return result;
      
    } catch (error) {
      lastError = error as Error;
      const duration = Date.now() - startTime;
      const errorMsg = lastError.message || String(error);
      
      console.error(`[Gemini] geminiDetector.ts: Request #${requestId}: FAILED (attempt ${attempt}/${maxAttempts}): ${errorMsg.substring(0, 150)}`);
      
      // Create debug info for the error
      lastDebug = createErrorDebug('', errorMsg);
      
      if (errorMsg.startsWith('TIMEOUT:')) {
        failRequest(requestId, errorMsg.substring(0, 200), 'timeout');
        // Continue to retry on timeout
      } else if (isDailyQuotaExhausted(errorMsg)) {
        failRequest(requestId, 'Daily quota exhausted', 'daily_quota');
        throw new Error(
          'Daily API quota exhausted! Please wait until tomorrow or upgrade your plan.'
        );
      } else if (is429Error(errorMsg)) {
        failRequest(requestId, errorMsg.substring(0, 200), 'rate_limit');
        if (attempt < maxAttempts) {
          const retryDelay = parseRetryDelay(errorMsg);
          await waitForBackoff(attempt, retryDelay);
          continue;
        }
      } else {
        failRequest(requestId, errorMsg.substring(0, 200), 'other');
        // Don't retry on non-retryable errors
        throw error;
      }
    }
  }
  
  // Return error result instead of throwing
  return {
    blocks: [],
    confidence: 'none',
    notes: lastError?.message || 'Failed after retries',
    debug: lastDebug || createErrorDebug('', 'Unknown error'),
  };
}

// ============================================================================
// FULL VIDEO ANALYSIS
// ============================================================================

/**
 * Analyzes multiple frames with guaranteed progress
 */
export async function analyzeFullVideo(
  frames: string[],
  onProgress?: (current: number, total: number, blocks: Block[], frameResult?: FrameResult) => void
): Promise<Block[]> {
  const allBlocks = new Map<string, Block>();
  const frameResults: FrameResult[] = [];
  
  console.log(`[Gemini] geminiDetector.ts: Starting analysis of ${frames.length} frames`);
  
  for (let i = 0; i < frames.length; i++) {
    const frameStartTime = Date.now();
    let frameResult: FrameResult = {
      frameIndex: i,
      success: false,
      blocks: [],
      attempts: 0,
      durationMs: 0,
    };
    
    try {
      const result = await detectBlocksFromFrame(frames[i], {
        frameNumber: i + 1,
        totalFrames: frames.length,
        previousBlocks: Array.from(allBlocks.values()),
      });
      
      frameResult.success = result.blocks.length > 0 || result.debug.parseSuccessful;
      frameResult.blocks = result.blocks;
      frameResult.durationMs = Date.now() - frameStartTime;
      frameResult.debug = result.debug;
      
      // Merge blocks
      for (const block of result.blocks) {
        const key = `${block.x},${block.y},${block.z}`;
        if (!allBlocks.has(key)) {
          allBlocks.set(key, block);
        }
      }
      
      console.log(`[Gemini] geminiDetector.ts: Frame ${i + 1}/${frames.length}: ${result.blocks.length} blocks (total: ${allBlocks.size})`);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      frameResult.error = errorMsg;
      frameResult.durationMs = Date.now() - frameStartTime;
      
      console.error(`[Gemini] geminiDetector.ts: Frame ${i + 1}/${frames.length}: ERROR - ${errorMsg.substring(0, 100)}`);
      
      if (errorMsg.includes('Daily API quota')) {
        onProgress?.(i + 1, frames.length, Array.from(allBlocks.values()), frameResult);
        throw error;
      }
    }
    
    frameResults.push(frameResult);
    onProgress?.(i + 1, frames.length, Array.from(allBlocks.values()), frameResult);
    
    // Delay between frames
    if (i < frames.length - 1) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.INTER_FRAME_DELAY_MS));
    }
  }
  
  const successCount = frameResults.filter(r => r.success).length;
  console.log(`[Gemini] geminiDetector.ts: Analysis complete: ${successCount}/${frames.length} frames, ${allBlocks.size} blocks`);
  
  return Array.from(allBlocks.values());
}

// ============================================================================
// QUICK TEST HARNESS
// ============================================================================

/**
 * Quick test function - runs detection on a single frame with full diagnostics
 * Call this from browser console: await window.quickTestDetection(base64)
 */
export async function quickTestDetection(imageBase64: string): Promise<{
  success: boolean;
  blockCount: number;
  rawResponse: string;
  debug: DetectionDebug;
  blocks: Block[];
  error?: string;
}> {
  console.log('='.repeat(60));
  console.log('[QuickTest] Starting diagnostic detection test...');
  console.log('='.repeat(60));
  
  // Input diagnostics
  const hadPrefix = imageBase64.startsWith('data:');
  const cleanBase64 = stripBase64Prefix(imageBase64);
  const mimeType = detectImageFormat(cleanBase64);
  
  console.log('[QuickTest] Input diagnostics:');
  console.log(`  - Original length: ${imageBase64.length}`);
  console.log(`  - Had data URL prefix: ${hadPrefix}`);
  console.log(`  - Clean base64 length: ${cleanBase64.length}`);
  console.log(`  - Detected MIME type: ${mimeType}`);
  console.log(`  - Base64 start: ${cleanBase64.substring(0, 50)}...`);
  
  try {
    const result = await detectBlocksFromFrame(cleanBase64, {
      frameNumber: 1,
      totalFrames: 1,
    });
    
    console.log('='.repeat(60));
    console.log('[QuickTest] RESULTS:');
    console.log('='.repeat(60));
    console.log(`  - Success: ${result.blocks.length > 0}`);
    console.log(`  - Block count: ${result.blocks.length}`);
    console.log(`  - Confidence: ${result.debug.confidence}`);
    console.log(`  - Parse successful: ${result.debug.parseSuccessful}`);
    console.log(`  - Response format: ${result.debug.responseFormat}`);
    console.log(`  - Image summary: ${result.debug.imageSummary}`);
    if (result.debug.reasonIfZeroBlocks) {
      console.log(`  - Reason for zero blocks: ${result.debug.reasonIfZeroBlocks}`);
    }
    console.log(`  - Raw response preview: ${result.debug.rawResponsePreview.substring(0, 300)}...`);
    
    if (result.blocks.length > 0) {
      console.log(`  - First 5 blocks:`, result.blocks.slice(0, 5));
    }
    
    return {
      success: result.blocks.length > 0,
      blockCount: result.blocks.length,
      rawResponse: result.debug.rawResponsePreview,
      debug: result.debug,
      blocks: result.blocks,
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[QuickTest] ERROR:', errorMsg);
    
    return {
      success: false,
      blockCount: 0,
      rawResponse: '',
      debug: createErrorDebug('', errorMsg),
      blocks: [],
      error: errorMsg,
    };
  }
}

// Expose to window for console testing
if (typeof window !== 'undefined') {
  (window as any).quickTestDetection = quickTestDetection;
  (window as any).initGemini = initGemini;
}

// ============================================================================
// SIMPLE SINGLE-FRAME ANALYSIS
// ============================================================================

export async function quickAnalyze(imageBase64: string): Promise<DetectionResult> {
  return detectBlocksFromFrame(imageBase64, {
    frameNumber: 1,
    totalFrames: 1,
  });
}
