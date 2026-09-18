const https = require('https');
const http = require('http');

// User agents rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
];

const REFERERS = [
  'https://google.com/',
  'https://www.google.com/search',
  'https://www.bing.com/',
  'https://duckduckgo.com/',
  'https://www.reddit.com/',
  'https://twitter.com/',
  ''
];

class AnikotoStreamEngine {
  constructor() {
    this.baseUrl = 'https://anikoto-zeta.vercel.app/api';
    this.cache = new Map();
    this.requestLog = [];
  }

  randomDelay(min = 500, max = 3000) {
    return new Promise(r => setTimeout(r, Math.random() * (max - min) + min));
  }

  getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  getRandomReferer() {
    return REFERERS[Math.floor(Math.random() * REFERERS.length)];
  }

  buildHeaders(customHeaders = {}) {
    const headers = {
      'User-Agent': this.getRandomUserAgent(),
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
    };

    const referer = this.getRandomReferer();
    if (referer) headers['Referer'] = referer;

    if (Math.random() < 0.3) {
      headers['Sec-CH-UA-Mobile'] = '?1';
      headers['Sec-CH-UA-Platform'] = '"Android"';
    }

    return { ...headers, ...customHeaders };
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    await this.randomDelay(800, 2500);

    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      const urlObj = new URL(url);
      const protocol = url.startsWith('https') ? https : http;

      const headers = this.buildHeaders();
      const requestOptions = { method, headers, timeout: 20000 };

      const req = protocol.request(urlObj, requestOptions, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve({
              status: res.statusCode,
              data: parsed,
              headers: res.headers,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              data: responseData,
              raw: true,
              timestamp: new Date().toISOString(),
            });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // Recursive deep search for m3u8 or stream URLs
  deepSearchForStream(obj, depth = 0, maxDepth = 6) {
    if (depth > maxDepth) return null;

    // String check
    if (typeof obj === 'string') {
      if (obj.includes('.m3u8') || obj.includes('playlist') || 
          (obj.includes('http') && obj.includes('video'))) {
        return obj;
      }
    }

    // Array search
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = this.deepSearchForStream(item, depth + 1, maxDepth);
        if (found) return found;
      }
    }

    // Object search - priority keys
    if (typeof obj === 'object' && obj !== null) {
      const priorityKeys = [
        'url', 'streamUrl', 'stream_url', 'videoUrl', 'video_url',
        'm3u8', 'hls', 'hlsUrl', 'hls_url', 'source', 'sources',
        'link', 'videoLink', 'playUrl', 'play_url', 'src', 'source',
        'video', 'media', 'direct', 'directUrl', 'directlink'
      ];

      // Search priority keys first
      for (const key of priorityKeys) {
        if (key in obj) {
          const found = this.deepSearchForStream(obj[key], depth + 1, maxDepth);
          if (found) return found;
        }
      }

      // Fallback: search all keys
      for (const key of Object.keys(obj)) {
        const found = this.deepSearchForStream(obj[key], depth + 1, maxDepth);
        if (found) return found;
      }
    }

    return null;
  }

  // Search for anime
  async searchAnime(query) {
    const cacheKey = `search:${query}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const endpoints = [
      `/search?q=${encodeURIComponent(query)}`,
      `/anime?search=${encodeURIComponent(query)}`,
      `/search/${encodeURIComponent(query)}`,
      `/anime/search/${encodeURIComponent(query)}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const result = await this.makeRequest(endpoint);
        if (result.status === 200 && result.data) {
          this.requestLog.push({
            type: 'search',
            query,
            endpoint,
            status: result.status,
            timestamp: result.timestamp,
          });

          this.cache.set(cacheKey, result.data);
          return result.data;
        }
      } catch (error) {
        console.error(`Search endpoint ${endpoint} failed:`, error.message);
      }
    }

    return null;
  }

  // Extract anime ID from search results
  extractAnimeId(searchResults) {
    if (!searchResults) return null;

    // Array format
    if (Array.isArray(searchResults)) {
      if (searchResults[0]) {
        return searchResults[0].id || searchResults[0].mal_id || searchResults[0].animeId;
      }
    }

    // Object with results array
    if (searchResults.results && Array.isArray(searchResults.results)) {
      const first = searchResults.results[0];
      return first?.id || first?.mal_id || first?.animeId;
    }

    // Direct object
    if (searchResults.id || searchResults.mal_id || searchResults.animeId) {
      return searchResults.id || searchResults.mal_id || searchResults.animeId;
    }

    // Deep search for ID
    const deepSearch = (obj) => {
      if (typeof obj === 'object' && obj !== null) {
        if (obj.id && typeof obj.id !== 'object') return obj.id;
        if (obj.mal_id && typeof obj.mal_id !== 'object') return obj.mal_id;
        if (obj.animeId && typeof obj.animeId !== 'object') return obj.animeId;

        for (const key of Object.keys(obj)) {
          const result = deepSearch(obj[key]);
          if (result) return result;
        }
      }
      return null;
    };

    return deepSearch(searchResults);
  }

  // Get anime details
  async getAnimeDetails(animeId) {
    const cacheKey = `details:${animeId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const endpoints = [
      `/anime/${animeId}`,
      `/anime/${animeId}/details`,
      `/anime/${animeId}/episodes`,
      `/watch/${animeId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const result = await this.makeRequest(endpoint);
        if (result.status === 200 && result.data) {
          this.requestLog.push({
            type: 'details',
            animeId,
            endpoint,
            status: result.status,
            timestamp: result.timestamp,
          });

          this.cache.set(cacheKey, result.data);
          return result.data;
        }
      } catch (error) {
        console.error(`Details endpoint ${endpoint} failed:`, error.message);
      }
    }

    return null;
  }

  // Get episode stream - the critical function
  async getEpisodeStream(animeId, episodeNum = 1, retries = 3) {
    const cacheKey = `stream:${animeId}:${episodeNum}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached.m3u8) return cached;
    }

    const endpoints = [
      `/anime/${animeId}/episode/${episodeNum}`,
      `/anime/${animeId}/ep/${episodeNum}`,
      `/watch/${animeId}/${episodeNum}`,
      `/stream/${animeId}/${episodeNum}`,
      `/episode/${animeId}/${episodeNum}`,
      `/video/${animeId}/${episodeNum}`,
      `/watch/anime/${animeId}/${episodeNum}`,
      `/anime/${animeId}/episodes/${episodeNum}`,
    ];

    let lastError = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      for (const endpoint of endpoints) {
        try {
          const result = await this.makeRequest(endpoint);

          if (result.status === 200 && result.data) {
            // Extract m3u8
            const m3u8 = this.deepSearchForStream(result.data);

            this.requestLog.push({
              type: 'stream',
              animeId,
              episodeNum,
              endpoint,
              status: result.status,
              found: !!m3u8,
              timestamp: result.timestamp,
            });

            if (m3u8) {
              const cacheData = {
                m3u8,
                endpoint,
                data: result.data,
                timestamp: result.timestamp,
              };
              this.cache.set(cacheKey, cacheData);
              return cacheData;
            }

            // If data but no m3u8, still return data for inspection
            return {
              m3u8: null,
              endpoint,
              data: result.data,
              timestamp: result.timestamp,
              message: 'Got response but no m3u8 found',
            };
          }
        } catch (error) {
          lastError = error;
          console.error(`Stream endpoint ${endpoint} attempt ${attempt + 1} failed:`, error.message);
        }
      }

      if (attempt < retries - 1) {
        await this.randomDelay(2000, 5000);
      }
    }

    return {
      m3u8: null,
      error: lastError?.message || 'All stream endpoints failed',
      timestamp: new Date().toISOString(),
    };
  }

  // Full flow: search → get ID → get episodes → get stream
  async resolveStream(animeTitle, episodeNum = 1) {
    console.log(`[StreamEngine] Resolving: ${animeTitle} EP${episodeNum}`);

    try {
      // Step 1: Search
      console.log('[StreamEngine] Searching for anime...');
      const searchResults = await this.searchAnime(animeTitle);
      if (!searchResults) {
        return {
          success: false,
          error: 'Anime not found in search',
          timestamp: new Date().toISOString(),
        };
      }

      // Step 2: Extract ID
      const animeId = this.extractAnimeId(searchResults);
      if (!animeId) {
        return {
          success: false,
          error: 'Could not extract anime ID from search results',
          searchResults,
          timestamp: new Date().toISOString(),
        };
      }

      console.log(`[StreamEngine] Found anime ID: ${animeId}`);

      // Step 3: Get details
      console.log('[StreamEngine] Fetching anime details...');
      const details = await this.getAnimeDetails(animeId);

      // Step 4: Get stream
      console.log(`[StreamEngine] Getting episode ${episodeNum} stream...`);
      const stream = await this.getEpisodeStream(animeId, episodeNum);

      return {
        success: !!stream.m3u8,
        animeTitle,
        animeId,
        episodeNum,
        m3u8: stream.m3u8,
        streamData: stream.data,
        endpoint: stream.endpoint,
        error: stream.error,
        timestamp: stream.timestamp,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Get cache stats
  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      requestsLogged: this.requestLog.length,
    };
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }
}

module.exports = AnikotoStreamEngine;
