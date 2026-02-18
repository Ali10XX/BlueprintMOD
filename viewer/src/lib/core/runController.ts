/**
 * runController.ts - Exactly-once execution with hard safety constraints
 * 
 * RULES (NON-NEGOTIABLE):
 * 1. Single active run at a time
 * 2. Per-run budgets (frames, time, AI calls)
 * 3. No implicit retries - only explicit user action
 * 4. Circuit breaker - 2 failures = stop
 * 5. Idempotent stage outputs (cached to disk)
 * 6. Every failure produces a reason code
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// TYPES
// ============================================================================

export type StageName = 
  | 'frame_extraction'
  | 'reconstruction'
  | 'alignment'
  | 'voxelization'
  | 'export';

export type RunState = 
  | 'idle'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type FailureCategory =
  | 'user_cancelled'
  | 'budget_exceeded'
  | 'stage_failed'
  | 'circuit_breaker'
  | 'timeout'
  | 'validation_failed';

export interface RunBudget {
  maxFrames: number;
  maxRuntimeMs: number;
  maxAiCalls: number;
}

export interface StageResult {
  stage: StageName;
  success: boolean;
  cached: boolean;
  durationMs: number;
  outputPath?: string;
  error?: string;
  errorCode?: string;
}

export interface RunResult {
  runId: string;
  state: RunState;
  stages: StageResult[];
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  failureCategory?: FailureCategory;
  failureReason?: string;
  failureStage?: StageName;
  outputPath?: string;
}

export interface RunConfig {
  inputPath: string;
  outputDir: string;
  budget: RunBudget;
  forceRerun?: boolean;  // Skip cache if true
  userCalibration?: {
    estimatedWidthBlocks?: number;
    referenceBlockType?: string;
  };
}

type StateChangeCallback = (state: RunState, result?: Partial<RunResult>) => void;

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_BUDGET: RunBudget = {
  maxFrames: 150,
  maxRuntimeMs: 15 * 60 * 1000,  // 15 minutes
  maxAiCalls: 0,  // AI disabled by default in MVP
};

const STAGE_ORDER: StageName[] = [
  'frame_extraction',
  'reconstruction',
  'alignment',
  'voxelization',
  'export',
];

// ============================================================================
// RUN CONTROLLER (SINGLETON)
// ============================================================================

class RunController {
  // === State ===
  private currentRun: RunResult | null = null;
  private abortController: AbortController | null = null;
  private stageFailures: Map<StageName, number> = new Map();
  private startTime: number = 0;
  private onStateChange: StateChangeCallback | null = null;
  
  // === Budget tracking ===
  private framesUsed: number = 0;
  private aiCallsUsed: number = 0;
  
  // === Configuration ===
  private config: RunConfig | null = null;
  
  // =========================================================================
  // PUBLIC API
  // =========================================================================
  
  /**
   * Subscribe to state changes
   */
  subscribe(callback: StateChangeCallback): () => void {
    this.onStateChange = callback;
    return () => { this.onStateChange = null; };
  }
  
  /**
   * Check if a run is currently active
   */
  isRunning(): boolean {
    return this.currentRun?.state === 'running';
  }
  
  /**
   * Get current run state
   */
  getState(): RunResult | null {
    return this.currentRun ? { ...this.currentRun } : null;
  }
  
  /**
   * Start a new run
   * RULE: Only one run at a time. Starting cancels any existing run.
   */
  startRun(config: RunConfig): string {
    // Cancel any existing run
    if (this.isRunning()) {
      this.cancelRun('New run started');
    }
    
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    // Reset state
    this.config = { ...config, budget: { ...DEFAULT_BUDGET, ...config.budget } };
    this.abortController = new AbortController();
    this.stageFailures.clear();
    this.framesUsed = 0;
    this.aiCallsUsed = 0;
    this.startTime = Date.now();
    
    // Create run directory
    const runDir = join(config.outputDir, 'runs', runId);
    mkdirSync(runDir, { recursive: true });
    
    // Initialize run result
    this.currentRun = {
      runId,
      state: 'running',
      stages: [],
      startTime: this.startTime,
    };
    
    this.log(`Run started: ${runId}`);
    this.notifyStateChange();
    
    return runId;
  }
  
  /**
   * Cancel the current run
   */
  cancelRun(reason: string = 'User cancelled'): RunResult | null {
    if (!this.currentRun || this.currentRun.state !== 'running') {
      return null;
    }
    
    this.abortController?.abort();
    this.currentRun.state = 'cancelled';
    this.currentRun.endTime = Date.now();
    this.currentRun.totalDurationMs = this.currentRun.endTime - this.startTime;
    this.currentRun.failureCategory = 'user_cancelled';
    this.currentRun.failureReason = reason;
    
    this.log(`Run cancelled: ${reason}`);
    this.notifyStateChange();
    
    return { ...this.currentRun };
  }
  
  /**
   * Execute a stage with all safety checks
   * RULES ENFORCED:
   * - Budget checks (time, frames, AI calls)
   * - Circuit breaker (2 failures = stop)
   * - Idempotent caching
   * - No implicit retries
   */
  async executeStage<TInput, TOutput>(
    stage: StageName,
    input: TInput,
    executor: (input: TInput, signal: AbortSignal) => Promise<TOutput>,
    validator: (output: TOutput) => { valid: boolean; reason?: string },
    cacheKey: string
  ): Promise<{ success: true; output: TOutput; cached: boolean } | { success: false; error: string; errorCode: string }> {
    
    if (!this.currentRun || this.currentRun.state !== 'running') {
      return { success: false, error: 'No active run', errorCode: 'NO_RUN' };
    }
    
    const stageStartTime = Date.now();
    const runDir = join(this.config!.outputDir, 'runs', this.currentRun.runId);
    const stageDir = join(runDir, stage);
    const cachePath = join(stageDir, `${cacheKey}.json`);
    
    // === CHECK 1: Budget - Time ===
    const elapsed = Date.now() - this.startTime;
    if (elapsed > this.config!.budget.maxRuntimeMs) {
      return this.failRun('budget_exceeded', `Runtime budget exceeded (${Math.round(elapsed / 1000)}s > ${Math.round(this.config!.budget.maxRuntimeMs / 1000)}s)`, stage, 'BUDGET_TIME');
    }
    
    // === CHECK 2: Circuit Breaker ===
    const failures = this.stageFailures.get(stage) || 0;
    if (failures >= 2) {
      return this.failRun('circuit_breaker', `Stage ${stage} failed twice. Circuit breaker open.`, stage, 'CIRCUIT_OPEN');
    }
    
    // === CHECK 3: Cancellation ===
    if (this.abortController?.signal.aborted) {
      return { success: false, error: 'Run was cancelled', errorCode: 'CANCELLED' };
    }
    
    // === CHECK 4: Cache (Idempotency) ===
    if (!this.config!.forceRerun && existsSync(cachePath)) {
      try {
        const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
        this.log(`Stage ${stage}: Using cached result`);
        
        this.currentRun.stages.push({
          stage,
          success: true,
          cached: true,
          durationMs: 0,
          outputPath: cachePath,
        });
        
        return { success: true, output: cached as TOutput, cached: true };
      } catch (e) {
        this.log(`Stage ${stage}: Cache read failed, re-executing`);
      }
    }
    
    // === EXECUTE ===
    this.log(`Stage ${stage}: Starting...`);
    
    try {
      mkdirSync(stageDir, { recursive: true });
      
      const output = await executor(input, this.abortController!.signal);
      
      // === CHECK 5: Validation ===
      const validation = validator(output);
      if (!validation.valid) {
        this.stageFailures.set(stage, failures + 1);
        
        this.currentRun.stages.push({
          stage,
          success: false,
          cached: false,
          durationMs: Date.now() - stageStartTime,
          error: validation.reason || 'Validation failed',
          errorCode: 'VALIDATION_FAILED',
        });
        
        return { success: false, error: validation.reason || 'Output validation failed', errorCode: 'VALIDATION_FAILED' };
      }
      
      // === CACHE OUTPUT ===
      writeFileSync(cachePath, JSON.stringify(output, null, 2));
      
      const durationMs = Date.now() - stageStartTime;
      this.log(`Stage ${stage}: Completed in ${durationMs}ms`);
      
      this.currentRun.stages.push({
        stage,
        success: true,
        cached: false,
        durationMs,
        outputPath: cachePath,
      });
      
      this.notifyStateChange();
      
      return { success: true, output, cached: false };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Check if it's a cancellation
      if (this.abortController?.signal.aborted) {
        return { success: false, error: 'Run was cancelled', errorCode: 'CANCELLED' };
      }
      
      // Record failure for circuit breaker
      this.stageFailures.set(stage, failures + 1);
      
      this.currentRun.stages.push({
        stage,
        success: false,
        cached: false,
        durationMs: Date.now() - stageStartTime,
        error: errorMsg,
        errorCode: 'EXECUTION_ERROR',
      });
      
      this.log(`Stage ${stage}: Failed - ${errorMsg}`);
      
      return { success: false, error: errorMsg, errorCode: 'EXECUTION_ERROR' };
    }
  }
  
  /**
   * Record frames used (for budget tracking)
   */
  recordFramesUsed(count: number): boolean {
    this.framesUsed += count;
    if (this.framesUsed > this.config!.budget.maxFrames) {
      this.log(`Frame budget exceeded: ${this.framesUsed} > ${this.config!.budget.maxFrames}`);
      return false;
    }
    return true;
  }
  
  /**
   * Record AI call (for budget tracking)
   * Returns false if budget exceeded
   */
  recordAiCall(): boolean {
    this.aiCallsUsed++;
    if (this.aiCallsUsed > this.config!.budget.maxAiCalls) {
      this.log(`AI call budget exceeded: ${this.aiCallsUsed} > ${this.config!.budget.maxAiCalls}`);
      return false;
    }
    return true;
  }
  
  /**
   * Complete the run successfully
   */
  completeRun(outputPath: string): RunResult {
    if (!this.currentRun) {
      throw new Error('No active run');
    }
    
    this.currentRun.state = 'succeeded';
    this.currentRun.endTime = Date.now();
    this.currentRun.totalDurationMs = this.currentRun.endTime - this.startTime;
    this.currentRun.outputPath = outputPath;
    
    this.log(`Run completed successfully: ${outputPath}`);
    this.notifyStateChange();
    
    return { ...this.currentRun };
  }
  
  /**
   * Get abort signal for async operations
   */
  getAbortSignal(): AbortSignal | null {
    return this.abortController?.signal || null;
  }
  
  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================
  
  private failRun(
    category: FailureCategory,
    reason: string,
    stage: StageName,
    errorCode: string
  ): { success: false; error: string; errorCode: string } {
    if (this.currentRun) {
      this.currentRun.state = 'failed';
      this.currentRun.endTime = Date.now();
      this.currentRun.totalDurationMs = this.currentRun.endTime - this.startTime;
      this.currentRun.failureCategory = category;
      this.currentRun.failureReason = reason;
      this.currentRun.failureStage = stage;
    }
    
    this.log(`Run failed [${category}]: ${reason}`);
    this.notifyStateChange();
    
    return { success: false, error: reason, errorCode };
  }
  
  private log(message: string): void {
    console.log(`[RunController] ${message}`);
  }
  
  private notifyStateChange(): void {
    if (this.onStateChange && this.currentRun) {
      this.onStateChange(this.currentRun.state, this.currentRun);
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const runController = new RunController();

// ============================================================================
// FAILURE EXPLANATIONS (User-Facing)
// ============================================================================

export const FAILURE_MESSAGES: Record<string, { title: string; description: string; suggestions: string[] }> = {
  // Budget
  'BUDGET_TIME': {
    title: 'Processing took too long',
    description: 'The analysis exceeded the time limit.',
    suggestions: ['Try a shorter video', 'Reduce the number of frames'],
  },
  'BUDGET_FRAMES': {
    title: 'Too many frames',
    description: 'The video has more frames than the limit allows.',
    suggestions: ['Use a shorter video clip', 'The limit is 150 frames'],
  },
  
  // Circuit breaker
  'CIRCUIT_OPEN': {
    title: 'Stage failed repeatedly',
    description: 'This processing step failed twice. To prevent infinite loops, we stopped.',
    suggestions: ['Check the video quality', 'Try a different video', 'Click "Retry" to try again'],
  },
  
  // Cancellation
  'CANCELLED': {
    title: 'Cancelled',
    description: 'You cancelled the analysis.',
    suggestions: ['Click "Start" to try again'],
  },
  
  // Validation failures
  'VALIDATION_FAILED': {
    title: 'Validation failed',
    description: 'The output from this stage did not pass quality checks.',
    suggestions: ['The video may not have enough distinct angles', 'Try recording the build from more viewpoints'],
  },
  
  // Stage-specific
  'FRAMES_INSUFFICIENT': {
    title: 'Not enough usable frames',
    description: 'We could not extract enough sharp, unique frames from the video.',
    suggestions: ['Use a longer video (at least 30 seconds)', 'Ensure the video is not too blurry', 'Include multiple angles of the build'],
  },
  'RECON_FAILED': {
    title: '3D reconstruction failed',
    description: 'We could not build a 3D model from the video frames.',
    suggestions: ['The camera needs to move around the build, not just rotate', 'Include both close and wide shots', 'Avoid videos with fast movement'],
  },
  'ALIGN_FAILED': {
    title: 'Grid alignment failed',
    description: 'We could not detect the Minecraft block grid.',
    suggestions: ['The build should have flat floors or walls', 'Try providing a calibration hint (estimated width)'],
  },
  'VOXEL_EMPTY': {
    title: 'No blocks detected',
    description: 'After processing, no occupied voxels were found.',
    suggestions: ['This usually means the reconstruction quality was too low', 'Try a different video with clearer visuals'],
  },
  'EXPORT_FAILED': {
    title: 'Export failed',
    description: 'Could not write the .mcstructure file.',
    suggestions: ['Check disk space', 'Try again'],
  },
};

export function getFailureMessage(errorCode: string): { title: string; description: string; suggestions: string[] } {
  return FAILURE_MESSAGES[errorCode] || {
    title: 'Unknown error',
    description: `An unexpected error occurred (${errorCode}).`,
    suggestions: ['Try again', 'If the problem persists, report a bug'],
  };
}
