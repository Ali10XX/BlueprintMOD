# Architecture Rules (Non-Negotiable)

## Rule 1: Single Active Run
```
IF run is active:
  "Start" button → "Cancel" button
  New run request → Cancel current, then start new
```

## Rule 2: Per-Run Budgets
```typescript
const DEFAULT_BUDGET = {
  maxFrames: 150,        // Frame extraction stops here
  maxRuntimeMs: 900000,  // 15 minutes total
  maxAiCalls: 0,         // AI disabled in MVP
};
```

## Rule 3: No Implicit Retries
```
Stage fails → Record failure, show error
User clicks "Retry" → Reset failure count for that stage
Automatic retry → FORBIDDEN
```

## Rule 4: Circuit Breaker
```
failureCount[stage] >= 2 → STOP RUN
Error: "Stage X failed twice. Circuit breaker open."
```

## Rule 5: Idempotent Stage Outputs
```
runs/
  {runId}/
    frame_extraction/
      {cacheKey}.json    ← If exists, skip stage
    reconstruction/
      {cacheKey}.json
    alignment/
      {cacheKey}.json
    voxelization/
      {cacheKey}.json
    export/
      output.mcstructure
```

## Rule 6: Every Failure Has a Reason
```typescript
// REQUIRED for all failures:
{
  errorCode: string;       // Machine-readable
  title: string;           // User-facing title
  description: string;     // What happened
  suggestions: string[];   // What to do next
}
```

## Rule 7: Cancellation Always Works
```
User clicks "Cancel" → AbortController.abort()
All async operations check signal.aborted
Run stops within 2 seconds
State: "cancelled" (not "failed")
```

## File Locations

- Run Controller: `viewer/src/lib/core/runController.ts`
- MVP Spec: `docs/MVP_SPEC.md`
- Stage outputs: `{outputDir}/runs/{runId}/{stageName}/`

## State Machine

```
        ┌──────────────────────────────────────┐
        │                                      │
        ▼                                      │
    ┌───────┐    start    ┌─────────┐         │
    │ IDLE  │────────────▶│ RUNNING │         │
    └───────┘             └────┬────┘         │
        ▲                      │              │
        │         ┌────────────┼────────────┐ │
        │         │            │            │ │
        │         ▼            ▼            ▼ │
        │    ┌─────────┐  ┌────────┐  ┌──────────┐
        │    │SUCCEEDED│  │ FAILED │  │CANCELLED │
        │    └────┬────┘  └────┬───┘  └────┬─────┘
        │         │            │           │
        └─────────┴────────────┴───────────┘
                  (user can start new run)
```

## Budget Enforcement

| Budget | When Checked | Action if Exceeded |
|--------|--------------|-------------------|
| maxFrames | After extraction | Stop extraction, use frames so far |
| maxRuntimeMs | Before each stage | Fail run with BUDGET_TIME |
| maxAiCalls | Before AI call | Skip AI, use fallback |

## The One Rule That Prevents Chaos

**Every stage must be resumable.**

If the app crashes mid-run:
1. User clicks "Start" again with same video
2. Cached stages are skipped
3. Run continues from where it left off

This is why we write to disk after every stage.
