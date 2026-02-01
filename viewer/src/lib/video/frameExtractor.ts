// Simple frame extraction using HTML5 video element and canvas

export interface ExtractedFrame {
  index: number;
  timestamp: number;
  dataUrl: string; // Base64 data URL
  base64: string; // Just the base64 part (no data:image/png;base64, prefix)
}

export async function extractFramesFromVideo(
  videoFile: File,
  options: {
    fps?: number; // Frames per second to extract (default: 1)
    maxFrames?: number; // Maximum frames to extract (default: 30)
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ExtractedFrame[]> {
  const { fps = 1, maxFrames = 30, onProgress } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not create canvas context'));
      return;
    }

    video.muted = true;
    video.playsInline = true;

    const frames: ExtractedFrame[] = [];
    let duration = 0;
    let currentTime = 0;
    let frameIndex = 0;

    video.onloadedmetadata = () => {
      duration = video.duration;
      canvas.width = Math.min(video.videoWidth, 1280); // Cap at 1280px wide
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));

      // Calculate frame interval
      const frameInterval = 1 / fps;
      const totalPossibleFrames = Math.floor(duration / frameInterval);
      const totalFrames = Math.min(totalPossibleFrames, maxFrames);

      // If we need to skip frames to stay under maxFrames
      const skipInterval = totalPossibleFrames > maxFrames
        ? duration / maxFrames
        : frameInterval;

      const captureFrame = () => {
        if (frameIndex >= totalFrames || currentTime > duration) {
          // Done
          URL.revokeObjectURL(video.src);
          resolve(frames);
          return;
        }

        video.currentTime = currentTime;
      };

      video.onseeked = () => {
        // Draw frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];

        frames.push({
          index: frameIndex,
          timestamp: currentTime,
          dataUrl,
          base64,
        });

        frameIndex++;
        currentTime += skipInterval;
        onProgress?.(frameIndex, totalFrames);

        // Schedule next frame
        requestAnimationFrame(captureFrame);
      };

      // Start capture
      captureFrame();
    };

    video.onerror = () => {
      reject(new Error('Failed to load video'));
    };

    // Load video
    video.src = URL.createObjectURL(videoFile);
    video.load();
  });
}

// Extract a single frame at a specific timestamp
export async function extractSingleFrame(
  videoFile: File,
  timestamp: number
): Promise<ExtractedFrame> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not create canvas context'));
      return;
    }

    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      canvas.width = Math.min(video.videoWidth, 1280);
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
      video.currentTime = Math.min(timestamp, video.duration);
    };

    video.onseeked = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];

      URL.revokeObjectURL(video.src);

      resolve({
        index: 0,
        timestamp,
        dataUrl,
        base64,
      });
    };

    video.onerror = () => {
      reject(new Error('Failed to load video'));
    };

    video.src = URL.createObjectURL(videoFile);
    video.load();
  });
}
