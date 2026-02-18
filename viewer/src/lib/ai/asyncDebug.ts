/**
 * asyncDebug.ts - Observability tools for async pipeline debugging
 * 
 * Detects:
 * - Hanging promises (promises that don't resolve within timeout)
 * - Retry loops (excessive retries in a time window)
 * - Silent failures (promises that reject but aren't logged)
 * - State corruption (unexpected state transitions)
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEBUG_CONFIG = {
  PROMISE_WARN_THRESHOLD_MS: 10000,    // Warn if promise pending > 10s
  PROMISE_ERROR_THRESHOLD_MS: 30000,   // Error if promise pending > 30s
  MAX_RETRIES_PER_WINDOW: 10,          // Max retries in a time window
  RETRY_WINDOW_MS: 60000,              // 1 minute window
  ENABLE_CONSOLE_LOGGING: true,
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface TrackedPromise {
  id: number;
  label: string;
  startTime: number;
  resolved: boolean;
  rejected: boolean;
  warnTimeout?: ReturnType<typeof setTimeout>;
  errorTimeout?: ReturnType<typeof setTimeout>;
}

interface RetryEvent {
  timestamp: number;
  label: string;
  attempt: number;
}

// ============================================================================
// STATE
// ============================================================================

let promiseCounter = 0;
const trackedPromises = new Map<number, TrackedPromise>();
const retryEvents: RetryEvent[] = [];
let onHangingPromise: ((info: { id: number; label: string; pendingMs: number }) => void) | null = null;
let onRetryLoopDetected: ((info: { retries: number; windowMs: number }) => void) | null = null;

// ============================================================================
// CALLBACKS
// ============================================================================

export function setHangingPromiseCallback(
  callback: ((info: { id: number; label: string; pendingMs: number }) => void) | null
): void {
  onHangingPromise = callback;
}

export function setRetryLoopCallback(
  callback: ((info: { retries: number; windowMs: number }) => void) | null
): void {
  onRetryLoopDetected = callback;
}

// ============================================================================
// PROMISE TRACKING
// ============================================================================

/**
 * Wraps a promise with tracking to detect if it hangs.
 * DOES NOT MODIFY the promise behavior - only observes.
 */
export function trackPromise<T>(promise: Promise<T>, label: string): Promise<T> {
  const id = ++promiseCounter;
  const startTime = Date.now();
  
  const tracked: TrackedPromise = {
    id,
    label,
    startTime,
    resolved: false,
    rejected: false,
  };
  
  // Set warning timeout
  tracked.warnTimeout = setTimeout(() => {
    if (!tracked.resolved && !tracked.rejected) {
      const pendingMs = Date.now() - startTime;
      console.warn(`[AsyncDebug] ⚠️ HANGING PROMISE WARNING: "${label}" (id=${id}) pending for ${pendingMs}ms`);
      onHangingPromise?.({ id, label, pendingMs });
    }
  }, DEBUG_CONFIG.PROMISE_WARN_THRESHOLD_MS);
  
  // Set error timeout
  tracked.errorTimeout = setTimeout(() => {
    if (!tracked.resolved && !tracked.rejected) {
      const pendingMs = Date.now() - startTime;
      console.error(`[AsyncDebug] 🚨 HANGING PROMISE ERROR: "${label}" (id=${id}) pending for ${pendingMs}ms - LIKELY DEADLOCK`);
      onHangingPromise?.({ id, label, pendingMs });
    }
  }, DEBUG_CONFIG.PROMISE_ERROR_THRESHOLD_MS);
  
  trackedPromises.set(id, tracked);
  
  if (DEBUG_CONFIG.ENABLE_CONSOLE_LOGGING) {
    console.log(`[AsyncDebug] Started tracking promise "${label}" (id=${id})`);
  }
  
  // Attach cleanup handlers (does not modify promise behavior)
  promise
    .then(() => {
      tracked.resolved = true;
      cleanup(id);
      const durationMs = Date.now() - startTime;
      if (DEBUG_CONFIG.ENABLE_CONSOLE_LOGGING) {
        console.log(`[AsyncDebug] ✓ Promise "${label}" (id=${id}) resolved in ${durationMs}ms`);
      }
    })
    .catch((error) => {
      tracked.rejected = true;
      cleanup(id);
      const durationMs = Date.now() - startTime;
      console.error(`[AsyncDebug] ✗ Promise "${label}" (id=${id}) rejected in ${durationMs}ms:`, error?.message || error);
    });
  
  return promise;
}

function cleanup(id: number): void {
  const tracked = trackedPromises.get(id);
  if (tracked) {
    if (tracked.warnTimeout) clearTimeout(tracked.warnTimeout);
    if (tracked.errorTimeout) clearTimeout(tracked.errorTimeout);
    trackedPromises.delete(id);
  }
}

// ============================================================================
// RETRY TRACKING
// ============================================================================

/**
 * Records a retry event. Detects retry loops.
 */
export function recordRetry(label: string, attempt: number): void {
  const now = Date.now();
  
  // Add event
  retryEvents.push({ timestamp: now, label, attempt });
  
  // Cleanup old events
  const cutoff = now - DEBUG_CONFIG.RETRY_WINDOW_MS;
  while (retryEvents.length > 0 && retryEvents[0].timestamp < cutoff) {
    retryEvents.shift();
  }
  
  // Check for retry loop
  if (retryEvents.length >= DEBUG_CONFIG.MAX_RETRIES_PER_WINDOW) {
    console.warn(`[AsyncDebug] ⚠️ RETRY LOOP DETECTED: ${retryEvents.length} retries in ${DEBUG_CONFIG.RETRY_WINDOW_MS}ms`);
    onRetryLoopDetected?.({ retries: retryEvents.length, windowMs: DEBUG_CONFIG.RETRY_WINDOW_MS });
  }
  
  if (DEBUG_CONFIG.ENABLE_CONSOLE_LOGGING) {
    console.log(`[AsyncDebug] Retry recorded: "${label}" attempt ${attempt} (${retryEvents.length} retries in window)`);
  }
}

// ============================================================================
// STATE INSPECTION
// ============================================================================

export function getPendingPromises(): { id: number; label: string; pendingMs: number }[] {
  const now = Date.now();
  return Array.from(trackedPromises.values())
    .filter(p => !p.resolved && !p.rejected)
    .map(p => ({
      id: p.id,
      label: p.label,
      pendingMs: now - p.startTime,
    }));
}

export function getRecentRetries(): RetryEvent[] {
  return [...retryEvents];
}

export function getDebugStats(): {
  pendingPromises: number;
  retriesInWindow: number;
  oldestPendingMs: number | null;
} {
  const pending = getPendingPromises();
  return {
    pendingPromises: pending.length,
    retriesInWindow: retryEvents.length,
    oldestPendingMs: pending.length > 0 ? Math.max(...pending.map(p => p.pendingMs)) : null,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

export function resetDebugState(): void {
  trackedPromises.forEach((_, id) => cleanup(id));
  trackedPromises.clear();
  retryEvents.length = 0;
  console.log('[AsyncDebug] State reset');
}

// ============================================================================
// GUARDS
// ============================================================================

/**
 * Asserts that a condition is true. Throws if false.
 * Use for invariant checking in async code.
 */
export function assertState(condition: boolean, message: string): asserts condition {
  if (!condition) {
    console.error(`[AsyncDebug] 🚨 STATE ASSERTION FAILED: ${message}`);
    throw new Error(`State assertion failed: ${message}`);
  }
}

/**
 * Creates a "never hang" wrapper that rejects if the promise doesn't settle.
 */
export function withDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
  label: string
): Promise<T> {
  let deadlineTimeout: ReturnType<typeof setTimeout>;
  
  const deadlinePromise = new Promise<never>((_, reject) => {
    deadlineTimeout = setTimeout(() => {
      reject(new Error(`DEADLINE EXCEEDED: "${label}" did not complete within ${deadlineMs}ms`));
    }, deadlineMs);
  });
  
  return Promise.race([promise, deadlinePromise]).finally(() => {
    clearTimeout(deadlineTimeout);
  }) as Promise<T>;
}
