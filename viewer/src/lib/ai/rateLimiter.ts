/**
 * rateLimiter.ts - Rate limiter for Gemini API calls
 * 
 * This module handles rate limiting to prevent 429 errors from the Gemini API.
 * It tracks request timestamps, logs all requests, and implements exponential backoff.
 */

// Configuration for rate limiting
const CONFIG = {
  // Maximum requests per minute (Gemini free tier limit is 15 RPM)
  MAX_REQUESTS_PER_MINUTE: 15,
  // Minimum delay between requests in ms (safety buffer)
  MIN_DELAY_BETWEEN_REQUESTS: 4500, // ~13 requests per minute to stay safe
  // Maximum retry attempts on 429 errors
  MAX_RETRIES: 3,
  // Initial backoff delay in ms
  INITIAL_BACKOFF_MS: 5000,
  // Maximum backoff delay in ms
  MAX_BACKOFF_MS: 60000,
};

// Request log entry interface
export interface RequestLogEntry {
  id: number;
  timestamp: Date;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
  errorType?: 'rate_limit' | 'daily_quota' | 'other';
  duration?: number;
  retryCount: number;
}

// Store timestamps of recent requests
let requestTimestamps: number[] = [];

// Current backoff state
let currentBackoffMs = 0;
let consecutiveErrors = 0;

// Request history log
let requestLog: RequestLogEntry[] = [];
let requestIdCounter = 0;

// Callback for status updates
type StatusCallback = (message: string, waitTime?: number) => void;
let statusCallback: StatusCallback | null = null;

// Callback for log updates
type LogCallback = (log: RequestLogEntry[]) => void;
let logCallback: LogCallback | null = null;

/**
 * Sets a callback function to receive rate limiter status updates
 * @param callback - Function to call with status updates
 */
export function setRateLimiterCallback(callback: StatusCallback | null): void {
  statusCallback = callback;
}

/**
 * Sets a callback function to receive log updates
 * @param callback - Function to call when log changes
 */
export function setLogCallback(callback: LogCallback | null): void {
  logCallback = callback;
}

/**
 * Reports status to the callback if one is set
 * @param message - Status message to report
 * @param waitTime - Optional wait time in seconds
 */
function reportStatus(message: string, waitTime?: number): void {
  console.log(`[RateLimiter] ${message}`);
  if (statusCallback) {
    statusCallback(message, waitTime);
  }
}

/**
 * Notifies the log callback of changes
 */
function notifyLogUpdate(): void {
  if (logCallback) {
    logCallback([...requestLog]);
  }
}

/**
 * Starts tracking a new request
 * @returns The request log entry ID
 */
export function startRequest(): number {
  const id = ++requestIdCounter;
  const entry: RequestLogEntry = {
    id,
    timestamp: new Date(),
    status: 'pending',
    retryCount: consecutiveErrors,
  };
  requestLog.push(entry);
  // Keep only last 50 entries
  if (requestLog.length > 50) {
    requestLog = requestLog.slice(-50);
  }
  notifyLogUpdate();
  console.log(`[RateLimiter] Request #${id} started (retry: ${consecutiveErrors})`);
  return id;
}

/**
 * Marks a request as successful
 * @param id - The request ID
 * @param duration - How long the request took in ms
 */
export function completeRequest(id: number, duration: number): void {
  const entry = requestLog.find(e => e.id === id);
  if (entry) {
    entry.status = 'success';
    entry.duration = duration;
  }
  notifyLogUpdate();
  console.log(`[RateLimiter] Request #${id} completed in ${duration}ms`);
}

/**
 * Marks a request as failed
 * @param id - The request ID
 * @param errorMessage - The error message
 * @param errorType - Type of error
 */
export function failRequest(id: number, errorMessage: string, errorType: 'rate_limit' | 'daily_quota' | 'other'): void {
  const entry = requestLog.find(e => e.id === id);
  if (entry) {
    entry.status = 'error';
    entry.errorMessage = errorMessage;
    entry.errorType = errorType;
  }
  notifyLogUpdate();
  console.log(`[RateLimiter] Request #${id} failed: [${errorType}] ${errorMessage.substring(0, 100)}...`);
}

/**
 * Gets the full request log
 * @returns Array of request log entries
 */
export function getRequestLog(): RequestLogEntry[] {
  return [...requestLog];
}

/**
 * Clears the request log
 */
export function clearRequestLog(): void {
  requestLog = [];
  requestIdCounter = 0;
  notifyLogUpdate();
}

/**
 * Cleans up old request timestamps (older than 1 minute)
 */
function cleanupOldTimestamps(): void {
  const oneMinuteAgo = Date.now() - 60000;
  requestTimestamps = requestTimestamps.filter(ts => ts > oneMinuteAgo);
}

/**
 * Gets the number of requests made in the last minute
 * @returns Number of requests in the last minute
 */
export function getRequestsInLastMinute(): number {
  cleanupOldTimestamps();
  return requestTimestamps.length;
}

/**
 * Calculates how long to wait before the next request can be made
 * @returns Wait time in milliseconds
 */
export function getWaitTimeMs(): number {
  cleanupOldTimestamps();
  
  // If we have a backoff from a 429 error, use that
  if (currentBackoffMs > 0) {
    return currentBackoffMs;
  }
  
  // If we haven't made any requests, no wait needed
  if (requestTimestamps.length === 0) {
    return 0;
  }
  
  // Check if we're at the rate limit
  if (requestTimestamps.length >= CONFIG.MAX_REQUESTS_PER_MINUTE) {
    // Wait until the oldest request falls out of the 1-minute window
    const oldestTimestamp = requestTimestamps[0];
    const waitUntil = oldestTimestamp + 60000;
    const waitTime = waitUntil - Date.now();
    return Math.max(0, waitTime + 1000); // Add 1s buffer
  }
  
  // Ensure minimum delay between requests
  const lastTimestamp = requestTimestamps[requestTimestamps.length - 1];
  const timeSinceLastRequest = Date.now() - lastTimestamp;
  const waitTime = CONFIG.MIN_DELAY_BETWEEN_REQUESTS - timeSinceLastRequest;
  
  return Math.max(0, waitTime);
}

/**
 * Waits for the calculated delay before allowing the next request
 */
export async function waitForRateLimit(): Promise<void> {
  const waitTimeMs = getWaitTimeMs();
  
  if (waitTimeMs > 0) {
    const waitTimeSec = Math.ceil(waitTimeMs / 1000);
    reportStatus(`Rate limit: waiting ${waitTimeSec}s before next request...`, waitTimeSec);
    await new Promise(resolve => setTimeout(resolve, waitTimeMs));
    // Clear the backoff after we've waited (so we don't wait twice)
    currentBackoffMs = 0;
  }
}

/**
 * Records a successful request timestamp
 */
export function recordRequest(): void {
  requestTimestamps.push(Date.now());
  // Reset backoff on successful request
  currentBackoffMs = 0;
  consecutiveErrors = 0;
}

/**
 * Handles a 429 rate limit error by setting up exponential backoff
 * @param retryAfterSeconds - Optional retry-after value from the API response
 */
export function handle429Error(retryAfterSeconds?: number): void {
  consecutiveErrors++;
  
  // Use retry-after header if provided, otherwise use exponential backoff
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    currentBackoffMs = (retryAfterSeconds + 5) * 1000; // Add 5s buffer
    reportStatus(`API rate limit hit. Waiting ${retryAfterSeconds + 5}s as requested by API...`);
  } else {
    // Exponential backoff: 5s, 10s, 20s, 40s... up to max
    currentBackoffMs = Math.min(
      CONFIG.INITIAL_BACKOFF_MS * Math.pow(2, consecutiveErrors - 1),
      CONFIG.MAX_BACKOFF_MS
    );
    reportStatus(`API rate limit hit. Backing off for ${Math.ceil(currentBackoffMs / 1000)}s...`);
  }
}

/**
 * Checks if we should retry after a 429 error
 * @returns true if we should retry
 */
export function shouldRetry(): boolean {
  return consecutiveErrors <= CONFIG.MAX_RETRIES;
}

/**
 * Resets the rate limiter state (useful for testing or user reset)
 */
export function resetRateLimiter(): void {
  requestTimestamps = [];
  currentBackoffMs = 0;
  consecutiveErrors = 0;
  reportStatus('Rate limiter reset');
}

/**
 * Gets the current rate limiter statistics
 * @returns Object with rate limiter stats
 */
export function getRateLimiterStats(): {
  requestsInLastMinute: number;
  maxRequestsPerMinute: number;
  waitTimeMs: number;
  consecutiveErrors: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
} {
  const successful = requestLog.filter(r => r.status === 'success').length;
  const failed = requestLog.filter(r => r.status === 'error').length;
  
  return {
    requestsInLastMinute: getRequestsInLastMinute(),
    maxRequestsPerMinute: CONFIG.MAX_REQUESTS_PER_MINUTE,
    waitTimeMs: getWaitTimeMs(),
    consecutiveErrors,
    totalRequests: requestLog.length,
    successfulRequests: successful,
    failedRequests: failed,
  };
}

/**
 * Parses retry delay from Gemini API error message
 * @param errorMessage - The error message from the API
 * @returns Retry delay in seconds, or undefined if not found
 */
export function parseRetryDelay(errorMessage: string): number | undefined {
  // Look for "Please retry in X.XXs" or similar patterns
  const retryMatch = errorMessage.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (retryMatch) {
    return Math.ceil(parseFloat(retryMatch[1]));
  }
  
  // Look for retryDelay in JSON
  const jsonMatch = errorMessage.match(/"retryDelay"\s*:\s*"(\d+)s"/);
  if (jsonMatch) {
    return parseInt(jsonMatch[1], 10);
  }
  
  return undefined;
}

/**
 * Checks if the error indicates daily quota exhaustion (not just per-minute rate limit)
 * @param errorMessage - The error message from the API
 * @returns true if daily quota is exhausted
 */
export function isDailyQuotaExhausted(errorMessage: string): boolean {
  // "limit: 0" appears in BOTH per-minute AND daily quota errors, so it's NOT reliable
  // We need to check if the retry delay is very long (> 1 hour = likely daily limit)
  // Or if the message explicitly says daily/day limit is exhausted
  
  // Check for explicit daily exhaustion messages
  const lowerMsg = errorMessage.toLowerCase();
  if (lowerMsg.includes('daily limit') && lowerMsg.includes('exhausted')) {
    return true;
  }
  if (lowerMsg.includes('daily quota') && lowerMsg.includes('exhausted')) {
    return true;
  }
  
  // Check if retry delay is > 1 hour (3600 seconds) - indicates daily limit
  const retryMatch = errorMessage.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (retryMatch) {
    const retrySeconds = parseFloat(retryMatch[1]);
    if (retrySeconds > 3600) {
      return true; // Retry delay > 1 hour = daily quota exhausted
    }
  }
  
  // For everything else, assume it's a per-minute rate limit (can be retried)
  return false;
}
