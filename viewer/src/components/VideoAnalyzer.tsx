import { useState, useCallback, useEffect } from 'react';
import { useBlueprintStore } from '../store/blueprintStore';
import { useProjectHistoryStore } from '../store/projectHistoryStore';
import { extractFramesFromVideo, type ExtractedFrame } from '../lib/video/frameExtractor';
import { initGemini, isGeminiInitialized, analyzeFullVideo, quickAnalyze, setRateLimiterCallback, setLogCallback, getRateLimiterStats, resetRateLimiter, getRequestLog, clearRequestLog, type RequestLogEntry, type DetectionDebug } from '../lib/ai/geminiDetector';
import type { Block } from '../types';

type AnalysisStage = 'idle' | 'api-key' | 'uploading' | 'downloading' | 'extracting' | 'analyzing' | 'reviewing' | 'done';
type InputMode = 'video' | 'image';

const API_BASE = 'http://localhost:3001';

export function VideoAnalyzer() {
  const [stage, setStage] = useState<AnalysisStage>('idle');
  const [inputMode, setInputMode] = useState<InputMode>('video');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [_videoFile, setVideoFile] = useState<File | null>(null);
  const [videoName, setVideoName] = useState('');
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [detectedBlocks, setDetectedBlocks] = useState<Block[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = useState<ExtractedFrame | null>(null);
  const [downloadStatus, setDownloadStatus] = useState('');
  // Rate limiter status message for user feedback
  const [rateLimitStatus, setRateLimitStatus] = useState<string | null>(null);
  // Request log for debugging
  const [requestLog, setRequestLog] = useState<RequestLogEntry[]>([]);
  const [showRequestLog, setShowRequestLog] = useState(false);
  // Image upload state
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  // Debug info from last detection
  const [debugInfo, setDebugInfo] = useState<DetectionDebug | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const { setBlocks, blocks } = useBlueprintStore();
  const { saveProject } = useProjectHistoryStore();

  // Set up rate limiter callback to display status to user
  useEffect(() => {
    setRateLimiterCallback((message: string, _waitTime?: number) => {
      setRateLimitStatus(message);
      // Clear status after the wait time + 1 second, or after 5 seconds minimum
      const clearDelay = _waitTime ? (_waitTime * 1000) + 1000 : 5000;
      setTimeout(() => setRateLimitStatus(null), clearDelay);
    });

    // Set up log callback to update request log
    setLogCallback((log: RequestLogEntry[]) => {
      setRequestLog(log);
    });

    // Load initial log
    setRequestLog(getRequestLog());

    // Cleanup callbacks on unmount
    return () => {
      setRateLimiterCallback(null);
      setLogCallback(null);
    };
  }, []);

  const handleStart = () => {
    if (apiKey.trim()) {
      initGemini(apiKey.trim());
      localStorage.setItem('gemini_api_key', apiKey.trim());
      setStage('uploading');
    } else {
      setStage('api-key');
    }
  };

  const handleApiKeySubmit = () => {
    if (!apiKey.trim()) {
      setError('Please enter your Gemini API key');
      return;
    }
    initGemini(apiKey.trim());
    localStorage.setItem('gemini_api_key', apiKey.trim());
    setError(null);
    setStage('uploading');
  };

  const handleYoutubeDownload = async () => {
    if (!youtubeUrl.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setError(null);
    setStage('downloading');
    setDownloadStatus('Connecting to server...');

    try {
      // Check if server is running
      const healthCheck = await fetch(`${API_BASE}/api/health`).catch(() => null);
      if (!healthCheck?.ok) {
        throw new Error('Download server not running. Start it with: node server.js');
      }

      setDownloadStatus('Getting video info...');

      // Get video info first
      const infoRes = await fetch(`${API_BASE}/api/video-info?url=${encodeURIComponent(youtubeUrl)}`);
      if (!infoRes.ok) {
        const err = await infoRes.json();
        throw new Error(err.error || 'Failed to get video info');
      }
      const info = await infoRes.json();
      setVideoName(info.title || 'YouTube Video');
      setDownloadStatus(`Downloading: ${info.title}...`);

      // Download the video
      const downloadRes = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
      });

      if (!downloadRes.ok) {
        const err = await downloadRes.json();
        throw new Error(err.error || 'Download failed');
      }

      const { path } = await downloadRes.json();
      setDownloadStatus('Fetching video file...');

      // Fetch the video as a blob
      const videoRes = await fetch(`${API_BASE}${path}`);
      const videoBlob = await videoRes.blob();
      const videoFile = new File([videoBlob], `${info.title || 'video'}.mp4`, { type: 'video/mp4' });

      // Process the video
      await handleVideoSelect(videoFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setStage('uploading');
    }
  };

  const handleVideoSelect = useCallback(async (file: File) => {
    setVideoFile(file);
    setVideoName(file.name.replace(/\.[^/.]+$/, ''));
    setError(null);
    setStage('extracting');
    setProgress({ current: 0, total: 0 });

    try {
      const extractedFrames = await extractFramesFromVideo(file, {
        fps: 0.5, // 1 frame every 2 seconds
        maxFrames: 20,
        onProgress: (current, total) => {
          setProgress({ current, total });
        },
      });

      setFrames(extractedFrames);
      if (extractedFrames.length > 0) {
        setPreviewFrame(extractedFrames[0]);
      }
      setStage('reviewing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract frames');
      setStage('uploading');
    }
  }, []);

  /**
   * Handles image file selection (single or multiple)
   * Converts images to ExtractedFrame format for unified processing
   */
  const handleImageSelect = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      setError('No valid image files selected');
      return;
    }

    setUploadedImages(imageFiles);
    setVideoName(imageFiles.length === 1 
      ? imageFiles[0].name.replace(/\.[^/.]+$/, '')
      : `${imageFiles.length} images`
    );
    setError(null);
    setStage('extracting');
    setProgress({ current: 0, total: imageFiles.length });

    try {
      const extractedFrames: ExtractedFrame[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        setProgress({ current: i + 1, total: imageFiles.length });

        // Convert image to base64
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Extract base64 data (remove data:image/...;base64, prefix)
        const base64 = dataUrl.split(',')[1];

        extractedFrames.push({
          index: i,
          timestamp: i, // Use index as pseudo-timestamp
          dataUrl,
          base64,
        });
      }

      setFrames(extractedFrames);
      if (extractedFrames.length > 0) {
        setPreviewFrame(extractedFrames[0]);
      }
      setStage('reviewing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process images');
      setStage('uploading');
    }
  }, []);

  const handleAnalyze = async () => {
    if (!isGeminiInitialized()) {
      setError('Gemini API not initialized');
      return;
    }

    setStage('analyzing');
    setProgress({ current: 0, total: frames.length });
    setError(null);

    try {
      const blocks = await analyzeFullVideo(
        frames.map(f => f.base64),
        (current, total, currentBlocks, frameResult) => {
          // ALWAYS update progress - frame advances regardless of success/failure
          setProgress({ current, total });
          setDetectedBlocks([...currentBlocks]);
          
          // Log frame result for debugging
          if (frameResult) {
            console.log(`[VideoAnalyzer] Frame ${current}/${total}: ${frameResult.success ? 'SUCCESS' : 'FAILED'} - ${frameResult.blocks.length} blocks in ${frameResult.durationMs}ms`);
            if (frameResult.error) {
              console.warn(`[VideoAnalyzer] Frame ${current} error: ${frameResult.error}`);
            }
          }
        }
      );

      setDetectedBlocks(blocks);

      if (blocks.length > 0) {
        const maxX = Math.max(...blocks.map(b => b.x)) + 1;
        const maxY = Math.max(...blocks.map(b => b.y)) + 1;
        const maxZ = Math.max(...blocks.map(b => b.z)) + 1;
        const size = { x: maxX, y: maxY, z: maxZ };
        const projectName = videoName || 'Video Build';

        setBlocks(blocks, size, projectName);

        // Save project to history
        saveProject({
          name: projectName,
          source: inputMode,
          sourceDetails: inputMode === 'video' ? (youtubeUrl || videoName) : `${frames.length} images`,
          thumbnail: previewFrame?.dataUrl?.substring(0, 5000), // Limit thumbnail size
          blockCount: blocks.length,
          size,
          blocks,
        });
      }

      setStage('done');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Analysis failed';
      
      // Check for daily quota - show specific message
      if (errorMsg.includes('Daily API quota') || errorMsg.includes('daily quota')) {
        setError('🚫 Daily quota exhausted! Analysis stopped. Use the blocks detected so far or wait until tomorrow.');
      } else {
        setError(errorMsg);
      }
      
      // If we have some blocks, save partial results and show done stage
      if (detectedBlocks.length > 0) {
        const maxX = Math.max(...detectedBlocks.map(b => b.x)) + 1;
        const maxY = Math.max(...detectedBlocks.map(b => b.y)) + 1;
        const maxZ = Math.max(...detectedBlocks.map(b => b.z)) + 1;
        const size = { x: maxX, y: maxY, z: maxZ };
        const projectName = videoName || 'Partial Build';

        // Save partial project
        saveProject({
          name: `${projectName} (partial)`,
          source: inputMode,
          sourceDetails: inputMode === 'video' ? (youtubeUrl || videoName) : `${frames.length} images`,
          thumbnail: previewFrame?.dataUrl?.substring(0, 5000),
          blockCount: detectedBlocks.length,
          size,
          blocks: detectedBlocks,
          notes: `Partial analysis - ${errorMsg}`,
        });

        setStage('done');
      } else {
        setStage('reviewing');
      }
    }
  };

  const handleQuickTest = async () => {
    if (!previewFrame || !isGeminiInitialized()) return;

    setError(null);
    setDebugInfo(null);
    
    // Show rate limiter stats before request
    const stats = getRateLimiterStats();
    if (stats.waitTimeMs > 0) {
      setRateLimitStatus(`Waiting ${Math.ceil(stats.waitTimeMs / 1000)}s for rate limit...`);
    } else if (stats.requestsInLastMinute > 0) {
      setRateLimitStatus(`Analyzing... (${stats.requestsInLastMinute}/${stats.maxRequestsPerMinute} requests used)`);
    } else {
      setRateLimitStatus('Analyzing frame...');
    }
    
    try {
      const result = await quickAnalyze(previewFrame.base64);
      setDetectedBlocks(result.blocks);
      setRateLimitStatus(null);
      
      // Store debug info for display
      setDebugInfo(result.debug);

      if (result.blocks.length > 0) {
        const maxX = Math.max(...result.blocks.map(b => b.x)) + 1;
        const maxY = Math.max(...result.blocks.map(b => b.y)) + 1;
        const maxZ = Math.max(...result.blocks.map(b => b.z)) + 1;
        setBlocks(result.blocks, { x: maxX, y: maxY, z: maxZ }, 'Quick Test');
      } else {
        // Show debug info when no blocks detected
        const debugMsg = result.debug.reasonIfZeroBlocks || result.debug.imageSummary;
        setError(`No blocks detected: ${debugMsg}`);
      }
    } catch (err) {
      setRateLimitStatus(null);
      const errorMsg = err instanceof Error ? err.message : 'Quick test failed';
      
      if (errorMsg.includes('Daily API quota') || errorMsg.includes('daily quota')) {
        setError('🚫 Daily quota exhausted! Please wait until tomorrow or use a different API key.');
      } else if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('rate')) {
        setError('Rate limit exceeded. Please wait a minute before trying again.');
      } else {
        setError(errorMsg);
      }
    }
  };

  const reset = () => {
    setStage('idle');
    setInputMode('video');
    setVideoFile(null);
    setVideoName('');
    setYoutubeUrl('');
    setFrames([]);
    setDetectedBlocks([]);
    setPreviewFrame(null);
    setError(null);
    setDownloadStatus('');
    setRateLimitStatus(null);
    setUploadedImages([]);
    setDebugInfo(null);
    setShowDebugPanel(false);
    // Reset rate limiter state to clear any stale backoff
    resetRateLimiter();
  };

  // Don't show if we already have blocks loaded
  if (blocks.length > 0 && stage === 'idle') {
    return null;
  }

  return (
    <div className="absolute top-4 left-4 z-20">
      {/* Initial button */}
      {stage === 'idle' && blocks.length === 0 && (
        <div className="bg-slate-800/90 backdrop-blur rounded-xl p-6 text-white shadow-xl max-w-sm">
          <h2 className="text-xl font-bold text-green-400 mb-2">Blueprint Viewer</h2>
          <p className="text-gray-400 text-sm mb-4">
            Create blueprints from Minecraft videos or import existing files.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleStart}
              className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Analyze Video (AI)
            </button>
          </div>
          <p className="text-gray-500 text-xs mt-3">
            Or drop a .mcstructure / .json file anywhere
          </p>
        </div>
      )}

      {/* API Key input */}
      {stage === 'api-key' && (
        <div className="bg-slate-800/90 backdrop-blur rounded-xl p-6 text-white shadow-xl max-w-sm">
          <h3 className="text-lg font-bold text-green-400 mb-3">Gemini API Key</h3>
          <p className="text-gray-400 text-sm mb-3">
            Enter your Google Gemini API key. Get one free at{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              aistudio.google.com
            </a>
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full bg-slate-700 rounded-lg px-3 py-2 mb-3 text-white placeholder-gray-500"
          />
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleApiKeySubmit}
              className="bg-green-500 hover:bg-green-600 text-black font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Continue
            </button>
            <button
              onClick={reset}
              className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Video/Image upload */}
      {stage === 'uploading' && (
        <div className="bg-slate-800/90 backdrop-blur rounded-xl p-6 text-white shadow-xl max-w-md">
          <h3 className="text-lg font-bold text-green-400 mb-3">Choose Input Source</h3>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setInputMode('video')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                inputMode === 'video'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              📹 Video
            </button>
            <button
              onClick={() => setInputMode('image')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                inputMode === 'image'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
            >
              🖼️ Images
            </button>
          </div>

          {inputMode === 'video' ? (
            <>
              {/* YouTube URL input */}
              <div className="mb-4">
                <label className="text-sm text-gray-400 block mb-2">YouTube URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="flex-1 bg-slate-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm"
                  />
                  <button
                    onClick={handleYoutubeDownload}
                    disabled={!youtubeUrl.trim()}
                    className="bg-red-500 hover:bg-red-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    Download
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Requires server running: <code className="bg-slate-700 px-1 rounded">node server.js</code>
                </p>
              </div>

              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-slate-600"></div>
                <span className="text-gray-500 text-sm">or</span>
                <div className="flex-1 h-px bg-slate-600"></div>
              </div>

              {/* Local video upload */}
              <label className="block">
                <span className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg cursor-pointer inline-block transition-colors">
                  Upload Local Video
                </span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => e.target.files?.[0] && handleVideoSelect(e.target.files[0])}
                  className="hidden"
                />
              </label>
            </>
          ) : (
            <>
              {/* Image upload section */}
              <div className="mb-4">
                <p className="text-sm text-gray-400 mb-3">
                  Upload one or more images of your Minecraft build. For best results, include
                  multiple angles of the structure.
                </p>

                {/* Single image */}
                <label className="block mb-3">
                  <span className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg cursor-pointer inline-block transition-colors">
                    Upload Single Image
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files && handleImageSelect(e.target.files)}
                    className="hidden"
                  />
                </label>

                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-slate-600"></div>
                  <span className="text-gray-500 text-sm">or</span>
                  <div className="flex-1 h-px bg-slate-600"></div>
                </div>

                {/* Multiple images */}
                <label className="block">
                  <span className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded-lg cursor-pointer inline-block transition-colors">
                    Upload Multiple Images
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => e.target.files && handleImageSelect(e.target.files)}
                    className="hidden"
                  />
                </label>

                <p className="text-xs text-gray-500 mt-3">
                  Tip: Screenshots from different angles will produce more accurate blueprints
                </p>
              </div>

              {/* Preview uploaded images */}
              {uploadedImages.length > 0 && (
                <div className="mt-4 p-3 bg-slate-700 rounded-lg">
                  <p className="text-sm text-gray-400 mb-2">
                    {uploadedImages.length} image{uploadedImages.length !== 1 ? 's' : ''} selected
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {uploadedImages.slice(0, 5).map((file, i) => (
                      <div key={i} className="flex-shrink-0 w-12 h-12 bg-slate-600 rounded overflow-hidden">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Preview ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {uploadedImages.length > 5 && (
                      <div className="flex-shrink-0 w-12 h-12 bg-slate-600 rounded flex items-center justify-center text-gray-400 text-xs">
                        +{uploadedImages.length - 5}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}

          <button
            onClick={reset}
            className="mt-4 text-gray-400 hover:text-white text-sm block"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Downloading from YouTube */}
      {stage === 'downloading' && (
        <div className="bg-slate-800/90 backdrop-blur rounded-xl p-6 text-white shadow-xl max-w-sm">
          <h3 className="text-lg font-bold text-green-400 mb-3">Downloading Video</h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-400 text-sm">{downloadStatus}</p>
          </div>
          <button
            onClick={reset}
            className="text-gray-400 hover:text-white text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Extracting frames */}
      {stage === 'extracting' && (
        <div className="bg-slate-800/90 backdrop-blur rounded-xl p-6 text-white shadow-xl max-w-sm">
          <h3 className="text-lg font-bold text-green-400 mb-3">Extracting Frames</h3>
          <div className="mb-3">
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-gray-400 text-sm mt-2">
              {progress.current} / {progress.total || '?'} frames
            </p>
          </div>
        </div>
      )}

      {/* Review frames before analysis */}
      {stage === 'reviewing' && (
        <div className="bg-slate-800/90 backdrop-blur rounded-xl p-6 text-white shadow-xl max-w-md">
          <h3 className="text-lg font-bold text-green-400 mb-3">
            Ready to Analyze ({frames.length} frames)
          </h3>
          {videoName && (
            <p className="text-gray-400 text-sm mb-2">{videoName}</p>
          )}

          {/* Frame preview */}
          {previewFrame && (
            <div className="mb-4">
              <img
                src={previewFrame.dataUrl}
                alt="Preview"
                className="w-full rounded-lg border border-slate-600"
              />
              <div className="flex gap-1 mt-2 overflow-x-auto pb-2">
                {frames.map((frame, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewFrame(frame)}
                    className={`flex-shrink-0 w-12 h-8 rounded overflow-hidden border-2 transition-colors ${
                      previewFrame.index === frame.index ? 'border-green-400' : 'border-transparent'
                    }`}
                  >
                    <img src={frame.dataUrl} alt={`Frame ${i}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-3">
              <p className="text-red-400 text-sm">{error}</p>
              {/* Show change API key button when there's a quota error */}
              {(error.includes('quota') || error.includes('Daily')) && (
                <button
                  onClick={() => {
                    localStorage.removeItem('gemini_api_key');
                    setApiKey('');
                    setStage('api-key');
                    setError(null);
                  }}
                  className="mt-2 text-blue-400 hover:text-blue-300 text-sm underline"
                >
                  → Use a different API key
                </button>
              )}
            </div>
          )}

          {/* Rate limit status during quick test */}
          {rateLimitStatus && (
            <div className="mb-3 p-2 bg-yellow-900/50 border border-yellow-600/50 rounded-lg">
              <p className="text-yellow-400 text-xs flex items-center gap-2">
                <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                {rateLimitStatus}
              </p>
            </div>
          )}

          {/* Detection Result */}
          {detectedBlocks.length > 0 ? (
            <div className="mb-3 p-3 bg-green-900/30 border border-green-700/50 rounded-lg">
              <p className="text-green-400 font-medium flex items-center gap-2">
                <span className="text-lg">✓</span>
                Detected {detectedBlocks.length} blocks
              </p>
            </div>
          ) : debugInfo && (
            /* Zero Blocks Detected - Show Debug Info Prominently */
            <div className="mb-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">⚠️</span>
                <span className="text-red-400 font-medium">Zero Blocks Detected</span>
                <span className={`ml-auto px-2 py-0.5 rounded text-xs ${
                  debugInfo.confidence === 'high' ? 'bg-green-900 text-green-400' :
                  debugInfo.confidence === 'medium' ? 'bg-yellow-900 text-yellow-400' :
                  debugInfo.confidence === 'low' ? 'bg-orange-900 text-orange-400' :
                  'bg-red-900 text-red-400'
                }`}>
                  {debugInfo.confidence} confidence
                </span>
              </div>

              {/* Reason for Zero Blocks - Always visible when present */}
              {debugInfo.reasonIfZeroBlocks && (
                <div className="mb-3 p-2 bg-red-950/50 rounded">
                  <span className="text-red-300 text-xs font-medium">Reason:</span>
                  <p className="text-red-200 text-sm mt-1">{debugInfo.reasonIfZeroBlocks}</p>
                </div>
              )}

              {/* Image Summary - Always visible */}
              <div className="mb-3 p-2 bg-slate-800/50 rounded">
                <span className="text-gray-400 text-xs font-medium">What AI Saw:</span>
                <p className="text-gray-200 text-sm mt-1">{debugInfo.imageSummary}</p>
              </div>

              {/* Grid Assumptions - Always visible when present */}
              {debugInfo.gridAssumptions && (
                <div className="mb-3 p-2 bg-slate-800/50 rounded">
                  <span className="text-gray-400 text-xs font-medium">Grid Analysis:</span>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Grid Size:</span>
                      <span className="text-gray-200 ml-1">
                        {debugInfo.gridAssumptions.estimatedGridWidth}×{debugInfo.gridAssumptions.estimatedGridDepth}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Block Size:</span>
                      <span className="text-gray-200 ml-1">
                        ~{debugInfo.gridAssumptions.estimatedBlockSizePixels}px
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500">View Angle:</span>
                      <span className="text-gray-200 ml-1">{debugInfo.gridAssumptions.viewAngle}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Collapsible Raw Response */}
              <div className="border-t border-slate-700 pt-2 mt-2">
                <button
                  onClick={() => setShowDebugPanel(!showDebugPanel)}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1 w-full"
                >
                  {showDebugPanel ? '▼' : '▶'} Raw Response
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                    debugInfo.parseSuccessful ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                  }`}>
                    {debugInfo.responseFormat} {debugInfo.parseSuccessful ? '✓' : '✗'}
                  </span>
                </button>
                
                {showDebugPanel && (
                  <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-gray-400 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                    {debugInfo.rawResponsePreview.substring(0, 300)}
                    {debugInfo.rawResponsePreview.length > 300 && '...'}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* Debug Info Panel - Show when blocks > 0 but debug available */}
          {debugInfo && detectedBlocks.length > 0 && (
            <div className="mb-3">
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                {showDebugPanel ? '▼' : '▶'} Debug Info
                <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${
                  debugInfo.confidence === 'high' ? 'bg-green-900 text-green-400' :
                  debugInfo.confidence === 'medium' ? 'bg-yellow-900 text-yellow-400' :
                  debugInfo.confidence === 'low' ? 'bg-orange-900 text-orange-400' :
                  'bg-red-900 text-red-400'
                }`}>
                  {debugInfo.confidence}
                </span>
              </button>
              
              {showDebugPanel && (
                <div className="mt-2 p-3 bg-slate-900 rounded-lg text-xs space-y-2">
                  <div>
                    <span className="text-gray-500">Image Summary:</span>
                    <p className="text-gray-300">{debugInfo.imageSummary}</p>
                  </div>
                  
                  {debugInfo.gridAssumptions && (
                    <div>
                      <span className="text-gray-500">Grid Assumptions:</span>
                      <p className="text-gray-300">
                        {debugInfo.gridAssumptions.estimatedGridWidth}×{debugInfo.gridAssumptions.estimatedGridDepth} grid, 
                        ~{debugInfo.gridAssumptions.estimatedBlockSizePixels}px/block, 
                        view: {debugInfo.gridAssumptions.viewAngle}
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <span className="text-gray-500">Response Format:</span>
                    <span className={`ml-2 ${debugInfo.parseSuccessful ? 'text-green-400' : 'text-red-400'}`}>
                      {debugInfo.responseFormat} {debugInfo.parseSuccessful ? '✓' : '✗'}
                    </span>
                  </div>
                  
                  <div>
                    <span className="text-gray-500">Raw Response (first 300 chars):</span>
                    <pre className="mt-1 p-2 bg-slate-800 rounded text-xs text-gray-400 overflow-x-auto max-h-24 overflow-y-auto whitespace-pre-wrap break-all">
                      {debugInfo.rawResponsePreview.substring(0, 300)}
                      {debugInfo.rawResponsePreview.length > 300 && '...'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleAnalyze}
              className="bg-green-500 hover:bg-green-600 text-black font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Analyze All Frames
            </button>
            <button
              onClick={handleQuickTest}
              className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition-colors"
            >
              Quick Test (1 Frame)
            </button>
            <button
              onClick={reset}
              className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-gray-600 text-xs">
              ⏱️ Rate limited to 15 requests/min
            </p>
            <button
              onClick={() => {
                localStorage.removeItem('gemini_api_key');
                setApiKey('');
                setStage('api-key');
                setError(null);
                setRateLimitStatus(null);
                resetRateLimiter();
              }}
              className="text-gray-500 hover:text-gray-300 text-xs underline"
            >
              Change API Key
            </button>
          </div>
        </div>
      )}

      {/* Analyzing */}
      {stage === 'analyzing' && (
        <div className="bg-slate-800/90 backdrop-blur rounded-xl p-6 text-white shadow-xl max-w-sm">
          <h3 className="text-lg font-bold text-green-400 mb-3">Analyzing with AI</h3>
          <div className="mb-3">
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-gray-400 text-sm mt-2">
              Frame {progress.current} / {progress.total}
            </p>
          </div>
          <p className="text-gray-500 text-sm">
            {detectedBlocks.length} blocks detected so far
          </p>
          {/* Rate limit status indicator */}
          {rateLimitStatus && (
            <div className="mt-3 p-2 bg-yellow-900/50 border border-yellow-600/50 rounded-lg">
              <p className="text-yellow-400 text-xs flex items-center gap-2">
                <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                {rateLimitStatus}
              </p>
            </div>
          )}
          <p className="text-gray-600 text-xs mt-3">
            Rate limited to 15 requests/min to avoid API errors
          </p>
        </div>
      )}

      {/* Done */}
      {stage === 'done' && (
        <div className="bg-slate-800/90 backdrop-blur rounded-xl p-6 text-white shadow-xl max-w-sm">
          <h3 className="text-lg font-bold text-green-400 mb-3">Analysis Complete!</h3>
          <p className="text-gray-400 mb-4">
            Detected {detectedBlocks.length} blocks from {frames.length} frames.
          </p>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition-colors"
            >
              Analyze Another
            </button>
          </div>
        </div>
      )}

      {/* Request Log Panel - Always visible when there are requests */}
      {(stage === 'reviewing' || stage === 'analyzing' || stage === 'done') && (
        <div className="mt-4">
          <button
            onClick={() => setShowRequestLog(!showRequestLog)}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
          >
            {showRequestLog ? '▼' : '▶'} API Request Log ({requestLog.length} requests)
            {requestLog.filter(r => r.status === 'error').length > 0 && (
              <span className="text-red-400 ml-1">
                ({requestLog.filter(r => r.status === 'error').length} failed)
              </span>
            )}
          </button>
          
          {showRequestLog && (
            <div className="mt-2 bg-slate-900/95 backdrop-blur rounded-lg p-3 max-w-lg max-h-64 overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-400">
                  {(() => {
                    const stats = getRateLimiterStats();
                    return `${stats.successfulRequests} success, ${stats.failedRequests} failed, ${stats.requestsInLastMinute}/${stats.maxRequestsPerMinute} in last min`;
                  })()}
                </span>
                <button
                  onClick={() => {
                    clearRequestLog();
                    setRequestLog([]);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
              
              {requestLog.length === 0 ? (
                <p className="text-gray-500 text-xs">No requests yet</p>
              ) : (
                <div className="space-y-1">
                  {requestLog.slice().reverse().map((entry) => (
                    <div
                      key={entry.id}
                      className={`text-xs p-2 rounded ${
                        entry.status === 'success' 
                          ? 'bg-green-900/30 border border-green-800/50' 
                          : entry.status === 'error'
                          ? 'bg-red-900/30 border border-red-800/50'
                          : 'bg-yellow-900/30 border border-yellow-800/50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-mono">
                          #{entry.id} 
                          <span className={`ml-2 ${
                            entry.status === 'success' ? 'text-green-400' :
                            entry.status === 'error' ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                            {entry.status === 'success' ? '✓ Success' :
                             entry.status === 'error' ? '✗ Failed' : '⏳ Pending'}
                          </span>
                          {entry.duration && (
                            <span className="text-gray-500 ml-2">({entry.duration}ms)</span>
                          )}
                        </span>
                        <span className="text-gray-500">
                          {entry.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      {entry.errorMessage && (
                        <div className="mt-1 text-red-300 break-words">
                          <span className="text-red-400 font-semibold">
                            [{entry.errorType}]
                          </span>{' '}
                          {entry.errorMessage}
                        </div>
                      )}
                      {entry.attempt > 1 && (
                        <div className="text-yellow-400 mt-1">
                          Attempt {entry.attempt}/{entry.maxAttempts}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
