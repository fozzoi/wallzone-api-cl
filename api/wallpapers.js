// api/wallpapers.js
/**
 * WallZone – Vercel Serverless API
 * Proxies Wallhaven.cc so your API key stays server-side.
 */

const WALLHAVEN_BASE = 'https://wallhaven.cc/api/v1';
const API_KEY = process.env.WALLHAVEN_API_KEY || ''; // set in Vercel dashboard

// ─── Category map ────────────────────────────────────────────────────────────
// FIX: Simplified the queries (q) so they return thousands of paginatable results
const CATEGORIES = [
  { id: 'anime',      label: 'Anime',       q: 'anime',            wh: '010' },
  { id: 'cyberpunk',  label: 'Cyberpunk',   q: 'cyberpunk neon',   wh: '110' },
  { id: 'space',      label: 'Space',       q: 'space',            wh: '100' },
  { id: 'nature',     label: 'Nature',      q: 'nature',           wh: '100' },
  { id: 'ocean',      label: 'Ocean',       q: 'ocean',            wh: '100' },
  { id: 'amoled',     label: 'AMOLED Dark', q: 'amoled',           wh: '100' },
  { id: 'abstract',   label: 'Abstract',    q: 'abstract',         wh: '100' },
  { id: 'geometric',  label: 'Geometric',   q: 'geometric',        wh: '100' },
  { id: 'lofi',       label: 'Lo-Fi',       q: 'lofi',             wh: '110' },
  { id: 'aurora',     label: 'Aurora',      q: 'aurora',           wh: '100' },
  { id: 'retrowave',  label: 'Retrowave',   q: 'retrowave',        wh: '100' },
  { id: 'sakura',     label: 'Sakura',      q: 'sakura',           wh: '110' },
  { id: 'neon',       label: 'Neon',        q: 'neon',             wh: '100' },
  { id: 'minimal',    label: 'Minimal',     q: 'minimalism',       wh: '100' },
  { id: 'galaxy',     label: 'Galaxy',      q: 'galaxy',           wh: '100' },
];

// ─── Transform & Filter ──────────────────────────────────────────────────────
function isPortrait(w) {
  return w.dimension_y > w.dimension_x; 
}

function mapWallhavenItem(w) {
  const aspectRatio = w.dimension_y / Math.max(w.dimension_x, 1);
  const cardHeight = Math.min(Math.max(Math.floor(aspectRatio * 180), 200), 380);

  return {
    id: w.id,
    url: w.thumbs.original,        
    fullUrl: w.path,               
    previewUrl: w.thumbs.original, 
    title: w.tags?.length > 0
      ? w.tags.slice(0, 3).map(t => t.name).join(', ')
      : 'Wallpaper',
    author: w.uploader?.username || 'WallZone',
    height: cardHeight,
    resolution: w.resolution || '',
    views: w.views || 0,
    favorites: w.favorites || 0,
    colors: w.colors || [],
    fileSize: w.file_size || 0,
    category: w.category || 'general',
  };
}

// ─── Build Wallhaven search URL ───────────────────────────────────────────────
function buildSearchUrl({ q = '', categories = '110', page = 1, sorting = 'relevance', topRange = '1M' }) {
  const params = new URLSearchParams({
    categories,
    purity: '100',      
    sorting,
    order: 'desc',
    ratios: 'portrait', 
    page: String(page),
  });

  if (q) params.set('q', q);
  if (sorting === 'toplist') params.set('topRange', topRange);
  if (API_KEY) params.set('apikey', API_KEY);

  return `${WALLHAVEN_BASE}/search?${params.toString()}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { type = 'search', q = '', page = '1', category = '' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  try {
    // 1. Search
    if (type === 'search') {
      if (!q.trim()) return res.status(400).json({ error: 'q param required for search' });
      const url = buildSearchUrl({ q: q.trim(), categories: '110', page: pageNum, sorting: 'relevance' });
      const data = await fetchWallhaven(url);
      return res.json({ wallpapers: data.data.filter(isPortrait).map(mapWallhavenItem), meta: data.meta });
    }

    // 2. Trending
    if (type === 'trending') {
      const url = buildSearchUrl({ categories: '110', page: pageNum, sorting: 'toplist', topRange: '1w' });
      const data = await fetchWallhaven(url);
      return res.json({ wallpapers: data.data.filter(isPortrait).map(mapWallhavenItem), meta: data.meta });
    }

    // 3. Explore
    if (type === 'explore') {
      const url = buildSearchUrl({ categories: '110', page: pageNum, sorting: 'toplist', topRange: '1y' });
      const data = await fetchWallhaven(url);
      
      let wallpapers = data.data.filter(isPortrait).map(mapWallhavenItem);
      
      for (let i = wallpapers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wallpapers[i], wallpapers[j]] = [wallpapers[j], wallpapers[i]];
      }
      return res.json({ wallpapers, meta: data.meta });
    }

    // 4. Single Category
    if (type === 'category') {
      const cat = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
      // FIX: Changed sorting to 'toplist' with '1y' range to ensure thousands of paginatable results
      const url = buildSearchUrl({ q: cat.q, categories: cat.wh, page: pageNum, sorting: 'toplist', topRange: '1y' });
      const data = await fetchWallhaven(url);
      return res.json({ wallpapers: data.data.filter(isPortrait).map(mapWallhavenItem), meta: data.meta });
    }

    // 5. Category Covers
    if (type === 'categories') {
      const covers = await Promise.all(
        CATEGORIES.map(async cat => {
          try {
            const url = buildSearchUrl({ q: cat.q, categories: cat.wh, page: 1, sorting: 'favorites' });
            const data = await fetchWallhaven(url);
            const portraitImages = data.data?.filter(isPortrait) || [];
            return {
              id: cat.id,
              label: cat.label,
              cover: portraitImages[0]?.thumbs?.original || '',
              query: cat.q,
            };
          } catch {
            return { id: cat.id, label: cat.label, cover: '', query: cat.q };
          }
        })
      );
      return res.json({ categories: covers });
    }

    return res.status(400).json({ error: `Unknown type: ${type}` });

  } catch (err) {
    console.error('WallZone API error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}

async function fetchWallhaven(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'WallZoneApp/1.0' },
  });
  if (!response.ok) throw new Error(`Wallhaven responded ${response.status}`);
  return response.json();
}