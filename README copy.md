# WallZone API – Vercel Backend

Proxies [Wallhaven.cc](https://wallhaven.cc) so your API key stays server-side and never ships with the app.

## Deploy in 3 steps

### 1. Push to GitHub
```bash
cd wallzone-api
git init
git add .
git commit -m "init"
gh repo create wallzone-api --public --push --source .
# or just push to any GitHub repo
```

### 2. Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your `wallzone-api` GitHub repo
3. Click **Deploy** (zero configuration needed)
4. Your API is live at `https://wallzone-api.vercel.app/api/wallpapers`

### 3. Add your Wallhaven API key (optional but recommended)
1. [Get a free key](https://wallhaven.cc/settings/account) → Account → API Key
2. In Vercel → your project → **Settings → Environment Variables**
3. Add: `WALLHAVEN_API_KEY` = `your_key_here`
4. Re-deploy (Vercel → Deployments → Redeploy)

> Without an API key the API still works for SFW content — just with lower rate limits.

## Endpoints

| Type | URL |
|------|-----|
| Explore mix | `GET /api/wallpapers?type=explore&page=1` |
| Trending | `GET /api/wallpapers?type=trending&page=1` |
| Search | `GET /api/wallpapers?type=search&q=anime&page=1` |
| Category | `GET /api/wallpapers?type=category&category=anime&page=1` |
| Category list | `GET /api/wallpapers?type=categories` |

## Available category IDs
`anime` `cyberpunk` `space` `nature` `ocean` `amoled` `abstract` `geometric` `lofi` `aurora` `retrowave` `sakura` `neon` `minimal` `galaxy`

## Response shape
```json
{
  "wallpapers": [
    {
      "id": "string",
      "url": "thumbnail url",
      "fullUrl": "full resolution url",
      "title": "tag1, tag2, tag3",
      "author": "username",
      "height": 280,
      "resolution": "1440x2560",
      "views": 12000,
      "favorites": 500,
      "colors": ["#1a1a2e", "#..."],
      "fileSize": 2400000,
      "category": "anime"
    }
  ],
  "meta": { "total": 3000, "current_page": 1 }
}
```

## Local development
```bash
npm i -g vercel
vercel dev
# → http://localhost:3000/api/wallpapers?type=explore
```
