/**
 * rateLimiter.ts - Production-grade rate limiter for Gemini API
 * 
 * Design principles:
 * - NO global retry state - each request manages its own retries
 * - Always resolve OR throw - never hang
 * - Timeout on all waits - cannot block forever
 * - Observable - every state transition is logged
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MAX_REQUESTS_PER_MINUTE: 15,
  MIN_DELAY_MS: 500,
  REQUEST_TIMEOUT_MS: 30000,      // 30s max for any single API call
  MAX_WAIT_MS: 10000,             // 10s max wait for rate limit
  INITIAL_BACKOFF_MS: 2000,
  MAX_BACKOFF_MS: 10000,          // Cap backoff at 10s, not 60s
  MAX_RETRIES: 2,                 // 3 total attempts (1 initial + 2 retries)
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface RequestLogEntry {
  id: number;
  timestamp: Date;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
  errorType?: 'rate_limit' | 'daily_quota' | 'timeout' | 'other';
  duration?: number;
  attempt: number;
  maxAttempts: number;
}

export interface RateLimitResult {
  shouldProceed: boolean;
  waitedMs: number;
  reason?: string;
}

type StatusCallback = (message: string, waitTime?: number) => void;
type LogCallback = (log: RequestLogEntry[]) => void;

// ============================================================================
// STATE (only for tracking, NOT for retry logic)
// ============================================================================

let requestTimestamps: number[] = [];
let requestLog: RequestLogEntry[] = [];
let requestIdCounter = 0;
let statusCallback: StatusCallback | null = null;
let logCallback: LogCallback | null = null;

// ============================================================================
// CALLBACKS
// ============================================================================

export function setRateLimiterCallback(callback: StatusCallback | null): void {
  statusCallback = callback;
}

export function setLogCallback(callback: LogCallback | null): void {
  logCallback = callback;
}

function reportStatus(message: string, waitTime?: number): void {
  console.log(`[RateLimiter] rateLimiter.ts: ${message}`);
  statusCallback?.(message, waitTime);
}

function notifyLogUpdate(): void {
  logCallback?.([...requestLog]);
}

// ============================================================================
// REQUEST LOGGING
// ============================================================================

export function startRequest(attempt: number, maxAttempts: number): number {
  const id = ++requestIdCounter;
  const entry: RequestLogEntry = {
    id,
    timestamp: new Date(),
    status: 'pending',
    attempt,
    maxAttempts,
  };
  requestLog.push(entry);
  if (requestLog.length > 50) {
    requestLog = requestLog.slice(-50);
  }
  notifyLogUpdate();
  console.log(`[RateLimiter] rateLimiter.ts: Request #${id} started (attempt ${attempt}/${maxAttempts})`);
  return id;
}

export function completeRequest(id: number, duration: number): void {
  const entry = requestLog.find(e => e.id === id);
  if (entry) {
    entry.status = 'success';
    entry.duration = duration;
  }
  notifyLogUpdate();
  console.log(`[RateLimiter] rateLimiter.ts: Request #${id} completed in ${duration}ms`);
}

export function failRequest(
  id: number, 
  errorMessage: string, 
  errorType: 'rate_limit' | 'daily_quota' | 'timeout' | 'other'
): void {
  const entry = requestLog.find(e => e.id === id);
  if (entry) {
    entry.status = 'error';
    entry.errorMessage = errorMessage;
    entry.errorType = errorType;
  }
  notifyLogUpdate();
  console.log(`[RateLimiter] rateLimiter.ts: Request #${id} failed: [${errorType}] ${errorMessage.substring(0, 100)}`);
}

export function getRequestLog(): RequestLogEntry[] {
  return [...requestLog];
}

export function clearRequestLog(): void {
  requestLog = [];
  requestIdCounter = 0;
  notifyLogUpdate();
}

// ============================================================================
// RATE LIMITING (stateless per-request)
// ============================================================================

function cleanupOldTimestamps(): void {
  const oneMinuteAgo = Date.now() - 60000;
  requestTimestamps = requestTimestamps.filter(ts => ts > oneMinuteAgo);
}

export function getRequestsInLastMinute(): number {
  cleanupOldTimestamps();
  return requestTimestamps.length;
}

/**
 * Calculates wait time based on CURRENT state only.
 * Does NOT use any retry counters.
 */
function calculateWaitTime(): number {
  cleanupOldTimestamps();
  
  if (requestTimestamps.length === 0) {
    return 0;
  }
  
  // At rate limit? Wait for oldest to expire
  if (requestTimestamps.length >= CONFIG.MAX_REQUESTS_PER_MINUTE) {
    const oldestTimestamp = requestTimestamps[0];
    const waitUntil = oldestTimestamp + 60000;
    return Math.max(0, waitUntil - Date.now() + 500);
  }
  
  // Minimum delay between requests
  const lastTimestamp = requestTimestamps[requestTimestamps.length - 1];
  const timeSinceLastRequest = Date.now() - lastTimestamp;
  return Math.max(0, CONFIG.MIN_DELAY_MS - timeSinceLastRequest);
}

/**
 * Waits for rate limit with TIMEOUT.
 * ALWAYS returns or throws. NEVER hangs.
 */
export async function waitForRateLimit(): Promise<RateLimitResult> {
  const waitTimeMs = Math.min(calculateWaitTime(), CONFIG.MAX_WAIT_MS);
  
  if (waitTimeMs <= 0) {
    return { shouldProceed: true, waitedMs: 0 };
  }
  
  const waitTimeSec = Math.ceil(waitTimeMs / 1000);
  reportStatus(`Waiting ${waitTimeSec}s for rate limit...`, waitTimeSec);
  
  await new Promise(resolve => setTimeout(resolve, waitTimeMs));
  
  return { 
    shouldProceed: true, 
    waitedMs: waitTimeMs,
    reason: `Waited ${waitTimeMs}ms for rate limit`
  };
}

/**
 * Records a successful request timestamp.
 */
export function recordRequest(): void {
  requestTimestamps.push(Date.now());
}

/**
 * Calculates backoff for a SPECIFIC attempt number.
 * PURE FUNCTION - no global state.
 */
export function calculateBackoff(attemptNumber: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Math.min((retryAfterSeconds + 1) * 1000, CONFIG.MAX_BACKOFF_MS);
  }
  
  // Exponential backoff: 2s, 4s, 8s... capped at MAX_BACKOFF_MS
  const backoff = CONFIG.INITIAL_BACKOFF_MS * Math.pow(2, attemptNumber - 1);
  return Math.min(backoff, CONFIG.MAX_BACKOFF_MS);
}

/**
 * Waits for backoff with TIMEOUT.
 */
export async function waitForBackoff(attemptNumber: number, retryAfterSeconds?: number): Promise<number> {
  const backoffMs = calculateBackoff(attemptNumber, retryAfterSeconds);
  const cappedBackoff = Math.min(backoffMs, CONFIG.MAX_WAIT_MS);
  
  if (cappedBackoff > 0) {
    reportStatus(`Backing off ${Math.ceil(cappedBackoff / 1000)}s before retry...`);
    await new Promise(resolve => setTimeout(resolve, cappedBackoff));
  }
  
  return cappedBackoff;
}

// ============================================================================
// RESET
// ============================================================================

export function resetRateLimiter(): void {
  requestTimestamps = [];
  requestLog = [];
  requestIdCounter = 0;
  notifyLogUpdate();
  console.log('[RateLimiter] rateLimiter.ts: Reset complete');
}

// ============================================================================
// STATS
// ============================================================================

export function getRateLimiterStats(): {
  requestsInLastMinute: number;
  maxRequestsPerMinute: number;
  waitTimeMs: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
} {
  const successful = requestLog.filter(r => r.status === 'success').length;
  const failed = requestLog.filter(r => r.status === 'error').length;
  
  return {
    requestsInLastMinute: getRequestsInLastMinute(),
    maxRequestsPerMinute: CONFIG.MAX_REQUESTS_PER_MINUTE,
    waitTimeMs: calculateWaitTime(),
    totalRequests: requestLog.length,
    successfulRequests: successful,
    failedRequests: failed,
  };
}

// ============================================================================
// ERROR PARSING UTILITIES
// ============================================================================

export function parseRetryDelay(errorMessage: string): number | undefined {
  const retryMatch = errorMessage.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (retryMatch) {
    return Math.ceil(parseFloat(retryMatch[1]));
  }
  
  const jsonMatch = errorMessage.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  if (jsonMatch) {
    return parseInt(jsonMatch[1], 10);
  }
  
  return undefined;
}

export function isDailyQuotaExhausted(errorMessage: string): boolean {
  const lowerMsg = errorMessage.toLowerCase();
  
  if (lowerMsg.includes('daily') && lowerMsg.includes('exhausted')) {
    return true;
  }
  
  const retryMatch = errorMessage.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (retryMatch) {
    const retrySeconds = parseFloat(retryMatch[1]);
    if (retrySeconds > 3600) {
      return true;
    }
  }
  
  return false;
}

export function is429Error(errorMessage: string): boolean {
  return (
    errorMessage.includes('429') ||
    errorMessage.includes('Too Many Requests') ||
    errorMessage.includes('quota') ||
    errorMessage.includes('rate')
  );
}

// ============================================================================
// CONFIG EXPORT
// ============================================================================

export const RATE_LIMIT_CONFIG = { ...CONFIG } as const;
