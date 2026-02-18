# MVP Specification: Video → Minecraft Blueprint

## Definition of Done (Success Criteria)

A run is **successful** if and only if:

### 1. Output File
- [ ] Produces a `.mcstructure` file
- [ ] File loads in Minecraft Bedrock (no errors)
- [ ] Structure places in-game correctly

### 2. Shape Accuracy
- [ ] Outer surface matches visible build **±1 block** for **≥70%** of surface area
- [ ] Major features (walls, roof outline, windows) are recognizable
- [ ] No catastrophic misalignment (rotated 90°, wrong scale, etc.)

### 3. Failure Handling
- [ ] If unsuccessful, produces a **failure reason code**
- [ ] User sees human-readable explanation, not a spinner
- [ ] No infinite loops, no runaway API calls

---

## Acceptance Tests

### Test 1: Simple Cube (Sanity Check)
**Input:** 30-second video of a 5×5×5 cobblestone cube, camera orbits 360°  
**Expected:**
- Produces .mcstructure
- Loads in Bedrock
- Shape is roughly 5×5×5 (±1 block tolerance)
- All blocks are "placeholder" (stone or unknown)

**Pass if:** Structure is cube-shaped and imports without error.

---

### Test 2: Small House (Basic Structure)
**Input:** 45-second video of a simple house (10×8×7), standard textures  
**Expected:**
- Produces .mcstructure
- Outer walls visible
- Roof outline present
- Door/window locations approximate (may be filled)

**Pass if:** Recognizable as "house shape" when imported.

---

### Test 3: Insufficient Video (Failure Case)
**Input:** 5-second video, minimal movement, only one angle  
**Expected:**
- Run fails at `reconstruction` stage
- Error code: `RECON_FAILED` or `FRAMES_INSUFFICIENT`
- User message explains: "Not enough angles"

**Pass if:** Fails gracefully with explanation (not spinner/hang).

---

### Test 4: Budget Exceeded (Safety)
**Input:** 10-minute video (would exceed time budget)  
**Expected:**
- Run stops when budget exceeded
- Error code: `BUDGET_TIME`
- Does not continue processing

**Pass if:** Stops at budget limit, not after.

---

### Test 5: Cancellation (Safety)
**Input:** Any video, user clicks "Cancel" mid-run  
**Expected:**
- Run stops within 2 seconds
- State shows "Cancelled"
- No orphan processes continue

**Pass if:** Clean stop, can start new run immediately.

---

### Test 6: Idempotency (Cache)
**Input:** Same video run twice  
**Expected:**
- Second run uses cached stage outputs
- Completes faster than first run
- Same final output

**Pass if:** Stage logs show "Using cached result" on second run.

---

### Test 7: Circuit Breaker (Safety)
**Input:** Corrupted video that causes stage to fail  
**Expected:**
- Stage fails once, retried automatically: NO
- After 2 manual retries, circuit breaker opens
- Error code: `CIRCUIT_OPEN`

**Pass if:** Does not retry indefinitely, stops at 2 failures.

---

## Scope Cuts (What MVP Does NOT Include)

| Feature | Status | Reason |
|---------|--------|--------|
| Accurate block type detection | ❌ Deferred | Export placeholder blocks first |
| Interior block detection | ❌ Out of scope | Impossible from exterior video |
| AI-based refinement | ❌ Disabled | Causes instability |
| Texture pack support | ❌ Out of scope | Default textures only |
| Real-time preview | ❌ Deferred | Focus on batch processing |
| Manual block editing | ❌ Week 4 | After export works |
| Multi-structure export | ❌ Deferred | Single structure only |

---

## Stage-by-Stage Validation Rules

### Stage 1: Frame Extraction
**Validation:**
- `frames.length >= 30` (minimum for SfM)
- `frames.length <= budget.maxFrames`
- `avgBlurScore > 100` (Laplacian variance)
- `duplicateRatio < 0.5` (at least 50% unique)

**Failure codes:**
- `FRAMES_INSUFFICIENT`: < 30 frames
- `FRAMES_BLURRY`: avgBlurScore < 100
- `FRAMES_DUPLICATES`: duplicateRatio > 0.5

---

### Stage 2: Reconstruction (COLMAP)
**Validation:**
- `numRegisteredCameras >= frames.length * 0.5` (at least 50% cameras registered)
- `numPoints >= 1000` (minimum point cloud density)
- `meanReprojError < 2.0` (pixels)

**Failure codes:**
- `RECON_FEW_CAMERAS`: < 50% cameras registered
- `RECON_SPARSE`: < 1000 points
- `RECON_HIGH_ERROR`: reprojection error > 2.0

---

### Stage 3: Alignment
**Validation:**
- `numDominantPlanes >= 2` (need at least floor + one wall)
- `axisConfidence > 0.5`
- `scaleConfidence > 0.5` OR user provided calibration

**Failure codes:**
- `ALIGN_NO_PLANES`: couldn't detect axis-aligned planes
- `ALIGN_LOW_CONFIDENCE`: alignment uncertain
- `ALIGN_SCALE_UNKNOWN`: couldn't determine block size

---

### Stage 4: Voxelization
**Validation:**
- `occupiedVoxels >= 10` (minimum structure size)
- `occupiedRatio > 0.01` (at least 1% of bounding box occupied)
- `boundingBox` dimensions are reasonable (< 256 per axis)

**Failure codes:**
- `VOXEL_EMPTY`: no occupied voxels
- `VOXEL_TOO_SPARSE`: occupiedRatio < 0.01
- `VOXEL_TOO_LARGE`: exceeds 256^3

---

### Stage 5: Export
**Validation:**
- File written successfully
- File size > 0
- Can be parsed back (round-trip test)

**Failure codes:**
- `EXPORT_WRITE_FAILED`: couldn't write file
- `EXPORT_INVALID`: file doesn't parse

---

## User Calibration (Optional, Huge Reliability Win)

If user provides calibration, alignment becomes much more reliable:

### Option A: Estimated Width
```
"Approximately how many blocks wide is this build?"
[ 10 ] blocks
```
Used to: Constrain scale estimation

### Option B: Reference Block
```
"What block is the main wall made of?"
[v] Stone
[ ] Oak Planks
[ ] Cobblestone
[ ] Other: _____
```
Used to: Color matching baseline

### Option C: Known Dimension
```
"Is there a flat floor visible?"
[v] Yes → Use floor plane for Y=0
[ ] No → Estimate ground level
```
Used to: Fix vertical alignment

---

## Run Controller Rules Summary

| Rule | Constraint | Enforcement |
|------|------------|-------------|
| Single active run | Only 1 run at a time | New run cancels previous |
| Frame budget | maxFrames: 150 | Extraction stops at limit |
| Time budget | maxRuntimeMs: 15min | Checked before each stage |
| AI budget | maxAiCalls: 0 (MVP) | AI disabled entirely |
| No implicit retry | Stages don't auto-retry | Only user "Retry" button |
| Circuit breaker | 2 failures = stop | Per-stage failure counter |
| Idempotent cache | Stage outputs cached | Skip if cache exists |
| Cancellation | Always possible | AbortController signal |

---

## 30-Day Timeline (Refined)

### Week 1: Foundation (Days 1-7)
- Day 1-2: Frame extraction + blur/duplicate filtering
- Day 3-4: COLMAP wrapper (single working command)
- Day 5: Test with 3 videos (accept/reject with reason)
- Day 6-7: Run controller + stage caching + cancellation

**Deliverable:** Run button that progresses or stops with reason.

### Week 2: Geometry (Days 8-14)
- Day 8-9: Point cloud loader + basic viewer
- Day 10-11: Plane detection + axis alignment (RANSAC)
- Day 12-13: Scale estimation + user calibration input
- Day 14: Voxel occupancy grid (NO block types)

**Deliverable:** Voxel grid JSON file, aligned to axes.

### Week 3: Export (Days 15-21)
- Day 15-16: .mcstructure writer with **placeholder blocks only**
- Day 17: Chunking (split large structures)
- Day 18: End-to-end test (video → imports in Bedrock)
- Day 19-21: Basic palette matching (stone/wood/glass only)

**Deliverable:** Video → .mcstructure that loads in Bedrock.

### Week 4: Polish (Days 22-30)
- Day 22-23: Stage progress UI
- Day 24-25: Failure explainer (reason codes)
- Day 26-27: Confidence visualization
- Day 28-29: Basic correction tools (crop, rotate)
- Day 30: Demo + documentation

**Deliverable:** Shippable MVP with error handling.

---

## Risk Mitigation

### Risk 1: Scale Estimation Fails
**Mitigation:** User calibration input (width in blocks)
**Fallback:** Default to 1 unit = 1 block, let user adjust

### Risk 2: COLMAP Doesn't Work on Windows
**Mitigation:** Pre-test COLMAP installation on Day 3
**Fallback:** Provide Docker container with COLMAP

### Risk 3: Alignment Confidence Too Low
**Mitigation:** Show confidence score, let user proceed anyway
**Fallback:** Export with warning, user can rotate/scale manually

### Risk 4: Export File Doesn't Load
**Mitigation:** Test every export in Bedrock immediately
**Fallback:** Export as JSON, provide manual converter
