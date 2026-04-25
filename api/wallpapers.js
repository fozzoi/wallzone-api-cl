/**
 * WallZone – Vercel Serverless API
 * Proxies Wallhaven.cc so your API key stays server-side.
 *
 * Endpoints (all GET /api/wallpapers):
 *   ?type=search&q=anime&page=1
 *   ?type=trending&page=1
 *   ?type=category&category=anime&page=1
 *   ?type=categories            (fetch one cover per category)
 */

const WALLHAVEN_BASE = 'https://wallhaven.cc/api/v1';
const API_KEY = process.env.WALLHAVEN_API_KEY || ''; // set in Vercel dashboard

// ─── Category map ────────────────────────────────────────────────────────────
// categories: 3-digit bitmask  100=general  010=anime  001=people
// We only ever show SFW (purity=100)
const CATEGORIES = [
  { id: 'anime',      label: 'Anime',       q: 'anime landscape scenery',    wh: '010' },
  { id: 'cyberpunk',  label: 'Cyberpunk',   q: 'cyberpunk neon city night',  wh: '110' },
  { id: 'space',      label: 'Space',       q: 'space galaxy nebula cosmos', wh: '100' },
  { id: 'nature',     label: 'Nature',      q: 'nature forest mountains',    wh: '100' },
  { id: 'ocean',      label: 'Ocean',       q: 'ocean sea waves aerial',     wh: '100' },
  { id: 'amoled',     label: 'AMOLED Dark', q: 'dark black minimal amoled',  wh: '100' },
  { id: 'abstract',   label: 'Abstract',    q: 'abstract art fluid colorful',wh: '100' },
  { id: 'geometric',  label: 'Geometric',   q: 'geometric pattern vector',   wh: '100' },
  { id: 'lofi',       label: 'Lo-Fi',       q: 'lofi cozy aesthetic room',   wh: '110' },
  { id: 'aurora',     label: 'Aurora',      q: 'aurora borealis northern lights', wh: '100' },
  { id: 'retrowave',  label: 'Retrowave',   q: 'synthwave retrowave 80s sunset',  wh: '100' },
  { id: 'sakura',     label: 'Sakura',      q: 'cherry blossom sakura japan',wh: '110' },
  { id: 'neon',       label: 'Neon',        q: 'neon lights glow color',     wh: '100' },
  { id: 'minimal',    label: 'Minimal',     q: 'minimalist simple clean',    wh: '100' },
  { id: 'galaxy',     label: 'Galaxy',      q: 'milky way galaxy stars',     wh: '100' },
];

// ─── Transform Wallhaven item → app item ─────────────────────────────────────
function mapWallhavenItem(w) {
  // Use large thumb for grid (fast), full path for detail view
  const aspectRatio = w.dimension_y / Math.max(w.dimension_x, 1);
  const cardHeight = Math.min(Math.max(Math.floor(aspectRatio * 180), 200), 380);

  return {
    id: w.id,
    url: w.thumbs.large,           // grid thumbnail (~300px wide)
    fullUrl: w.path,               // full resolution for detail/download
    previewUrl: w.thumbs.original, // medium preview
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
    purity: '100',      // SFW only
    sorting,
    order: 'desc',
    ratios: 'portrait', // mobile/portrait wallpapers only
    page: String(page),
  });

  if (q) params.set('q', q);
  if (sorting === 'toplist') params.set('topRange', topRange);
  if (API_KEY) params.set('apikey', API_KEY);

  return `${WALLHAVEN_BASE}/search?${params.toString()}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS – allow any origin (React Native doesn't need this but good practice)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { type = 'search', q = '', page = '1', category = '' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  try {
    // ── 1. Search ─────────────────────────────────────────────────────────────
    if (type === 'search') {
      if (!q.trim()) {
        return res.status(400).json({ error: 'q param required for search' });
      }
      const url = buildSearchUrl({ q: q.trim(), categories: '110', page: pageNum, sorting: 'relevance' });
      const data = await fetchWallhaven(url);
      return res.json({ wallpapers: data.data.map(mapWallhavenItem), meta: data.meta });
    }

    // ── 2. Trending / Explore mix ─────────────────────────────────────────────
    if (type === 'trending') {
      const url = buildSearchUrl({ categories: '110', page: pageNum, sorting: 'toplist', topRange: '1M' });
      const data = await fetchWallhaven(url);
      return res.json({ wallpapers: data.data.map(mapWallhavenItem), meta: data.meta });
    }

    // ── 3. Explore random mix (home grid) ─────────────────────────────────────
    if (type === 'explore') {
      // Pick 3 random categories and merge results for variety
      const shuffled = [...CATEGORIES].sort(() => Math.random() - 0.5).slice(0, 3);
      const promises = shuffled.map(cat =>
        fetchWallhaven(buildSearchUrl({ q: cat.q, categories: cat.wh, page: pageNum, sorting: pageNum === 1 ? 'favorites' : 'date_added' }))
      );
      const results = await Promise.all(promises);
      const all = results.flatMap(r => (r.data || []).map(mapWallhavenItem));
      // Fisher-Yates shuffle
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      return res.json({ wallpapers: all });
    }

    // ── 4. Single category ────────────────────────────────────────────────────
    if (type === 'category') {
      const cat = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
      const url = buildSearchUrl({ q: cat.q, categories: cat.wh, page: pageNum, sorting: 'favorites' });
      const data = await fetchWallhaven(url);
      return res.json({ wallpapers: data.data.map(mapWallhavenItem), meta: data.meta });
    }

    // ── 5. All categories list (with cover image) ─────────────────────────────
    if (type === 'categories') {
      // Fetch one cover per category in parallel
      const covers = await Promise.all(
        CATEGORIES.map(async cat => {
          try {
            const url = buildSearchUrl({ q: cat.q, categories: cat.wh, page: 1, sorting: 'favorites' });
            const data = await fetchWallhaven(url);
            const first = data.data?.[0];
            return {
              id: cat.id,
              label: cat.label,
              cover: first?.thumbs?.large || '',
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
