const express = require('express');
const cors = require('cors');
const AnikotoStreamEngine = require('./stream-engine');

const app = express();
const streamEngine = new AnikotoStreamEngine();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cacheStats: streamEngine.getCacheStats(),
  });
});

// API v1 endpoints - matching what the Android app expects

/**
 * GET /api/v1/anikoto/stream
 * Query params: animeId, episode, server, audio, quality
 * Returns stream URL and metadata
 */
app.get('/api/v1/anikoto/stream', async (req, res) => {
  try {
    const { animeId, episode = 1, server = 'koto', audio = 'sub', quality = '1080p' } = req.query;

    if (!animeId) {
      return res.status(400).json({
        success: false,
        error: 'animeId is required',
      });
    }

    console.log(`[AnikotoStream] Resolving: ID=${animeId}, EP=${episode}`);

    // Since anikoto API works by title, we'd need to reverse-lookup
    // For now, simulate the stream resolution
    const streamResult = await streamEngine.getEpisodeStream(animeId, parseInt(episode));

    if (streamResult.m3u8) {
      return res.json({
        success: true,
        server: server,
        streamUrl: streamResult.m3u8,
        quality: quality,
        latencyMs: Math.random() * 20 + 20,
        serverNode: `ANIKOTO-${server.toUpperCase()}-${Math.floor(Math.random() * 999)}`,
        subtitles: [
          { lang: 'English', url: '' },
          { lang: 'Japanese', url: '' },
        ],
        audioTrack: audio,
        timestamp: streamResult.timestamp,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'Stream not found',
        details: streamResult.data,
        timestamp: streamResult.timestamp,
      });
    }
  } catch (error) {
    console.error('[AnikotoStream] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/anikoto/captions
 * Query params: animeId, episode
 * Returns available subtitle tracks
 */
app.get('/api/v1/anikoto/captions', async (req, res) => {
  try {
    const { animeId, episode = 1 } = req.query;

    const captions = [
      { lang: 'English', url: 'https://example.com/subs/en.vtt' },
      { lang: '日本語 (Japanese)', url: 'https://example.com/subs/ja.vtt' },
      { lang: 'Español', url: 'https://example.com/subs/es.vtt' },
      { lang: 'Français', url: 'https://example.com/subs/fr.vtt' },
      { lang: 'Deutsch', url: 'https://example.com/subs/de.vtt' },
    ];

    return res.json(captions);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/anikoto/episodes
 * Query params: animeId
 * Returns episode list
 */
app.get('/api/v1/anikoto/episodes', async (req, res) => {
  try {
    const { animeId } = req.query;

    // Mock response - in real scenario would fetch from anikoto
    const episodes = Array.from({ length: 12 }, (_, i) => ({
      episodeNumber: i + 1,
      title: `Episode ${i + 1}`,
      sources: [
        {
          server: 'koto',
          url: `https://anikoto-zeta.vercel.app/api/anime/${animeId}/episode/${i + 1}`,
          quality: '1080p',
          isHls: true,
        },
      ],
    }));

    return res.json(episodes);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/stream/resolve
 * Body: { animeTitle, episodeNumber }
 * Resolves m3u8 stream URL using human-like browsing
 */
app.post('/api/v1/stream/resolve', async (req, res) => {
  try {
    const { animeTitle, episodeNumber = 1 } = req.body;

    if (!animeTitle) {
      return res.status(400).json({
        success: false,
        error: 'animeTitle is required',
      });
    }

    console.log(`[StreamResolve] ${animeTitle} EP${episodeNumber}`);

    const result = await streamEngine.resolveStream(animeTitle, episodeNumber);

    return res.json(result);
  } catch (error) {
    console.error('[StreamResolve] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/anime/search
 * Body: { query }
 * Searches for anime with human-like behavior
 */
app.post('/api/v1/anime/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'query is required',
      });
    }

    const results = await streamEngine.searchAnime(query);

    return res.json({
      success: !!results,
      query,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/anime/:id
 * Gets anime details
 */
app.get('/api/v1/anime/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const details = await streamEngine.getAnimeDetails(id);

    if (details) {
      return res.json({
        success: true,
        id,
        details,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: 'Anime not found',
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/cache/clear
 * Clears the cache
 */
app.get('/api/v1/cache/clear', (req, res) => {
  streamEngine.clearCache();
  res.json({
    success: true,
    message: 'Cache cleared',
  });
});

/**
 * GET /api/v1/stats
 * Returns engine statistics
 */
app.get('/api/v1/stats', (req, res) => {
  res.json({
    ...streamEngine.getCacheStats(),
    timestamp: new Date().toISOString(),
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({
    success: false,
    error: err.message,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🦅 ANIKOTO STREAM API SERVER        ║
║   Serving m3u8 streams with            ║
║   human-like browsing behavior         ║
╚════════════════════════════════════════╝

Server running on port ${PORT}
Base URL: http://localhost:${PORT}

API Endpoints:
  GET  /health                          - Health check
  POST /api/v1/stream/resolve            - Resolve m3u8 stream
  POST /api/v1/anime/search              - Search anime
  GET  /api/v1/anikoto/stream            - Get anikoto stream
  GET  /api/v1/anikoto/captions          - Get subtitles
  GET  /api/v1/anikoto/episodes          - Get episodes
  GET  /api/v1/anime/:id                 - Get anime details
  GET  /api/v1/stats                     - View cache stats
  GET  /api/v1/cache/clear               - Clear cache
`);
});

module.exports = app;
