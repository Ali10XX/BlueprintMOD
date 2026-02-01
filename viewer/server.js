import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import YTDlpWrap from 'yt-dlp-wrap';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// Global error handlers to prevent server crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - keep server running
});

app.use(cors());
app.use(express.json());

// Directory for downloaded videos
const DOWNLOADS_DIR = join(__dirname, 'downloads');
if (!existsSync(DOWNLOADS_DIR)) {
  mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// yt-dlp binary path
const ytDlpPath = join(__dirname, 'yt-dlp.exe');
let ytDlpWrap = null;

// Download yt-dlp binary if not present
async function ensureYtDlp() {
  if (!existsSync(ytDlpPath)) {
    console.log('Downloading yt-dlp binary...');
    try {
      // Try the static method first
      await YTDlpWrap.downloadFromGithub(ytDlpPath);
    } catch (e) {
      // If that doesn't work, try the default export
      const YTDlp = YTDlpWrap.default || YTDlpWrap;
      if (YTDlp.downloadFromGithub) {
        await YTDlp.downloadFromGithub(ytDlpPath);
      } else {
        // Manual download
        console.log('Auto-download failed. Please download yt-dlp manually:');
        console.log('  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
        console.log(`  Save to: ${ytDlpPath}`);
        throw new Error('yt-dlp binary not found and auto-download failed');
      }
    }
    console.log('yt-dlp downloaded successfully');
  }

  const YTDlp = YTDlpWrap.default || YTDlpWrap;
  ytDlpWrap = new YTDlp(ytDlpPath);
}

// Common yt-dlp arguments - keep it simple, defaults work best with latest yt-dlp
const YT_DLP_COMMON_ARGS = [
  '--no-warnings',  // Suppress warnings in output
  '--socket-timeout', '30',  // Timeout for network operations
];

// Helper function to execute yt-dlp commands
async function execYtDlp(args) {
  try {
    return await ytDlpWrap.execPromise([...args, ...YT_DLP_COMMON_ARGS]);
  } catch (error) {
    console.error('yt-dlp error:', error.message);
    throw error;
  }
}

// Get video info
app.get('/api/video-info', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    await ensureYtDlp();

    // Use execPromise with custom args for better compatibility
    const result = await execYtDlp([
      url,
      '--dump-json',
      '--no-download',
    ]);
    
    const info = JSON.parse(result);

    res.json({
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      uploader: info.uploader,
    });
  } catch (error) {
    console.error('Error getting video info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download video
app.post('/api/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    await ensureYtDlp();

    // Generate unique filename
    const filename = `video_${Date.now()}.mp4`;
    const outputPath = join(DOWNLOADS_DIR, filename);

    console.log(`Downloading: ${url}`);

    // Download with yt-dlp - use format that doesn't need ffmpeg merge
    await execYtDlp([
      url,
      '-f', 'best[height<=720][ext=mp4]/best[ext=mp4]/best',
      '-o', outputPath,
      '--no-playlist',
    ]);

    console.log(`Downloaded to: ${outputPath}`);

    res.json({
      success: true,
      filename,
      path: `/api/video/${filename}`,
    });
  } catch (error) {
    console.error('Error downloading video:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve downloaded video
app.get('/api/video/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = join(DOWNLOADS_DIR, filename);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  res.sendFile(filePath);
});

// Clean up old videos (optional endpoint)
app.delete('/api/video/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = join(DOWNLOADS_DIR, filename);

  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }

  res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Checking yt-dlp...');
  try {
    await ensureYtDlp();
    console.log('Ready to download videos!');
  } catch (error) {
    console.error('Warning:', error.message);
    console.log('Server started but yt-dlp may not work until binary is installed.');
  }
});
