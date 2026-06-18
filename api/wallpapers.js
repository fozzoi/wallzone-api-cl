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

// Known AI-art generator tags from Wallhaven's tag system
const AI_ART_TAGS = new Set([
  'ai_art', 'ai generated', 'ai-generated', 'ai art',
  'stable diffusion', 'stable_diffusion', 'midjourney',
  'dall-e', 'dall_e', 'dreamshaper', 'novelai', 'niji journey',
]);

// ─── Transform & Filter ──────────────────────────────────────────────────────
function isPortrait(w) {
  return w.dimension_y > w.dimension_x;
}

// Minimum 1440px wide = QHD+ portrait ("2K" on mobile, e.g. Samsung 1440x3200, Pixel 1440x3120)
// This is the highest common phone screen width — guarantees sharp wallpapers on all phones.
function is2K(w) {
  return w.dimension_x >= 1440;
}

function isAiArt(w) {
  // Wallhaven adds an explicit ai field since their AI categorization update
  if (w.ai_art_filter === true || w.ai === true) return true;
  // Also catch via tags for any that slip through
  const tags = (w.tags || []).map(t => (t.name || '').toLowerCase());
  return tags.some(t => AI_ART_TAGS.has(t));
}

function isAnimeCharacter(w) {
  const tags = (w.tags || []).map(t => (t.name || '').toLowerCase());
  return tags.some(t => ANIME_CHARACTER_TAGS.has(t));
}

function filterWallpapers(items, { allowAnime = false } = {}) {
  return (items || []).filter(w => {
    if (!isPortrait(w))              return false; // portrait only
    if (!is2K(w))                    return false; // minimum 2K width
    if (isAiArt(w))                  return false; // no AI-generated art
    if (!allowAnime && w.category === 'anime')  return false;
    if (!allowAnime && isAnimeCharacter(w))     return false;
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
    // thumbs.large = 300px landscape crop (fast placeholder)
    // w.path = full resolution (used as the actual displayed image in grid + detail)
    url: w.thumbs?.large || w.path,
    fullUrl: w.path,
    // Use the full path as previewUrl so grid cards are crisp & portrait-correct.
    // expo-image caches aggressively so this doesn't re-download on scroll.
    previewUrl: w.path,
    title,
    tags: tagNames,
    author: w.uploader?.username || 'Wallhaven',
    source: 'Wallhaven',
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
    purity:          '100',
    sorting,
    order:           'desc',
    ratios:          'portrait',
    atleast:         '1440x3120', // QHD+ portrait = "2K mobile" (1440x3200 on Samsung/Pixel)
    ai_art_filter:   '1',         // exclude AI-generated wallpapers at the Wallhaven level
    page:            String(page),
  });

  if (q) params.set('q', q);
  if (sorting === 'toplist') params.set('topRange', topRange);
  if (API_KEY) params.set('apikey', API_KEY);

  return `${WALLHAVEN_BASE}/search?${params.toString()}`;
}

async function fetchWallhaven(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'WallZoneApp/1.0' },
    });

    if (response.status === 429) {
      if (attempt < retries) {
        // Exponential backoff: 1 s, then 2 s
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw new Error('Wallhaven responded 429 — rate limited. Try again later.');
    }

    if (!response.ok) throw new Error(`Wallhaven responded ${response.status}`);
    return response.json();
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Parse query params ────────────────────────────────────────────────────────
  // Try WHATWG URL API first (avoids DEP0169 url.parse deprecation warning).
  // Fall back to req.query if req.url is missing/malformed (e.g. some Vercel edge cases).
  let type, q, page, category, pageNum;
  try {
    const sp     = new URL(req.url, 'https://wallzone.vercel.app').searchParams;
    type         = sp.get('type')     || 'explore';
    q            = sp.get('q')        || '';
    page         = sp.get('page')     || '1';
    category     = sp.get('category') || '';
  } catch {
    // Fallback: Vercel already parsed req.query (uses url.parse internally,
    // hence the DEP0169 warning, but it's a warning not a crash)
    const rq = req.query || {};
    type     = rq.type     || 'explore';
    q        = rq.q        || '';
    page     = rq.page     || '1';
    category = rq.category || '';
  }
  pageNum = Math.max(1, parseInt(page, 10) || 1);

  // CDN cache TTL — keyed by full URL so each type/page/query combo is cached
  // independently on Vercel's edge. Keeps Wallhaven request count very low.
  const cacheTTL =
    type === 'categories'
      ? 's-maxage=3600, stale-while-revalidate=86400'       // 1 hr / 1 day (static)
    : (type === 'explore' || type === 'trending')
      ? 's-maxage=300, stale-while-revalidate=600'          // 5 min / 10 min
    : 's-maxage=120, stale-while-revalidate=300';           // search: 2 min / 5 min
  res.setHeader('Cache-Control', cacheTTL);

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

    // 3. Explore — toplist on p1 for quality, date_added for p2+ to support deep pagination
    if (type === 'explore') {
      const isFirstPage = pageNum === 1;
      const url = buildSearchUrl({
        q: ANIME_EXCLUSION_QUERY,
        categories: '100',
        page: pageNum,
        sorting: isFirstPage ? 'toplist' : 'date_added',
        topRange: '1M',
      });
      const data = await fetchWallhaven(url);
      let wallpapers = filterWallpapers(data.data).map(mapWallhavenItem);
      if (isFirstPage) wallpapers = shuffle(wallpapers);
      return res.json({ wallpapers, meta: data.meta });
    }

    // 4. Single Category — toplist on p1 for quality, date_added for p2+ for deep pagination
    if (type === 'category') {
      const cat = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
      const isAnimeCat = ['anime', 'sakura', 'lofi'].includes(cat.id);
      const isFirstPage = pageNum === 1;
      const url = buildSearchUrl({
        q: cat.q,
        categories: cat.wh,
        page: pageNum,
        sorting: isFirstPage ? 'toplist' : 'date_added',
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
