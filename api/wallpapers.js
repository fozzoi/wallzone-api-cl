// api/wallpapers.js
/**
 * WallZone – Vercel Serverless API
 * Proxies Unsplash API with strict caching and wallpaper curation.
 */

const UNSPLASH_BASE = 'https://api.unsplash.com';
const API_KEY = process.env.Access_Key || '';

// ─── Category map ────────────────────────────────────────────────────────────
// Mapping our categories to Unsplash topics or specific curated search queries
const CATEGORIES = [
  { id: 'nature', label: 'Nature', q: 'nature landscape wallpaper', cover: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=75' },
  { id: 'nasa', label: 'NASA', username: 'nasa', cover: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=800&q=75' },
  { id: 'ocean', label: 'Ocean', q: 'ocean waves aerial wallpaper', cover: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=800&q=75' },
  { id: 'city', label: 'City', q: 'cityscape night neon wallpaper ', cover: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&q=75' },
  { id: 'mountain', label: 'Mountain', q: 'mountain landscape aesthetic wallpaper', cover: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=75' },
  { id: 'cyberpunk', label: 'Cyberpunk', q: 'cyberpunk neon city wallpaper', cover: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?auto=format&fit=crop&w=800&q=75' },
  { id: 'abstract', label: 'Abstract', q: 'abstract 3d render wallpaper', cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=75' },
  { id: 'geometric', label: 'Geometric', q: 'geometric pattern 3d wallpaper', cover: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=75' },
  { id: 'amoled', label: 'AMOLED Dark', q: 'dark black minimal wallpaper', cover: 'https://images.unsplash.com/photo-1550684845-f7c5c5c5c5c5?auto=format&fit=crop&w=800&q=75' },
  { id: 'aurora', label: 'Aurora', q: 'aurora borealis night wallpaper', cover: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=800&q=75' },
  { id: 'retrowave', label: 'Retrowave', q: 'synthwave vaporwave wallpaper', cover: 'https://images.unsplash.com/photo-1614851099175-e5b30eb6f696?auto=format&fit=crop&w=800&q=75' },
  { id: 'minimal', label: 'Minimal', q: 'minimalist clean wallpaper', cover: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=800&q=75' },
  { id: 'wildlife', label: 'Wildlife', q: 'wildlife animal portrait wallpaper', cover: 'https://images.unsplash.com/photo-1437622368342-7a3d73a640fe?auto=format&fit=crop&w=800&q=75' },
  { id: 'architecture', label: 'Architecture', q: 'modern architecture pattern wallpaper', cover: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=800&q=75' },
  { id: 'anime', label: 'Anime', q: 'anime japan landscape wallpaper', cover: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=75' },
];

// ─── Transform & Filter ──────────────────────────────────────────────────────
function isPortrait(w) {
  return w.height > w.width;
}

function isLandscape(w) {
  return w.width > w.height;
}

function mapUnsplashItem(u) {
  const aspectRatio = u.height / Math.max(u.width, 1);
  const cardHeight = Math.min(Math.max(Math.floor(aspectRatio * 180), 200), 380);

  // Extract a sensible title from tags or alt description
  const tagNames = (u.tags || []).map(t => t.title).filter(Boolean);
  const title = tagNames.length > 0
    ? tagNames[0].charAt(0).toUpperCase() + tagNames[0].slice(1)
    : (u.alt_description ? u.alt_description.split(' ')[0] : 'Wallpaper');

  return {
    id: u.id,
    // Preview: regular is max 1080px wide (perfect for grid)
    url: u.urls.regular,
    // Full: raw allows us to append parameters, but we can use 'full' or 'raw'
    fullUrl: u.urls.full,
    previewUrl: u.urls.regular,
    title,
    tags: tagNames,
    author: u.user?.name || 'Unsplash Photographer',
    source: 'Unsplash',
    height: cardHeight,
    resolution: `${u.width}x${u.height}`,
    views: u.views || 0,
    favorites: u.likes || 0,
    colors: [u.color], // Unsplash provides a primary hex color
    fileSize: 0, // Unsplash doesn't provide file size in standard search responses
    category: 'general',
    // We MUST pass this tracking URL to the frontend
    download_location: u.links?.download_location || '',
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── API Fetchers ─────────────────────────────────────────────────────────────

async function fetchUnsplash(endpoint, paramsObj = {}, retries = 2) {
  const params = new URLSearchParams(paramsObj);
  const url = `${UNSPLASH_BASE}${endpoint}?${params.toString()}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Client-ID ${API_KEY}`,
        'Accept-Version': 'v1'
      },
    });

    if (response.status === 403 || response.status === 429) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw new Error(`Unsplash responded ${response.status} — rate limited. Try again later.`);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Unsplash API error ${response.status}: ${errText}`);
    }
    return response.json();
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Parse query params
  let type, q, page, category, pageNum, orientation;
  try {
    const sp = new URL(req.url, 'https://wallzone.vercel.app').searchParams;
    type = sp.get('type') || 'explore';
    q = sp.get('q') || '';
    page = sp.get('page') || '1';
    category = sp.get('category') || '';
    orientation = sp.get('orientation') || 'portrait';
  } catch {
    const rq = req.query || {};
    type = rq.type || 'explore';
    q = rq.q || '';
    page = rq.page || '1';
    category = rq.category || '';
    orientation = rq.orientation || 'portrait';
  }
  pageNum = Math.max(1, parseInt(page, 10) || 1);
  const requestOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
  const filterFn = requestOrientation === 'landscape' ? isLandscape : isPortrait;

  // AGGRESSIVE CACHING (1 hour to 12 hours) to protect Unsplash 50/hr dev limits
  const cacheTTL =
    type === 'categories'
      ? 's-maxage=86400, stale-while-revalidate=604800'     // 1 day / 1 week (static)
      : (type === 'explore' || type === 'trending')
        ? 's-maxage=43200, stale-while-revalidate=86400'      // 12 hours / 24 hours
        : 's-maxage=7200, stale-while-revalidate=14400';        // search/category: 2 hours / 4 hours
  res.setHeader('Cache-Control', cacheTTL);

  try {
    // 1. Search (curated with 'wallpaper' to avoid stock photos)
    if (type === 'search') {
      if (!q.trim()) return res.status(400).json({ error: 'q param required for search' });
      // Append "wallpaper" to push Unsplash towards aesthetic backgrounds instead of journalism
      const searchQuery = q.trim().toLowerCase().includes('wallpaper') ? q.trim() : `${q.trim()} wallpaper`;
      const data = await fetchUnsplash('/search/photos', {
        query: searchQuery,
        page: pageNum,
        per_page: 30,
        orientation: requestOrientation,
        content_filter: 'high',
      });
      const wallpapers = (data.results || []).filter(filterFn).map(mapUnsplashItem);
      return res.json({ wallpapers, meta: { total: data.total, total_pages: data.total_pages } });
    }

    // 2. Trending — High quality curated 'Wallpapers' topic
    if (type === 'trending') {
      const data = await fetchUnsplash('/topics/wallpapers/photos', {
        page: pageNum,
        per_page: 12,
        order_by: 'popular',
        orientation: requestOrientation,
      });
      const wallpapers = (data || []).filter(filterFn).map(mapUnsplashItem);
      return res.json({ wallpapers, meta: {} });
    }

    // 3. Explore — Mixed 'Wallpapers' topic and '3D Renders' for variety
    if (type === 'explore') {
      // Alternate topics based on page to give variety
      const topicId = pageNum % 2 === 0 ? '3d-renders' : 'wallpapers';
      const data = await fetchUnsplash(`/topics/${topicId}/photos`, {
        page: Math.ceil(pageNum / 2), // Adjust page to fetch sequentially from each topic
        per_page: 30,
        order_by: 'latest',
        orientation: requestOrientation,
      });
      let wallpapers = (data || []).filter(filterFn).map(mapUnsplashItem);
      if (pageNum === 1) wallpapers = shuffle(wallpapers);
      return res.json({ wallpapers, meta: {} });
    }

    // 4. Single Category
    if (type === 'category') {
      const cat = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
      if (cat.username) {
        // Fetch from user profile instead of search query
        const data = await fetchUnsplash(`/users/${cat.username}/photos`, {
          page: pageNum,
          per_page: 30,
        });
        const wallpapers = (data || []).filter(filterFn).map(mapUnsplashItem);
        // Since user photos endpoint doesn't return pagination data in body, mock it
        return res.json({ wallpapers, meta: { total: 100, total_pages: 5 } });
      } else {
        const data = await fetchUnsplash('/search/photos', {
          query: cat.q,
          page: pageNum,
          per_page: 30,
          orientation: requestOrientation,
          content_filter: 'high',
          order_by: 'relevant',
        });
        const wallpapers = (data.results || []).filter(filterFn).map(mapUnsplashItem);
        return res.json({ wallpapers, meta: { total: data.total, total_pages: data.total_pages } });
      }
    }

    // 5. Category list — static covers
    if (type === 'categories') {
      const covers = CATEGORIES.map(cat => ({
        id: cat.id,
        label: cat.label,
        cover: cat.cover,
        query: cat.q || '',
        username: cat.username || null,
      }));
      return res.json({ categories: covers });
    }

    return res.status(400).json({ error: `Unknown type: ${type}` });

  } catch (err) {
    console.error('Unsplash API error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
