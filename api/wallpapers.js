// api/wallpapers.js
/**
 * WallZone – Vercel Serverless API
 * Proxies Wallhaven.cc so your API key stays server-side.
 */

const WALLHAVEN_BASE = 'https://wallhaven.cc/api/v1';
const API_KEY = process.env.WALLHAVEN_API_KEY || '';

// ─── Category map ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'nature',      label: 'Nature',       q: 'nature landscape forest',   wh: '100' },
  { id: 'space',       label: 'Space',        q: 'space galaxy nebula',       wh: '100' },
  { id: 'ocean',       label: 'Ocean',        q: 'ocean waves sea',           wh: '100' },
  { id: 'city',        label: 'City',         q: 'cityscape urban night',     wh: '100' },
  { id: 'mountain',    label: 'Mountain',     q: 'mountain landscape peak',   wh: '100' },
  { id: 'cyberpunk',   label: 'Cyberpunk',    q: 'cyberpunk neon city',       wh: '110' },
  { id: 'abstract',    label: 'Abstract',     q: 'abstract art fluid',        wh: '100' },
  { id: 'geometric',   label: 'Geometric',    q: 'geometric pattern',         wh: '100' },
  { id: 'amoled',      label: 'AMOLED Dark',  q: 'amoled dark black',         wh: '100' },
  { id: 'aurora',      label: 'Aurora',       q: 'aurora borealis',           wh: '100' },
  { id: 'retrowave',   label: 'Retrowave',    q: 'synthwave retrowave',       wh: '100' },
  { id: 'neon',        label: 'Neon',         q: 'neon lights',               wh: '100' },
  { id: 'minimal',     label: 'Minimal',      q: 'minimalism clean',          wh: '100' },
  { id: 'galaxy',      label: 'Galaxy',       q: 'milky way stars',           wh: '100' },
  { id: 'wildlife',    label: 'Wildlife',     q: 'wildlife animals',          wh: '100' },
  { id: 'architecture',label: 'Architecture', q: 'architecture building',     wh: '100' },
  // Anime kept as opt-in category only — never mixed into home/trending feeds
  { id: 'anime',       label: 'Anime',        q: 'anime scenery landscape -1girl -2girls -solo', wh: '010' },
  { id: 'sakura',      label: 'Sakura',       q: 'cherry blossom sakura -1girl', wh: '110' },
  { id: 'lofi',        label: 'Lo-Fi',        q: 'lofi room aesthetic -1girl',   wh: '110' },
];

// Categories used for the mixed home explore feed (no anime)
const EXPLORE_CATEGORIES = CATEGORIES.filter(
  c => !['anime', 'sakura', 'lofi'].includes(c.id)
);

// Tags that indicate anime character bloat — filtered from all non-anime feeds
const BLOCKED_TAGS = new Set([
  '1girl', '2girls', '3girls', 'solo', 'multiple_girls',
  'anime_girl', 'female', 'girl', 'character',
]);

const ANIME_EXCLUSION_QUERY = '-1girl -2girls -3girls -solo -anime_girl';

// ─── Transform & Filter ──────────────────────────────────────────────────────
function isPortrait(w) {
  return w.dimension_y > w.dimension_x;
}

function hasBlockedTags(w) {
  const tags = (w.tags || []).map(t => (t.name || '').toLowerCase());
  return tags.some(t => BLOCKED_TAGS.has(t));
}

function filterWallpapers(items, { allowAnime = false } = {}) {
  return (items || []).filter(w => {
    if (!isPortrait(w)) return false;
    if (!allowAnime && (w.category === 'anime' || hasBlockedTags(w))) return false;
    return true;
  });
}

function mapWallhavenItem(w) {
  const aspectRatio = w.dimension_y / Math.max(w.dimension_x, 1);
  const cardHeight = Math.min(Math.max(Math.floor(aspectRatio * 180), 200), 380);

  return {
    id: w.id,
    url: w.thumbs?.large || w.thumbs?.original || w.path,
    fullUrl: w.path,
    previewUrl: w.thumbs?.large || w.thumbs?.original || w.path,
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function interleave(buckets) {
  const result = [];
  const max = Math.max(...buckets.map(b => b.length), 0);
  for (let i = 0; i < max; i++) {
    for (const bucket of buckets) {
      if (bucket[i]) result.push(bucket[i]);
    }
  }
  return result;
}

function pickExploreCategories(pageNum, count = 5) {
  const pool = [...EXPLORE_CATEGORIES];
  const offset = ((pageNum - 1) * count) % pool.length;
  const picked = [];
  for (let i = 0; i < count; i++) {
    picked.push(pool[(offset + i) % pool.length]);
  }
  return picked;
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

async function fetchCategoryBatch(categories, pageNum) {
  const results = await Promise.all(
    categories.map(async cat => {
      try {
        const url = buildSearchUrl({
          q: `${cat.q} ${ANIME_EXCLUSION_QUERY}`,
          categories: cat.wh,
          page: pageNum,
          sorting: 'toplist',
          topRange: '1M',
        });
        const data = await fetchWallhaven(url);
        return filterWallpapers(data.data).map(mapWallhavenItem);
      } catch {
        return [];
      }
    })
  );
  return results;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const isRefresh = req.query.refresh === '1';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Short CDN cache; bypass when client requests fresh content
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
        q: `${q.trim()} ${ANIME_EXCLUSION_QUERY}`,
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

    // 2. Trending — rotate through diverse non-anime categories
    if (type === 'trending') {
      const trendingCats = pickExploreCategories(pageNum, 4);
      const buckets = await fetchCategoryBatch(trendingCats, 1);
      const wallpapers = shuffle(interleave(buckets)).slice(0, 24);
      return res.json({ wallpapers, meta: { page: pageNum } });
    }

    // 3. Explore — mixed feed from multiple categories for variety
    if (type === 'explore') {
      const exploreCats = pickExploreCategories(pageNum, 5);
      const buckets = await fetchCategoryBatch(exploreCats, pageNum);
      const seen = new Set();
      const wallpapers = shuffle(interleave(buckets)).filter(w => {
        if (seen.has(w.id)) return false;
        seen.add(w.id);
        return true;
      });
      return res.json({ wallpapers, meta: { page: pageNum } });
    }

    // 4. Single Category
    if (type === 'category') {
      const cat = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
      const isAnimeCat = cat.id === 'anime';
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

    // 5. Category Covers
    if (type === 'categories') {
      const covers = await Promise.all(
        CATEGORIES.map(async cat => {
          try {
            const url = buildSearchUrl({
              q: cat.q,
              categories: cat.wh,
              page: 1,
              sorting: 'favorites',
            });
            const data = await fetchWallhaven(url);
            const isAnimeCat = cat.id === 'anime';
            const portraitImages = filterWallpapers(data.data, { allowAnime: isAnimeCat });
            return {
              id: cat.id,
              label: cat.label,
              cover: portraitImages[0]?.thumbs?.large || portraitImages[0]?.thumbs?.original || '',
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
