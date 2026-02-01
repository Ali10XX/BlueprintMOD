/**
 * geminiDetector.ts - Gemini AI integration for Minecraft block detection
 * 
 * This module handles communication with the Gemini API to analyze video frames
 * and detect Minecraft blocks with their positions. Includes rate limiting to
 * prevent 429 errors.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Block } from '../../types';
import {
  waitForRateLimit,
  recordRequest,
  handle429Error,
  shouldRetry,
  parseRetryDelay,
  isDailyQuotaExhausted,
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
  type RequestLogEntry,
} from './rateLimiter';

// Gemini AI client instance
let genAI: GoogleGenerativeAI | null = null;

/**
 * Initializes the Gemini AI client with the provided API key
 * @param apiKey - Google Gemini API key
 */
export function initGemini(apiKey: string) {
  genAI = new GoogleGenerativeAI(apiKey);
  // Reset rate limiter when changing API keys (new key = fresh quota)
  resetRateLimiter();
}

/**
 * Checks if the Gemini client has been initialized
 * @returns true if initialized
 */
export function isGeminiInitialized(): boolean {
  return genAI !== null;
}

// Re-export rate limiter functions for external use
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

// Detection result interface
interface DetectionResult {
  blocks: Block[];
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

/**
 * Detects Minecraft blocks from a single video frame using Gemini AI
 * 
 * @param imageBase64 - Base64 encoded image data
 * @param context - Frame context information
 * @returns Detection result with blocks, confidence, and notes
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
  if (!genAI) {
    throw new Error('Gemini not initialized. Call initGemini(apiKey) first.');
  }

  // Use gemini-2.0-flash for vision tasks
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Prompt for Minecraft block detection
  const prompt = `You are a Minecraft expert analyzing a screenshot from a Minecraft build tutorial video.

YOUR TASK: Create a block-by-block blueprint of the structure shown in this image.

Look at the Minecraft build in this image and list every visible block with its position. Think of the structure as a 3D grid where:
- X axis = left/right (left is 0, increases to the right)
- Y axis = up/down (ground is 0, increases upward)
- Z axis = front/back (front is 0, increases toward back)

For each block you can see:
1. Identify what type of Minecraft block it is
2. Estimate its X, Y, Z grid position relative to the bottom-left-front corner being (0,0,0)

RESPOND WITH ONLY THIS JSON FORMAT:
{
  "blocks": [
    {"x": 0, "y": 0, "z": 0, "type": "minecraft:oak_planks"},
    {"x": 1, "y": 0, "z": 0, "type": "minecraft:oak_planks"},
    {"x": 0, "y": 1, "z": 0, "type": "minecraft:glass"}
  ],
  "confidence": "high",
  "notes": "A small wooden house with glass windows"
}

BLOCK NAMING RULES:
- Always use minecraft: prefix (e.g., minecraft:stone, minecraft:oak_log, minecraft:cobblestone)
- Common blocks: oak_planks, spruce_planks, cobblestone, stone, glass, oak_stairs, oak_door, torch, crafting_table
- For logs, use: oak_log, spruce_log, birch_log, etc.
- For stairs, use: oak_stairs, cobblestone_stairs, stone_stairs, etc.

BE THOROUGH: List EVERY block you can identify. Even if there are 50+ blocks, list them all. The more blocks you identify, the better the blueprint will be.

If this appears to be a tutorial showing how to build layer-by-layer, focus on the current layer being shown.

Return ONLY the JSON, no other text or markdown.`;

  // Implement retry logic with rate limiting
  let lastError: Error | null = null;
  let currentRequestId: number | null = null;
  
  while (shouldRetry()) {
    // Start tracking this request
    currentRequestId = startRequest();
    const requestStartTime = Date.now();
    
    try {
      // Wait for rate limit before making request
      await waitForRateLimit();
      
      console.log(`[Gemini] Request #${currentRequestId}: Analyzing frame ${context.frameNumber}/${context.totalFrames}...`);

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBase64,
          },
        },
        { text: prompt },
      ]);

      // Record successful request
      const duration = Date.now() - requestStartTime;
      recordRequest();
      completeRequest(currentRequestId, duration);

      const response = result.response.text();
      console.log(`[Gemini] Request #${currentRequestId}: Raw response:`, response.substring(0, 200));

      // Clean up response - remove markdown code blocks if present
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);

      console.log(`[Gemini] Request #${currentRequestId}: Detected ${parsed.blocks?.length || 0} blocks. Notes: ${parsed.notes}`);

      return {
        blocks: parsed.blocks || [],
        confidence: parsed.confidence || 'low',
        notes: parsed.notes || '',
      };
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || String(error);
      
      // Check if this is a 429 rate limit error
      if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests') || 
          errorMessage.includes('quota') || errorMessage.includes('rate')) {
        
        // Check if daily quota is exhausted - no point retrying
        if (isDailyQuotaExhausted(errorMessage)) {
          console.error(`[Gemini] Request #${currentRequestId}: DAILY QUOTA EXHAUSTED`);
          failRequest(currentRequestId!, errorMessage.substring(0, 200), 'daily_quota');
          const dailyError = new Error(
            'Daily API quota exhausted! The free tier limit has been reached. ' +
            'Please wait until tomorrow (quotas reset at midnight Pacific Time) ' +
            'or upgrade to a paid plan at https://ai.google.dev/pricing'
          );
          throw dailyError;
        }
        
        // Log as rate limit error
        console.warn(`[Gemini] Request #${currentRequestId}: Rate limit error, will retry...`);
        failRequest(currentRequestId!, errorMessage.substring(0, 200), 'rate_limit');
        
        // Parse retry delay from error message if available
        const retryDelay = parseRetryDelay(errorMessage);
        handle429Error(retryDelay);
        
        // Continue loop to retry
        if (shouldRetry()) {
          console.log(`[Gemini] Will retry after backoff...`);
          continue;
        }
      } else {
        // Non-rate-limit error
        console.error(`[Gemini] Request #${currentRequestId}: Error:`, errorMessage.substring(0, 200));
        failRequest(currentRequestId!, errorMessage.substring(0, 200), 'other');
      }
      
      // For non-429 errors or after max retries, throw
      throw error;
    }
  }
  
  // If we exhausted retries, throw the last error
  throw lastError || new Error('Failed after maximum retries');
}

/**
 * Analyzes multiple video frames to build a complete blueprint
 * 
 * @param frames - Array of base64 encoded frame images
 * @param onProgress - Optional callback for progress updates
 * @returns Array of all detected blocks
 */
export async function analyzeFullVideo(
  frames: string[], // Base64 encoded frames
  onProgress?: (current: number, total: number, blocks: Block[]) => void
): Promise<Block[]> {
  const allBlocks = new Map<string, Block>();

  console.log(`[Gemini] Starting full video analysis: ${frames.length} frames`);
  console.log(`[Gemini] Rate limiter will ensure max 15 requests per minute`);

  for (let i = 0; i < frames.length; i++) {
    try {
      const result = await detectBlocksFromFrame(frames[i], {
        frameNumber: i + 1,
        totalFrames: frames.length,
        previousBlocks: Array.from(allBlocks.values()),
      });

      console.log(`[Gemini] Frame ${i + 1}: Found ${result.blocks.length} blocks`);

      // Merge new blocks (avoid duplicates at same position)
      for (const block of result.blocks) {
        const key = `${block.x},${block.y},${block.z}`;
        if (!allBlocks.has(key)) {
          allBlocks.set(key, block);
        }
      }

      // Report progress
      onProgress?.(i + 1, frames.length, Array.from(allBlocks.values()));

      // Note: Rate limiting is now handled by waitForRateLimit() in detectBlocksFromFrame
      // No need for additional delay here
    } catch (error) {
      console.error(`[Gemini] Error processing frame ${i + 1}:`, error);
      // Continue with next frame instead of failing completely
    }
  }

  console.log(`[Gemini] Total unique blocks detected: ${allBlocks.size}`);
  return Array.from(allBlocks.values());
}

/**
 * Performs a quick single-frame analysis for preview purposes
 * 
 * @param imageBase64 - Base64 encoded image data
 * @returns Detection result with blocks, confidence, and notes
 */
export async function quickAnalyze(imageBase64: string): Promise<DetectionResult> {
  return detectBlocksFromFrame(imageBase64, {
    frameNumber: 1,
    totalFrames: 1,
  });
}
