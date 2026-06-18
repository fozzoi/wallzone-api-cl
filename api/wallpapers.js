// api/wallpapers.js
/**
 * WallZone – Vercel Serverless API
 * Proxies Wallhaven.cc so your API key stays server-side.
 */

const WALLHAVEN_BASE = 'https://wallhaven.cc/api/v1';
const API_KEY = process.env.WALLHAVEN_API_KEY || '';

// ─── Category map ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'nature',       label: 'Nature',        q: 'nature landscape',              wh: '100', cover: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=75' },
  { id: 'space',        label: 'Space',         q: 'space galaxy',                  wh: '100', cover: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=75' },
  { id: 'ocean',        label: 'Ocean',         q: 'ocean waves',                   wh: '100', cover: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=800&q=75' },
  { id: 'city',         label: 'City',          q: 'cityscape night',               wh: '100', cover: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=800&q=75' },
  { id: 'mountain',     label: 'Mountain',      q: 'mountain landscape',            wh: '100', cover: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=75' },
  { id: 'cyberpunk',    label: 'Cyberpunk',     q: 'cyberpunk neon',                wh: '110', cover: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?auto=format&fit=crop&w=800&q=75' },
  { id: 'abstract',     label: 'Abstract',      q: 'abstract art',                  wh: '100', cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=75' },
  { id: 'geometric',    label: 'Geometric',     q: 'geometric pattern',             wh: '100', cover: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=75' },
  { id: 'amoled',       label: 'AMOLED Dark',   q: 'amoled dark',                   wh: '100', cover: 'https://images.unsplash.com/photo-1550684845-f7c5c5c5c5c5?auto=format&fit=crop&w=800&q=75' },
  { id: 'aurora',       label: 'Aurora',        q: 'aurora borealis',               wh: '100', cover: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=800&q=75' },
  { id: 'retrowave',    label: 'Retrowave',     q: 'synthwave retrowave',           wh: '100', cover: 'https://images.unsplash.com/photo-1614851099175-e5b30eb6f696?auto=format&fit=crop&w=800&q=75' },
  { id: 'neon',         label: 'Neon',          q: 'neon lights',                   wh: '100', cover: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=800&q=75' },
  { id: 'minimal',      label: 'Minimal',       q: 'minimalism',                    wh: '100', cover: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=800&q=75' },
  { id: 'galaxy',       label: 'Galaxy',        q: 'milky way stars',               wh: '100', cover: 'https://images.unsplash.com/photo-1543722530-d2c3201371e7?auto=format&fit=crop&w=800&q=75' },
  { id: 'wildlife',     label: 'Wildlife',      q: 'wildlife animals',              wh: '100', cover: 'https://images.unsplash.com/photo-1437622368342-7a3d73a640fe?auto=format&fit=crop&w=800&q=75' },
  { id: 'architecture', label: 'Architecture', q: 'architecture building',         wh: '100', cover: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=800&q=75' },
  { id: 'anime',        label: 'Anime',         q: 'anime scenery -1girl -2girls',  wh: '010', cover: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=75' },
  { id: 'sakura',       label: 'Sakura',        q: 'cherry blossom sakura',        wh: '110', cover: 'https://images.unsplash.com/photo-1493514789931-586cb221d7a7?auto=format&fit=crop&w=800&q=75' },
  { id: 'lofi',         label: 'Lo-Fi',         q: 'lofi aesthetic room',           wh: '110', cover: 'https://images.unsplash.com/photo-1511367461429-c7d9b294b6b6?auto=format&fit=crop&w=800&q=75' },
];

// Only block obvious anime-character tags (not generic words like "female")
const ANIME_CHARACTER_TAGS = new Set(['1girl', '2girls', '3girls', 'multiple_girls', 'anime_girl']);
const ANIME_EXCLUSION_QUERY = '-1girl -2girls -3girls';

// ─── Transform & Filter ──────────────────────────────────────────────────────
function isPortrait(w) {
  return w.dimension_y > w.dimension_x;
}

function isAnimeCharacter(w) {
  const tags = (w.tags || []).map(t => (t.name || '').toLowerCase());
  return tags.some(t => ANIME_CHARACTER_TAGS.has(t));
}

function filterWallpapers(items, { allowAnime = false } = {}) {
  return (items || []).filter(w => {
    if (!isPortrait(w)) return false;
    if (!allowAnime && w.category === 'anime') return false;
    if (!allowAnime && isAnimeCharacter(w)) return false;
    return true;
  });
}

function mapWallhavenItem(w) {
  const aspectRatio = w.dimension_y / Math.max(w.dimension_x, 1);
  const cardHeight = Math.min(Math.max(Math.floor(aspectRatio * 180), 200), 380);

  // Build a clean title: use the wallhaven file short ID + top tag, or fallback
  const tagNames = (w.tags || []).map(t => t.name).filter(Boolean);
  const title = tagNames.length > 0
    ? tagNames.slice(0, 3).map(t => t.replace(/[_]/g, ' ')).join(', ')
    : 'Wallpaper';

  return {
    id: w.id,
    url: w.thumbs?.original || w.thumbs?.large || w.path,
    fullUrl: w.path,
    // thumbs.original preserves portrait aspect ratio; thumbs.large is always a 300×200 landscape crop
    previewUrl: w.thumbs?.original || w.thumbs?.large || w.path,
    title,
    tags: tagNames,           // full tag list for the detail page
    author: w.uploader?.username || 'Wallhaven',
    source: 'Wallhaven',      // explicit source label
    height: cardHeight,
    resolution: w.resolution || '',
    views: w.views || 0,
    favorites: w.favorites || 0,
    colors: w.colors || [],
    fileSize: w.file_size || 0,
    category: w.category || 'general',
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

// ─── Build Wallhaven search URL ───────────────────────────────────────────────
function buildSearchUrl({ q = '', categories = '100', page = 1, sorting = 'relevance', topRange = '1M' }) {
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

async function fetchWallhaven(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'WallZoneApp/1.0' },
  });
  if (!response.ok) throw new Error(`Wallhaven responded ${response.status}`);
  return response.json();
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const isRefresh = req.query.refresh === '1';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader(
    'Cache-Control',
    isRefresh ? 'no-store' : 's-maxage=60, stale-while-revalidate=120'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { type = 'search', q = '', page = '1', category = '' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  try {
    // 1. Search
    if (type === 'search') {
      if (!q.trim()) return res.status(400).json({ error: 'q param required for search' });
      const url = buildSearchUrl({
        q: q.trim(),
        categories: '110',
        page: pageNum,
        sorting: 'relevance',
      });
      const data = await fetchWallhaven(url);
      return res.json({
        wallpapers: filterWallpapers(data.data, { allowAnime: true }).map(mapWallhavenItem),
        meta: data.meta,
      });
    }

    // 2. Trending — single fast request, general category only
    if (type === 'trending') {
      const url = buildSearchUrl({
        q: ANIME_EXCLUSION_QUERY,
        categories: '100',
        page: pageNum,
        sorting: 'toplist',
        topRange: '1w',
      });
      const data = await fetchWallhaven(url);
      const wallpapers = filterWallpapers(data.data).map(mapWallhavenItem).slice(0, 12);
      return res.json({ wallpapers, meta: data.meta });
    }

    // 3. Explore — single request, shuffled for variety
    if (type === 'explore') {
      const url = buildSearchUrl({
        q: ANIME_EXCLUSION_QUERY,
        categories: '100',
        page: pageNum,
        sorting: 'toplist',
        topRange: '1M',
      });
      const data = await fetchWallhaven(url);
      let wallpapers = filterWallpapers(data.data).map(mapWallhavenItem);
      if (pageNum === 1) wallpapers = shuffle(wallpapers);
      return res.json({ wallpapers, meta: data.meta });
    }

    // 4. Single Category
    if (type === 'category') {
      const cat = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
      const isAnimeCat = ['anime', 'sakura', 'lofi'].includes(cat.id);
      const url = buildSearchUrl({
        q: cat.q,
        categories: cat.wh,
        page: pageNum,
        sorting: 'toplist',
        topRange: '1y',
      });
      const data = await fetchWallhaven(url);
      return res.json({
        wallpapers: filterWallpapers(data.data, { allowAnime: isAnimeCat }).map(mapWallhavenItem),
        meta: data.meta,
      });
    }

    // 5. Category list — static covers, no live Wallhaven calls (fast & reliable)
    if (type === 'categories') {
      const covers = CATEGORIES.map(cat => ({
        id: cat.id,
        label: cat.label,
        cover: cat.cover,
        query: cat.q,
      }));
      return res.json({ categories: covers });
    }

    return res.status(400).json({ error: `Unknown type: ${type}` });

  } catch (err) {
    console.error('WallZone API error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
