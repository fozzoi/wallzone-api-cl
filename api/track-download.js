// api/track-download.js
/**
 * WallZone – Vercel Serverless API
 * Required tracking endpoint for Unsplash API Guidelines.
 * Hits the download_location URL provided by Unsplash to register a download/set action.
 */

const API_KEY = process.env.Access_Key || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Accept both GET and POST for flexibility, but only process downloadUrl
  let downloadUrl;
  if (req.method === 'POST') {
    downloadUrl = req.body?.downloadUrl;
  } else {
    try {
      const sp = new URL(req.url, 'https://wallzone.vercel.app').searchParams;
      downloadUrl = sp.get('downloadUrl');
    } catch {
      downloadUrl = req.query?.downloadUrl;
    }
  }

  if (!downloadUrl) {
    return res.status(400).json({ error: 'Missing downloadUrl parameter' });
  }

  // Security check: ensure the URL is actually an Unsplash tracking URL
  if (!downloadUrl.startsWith('https://api.unsplash.com/photos/') || !downloadUrl.includes('/download')) {
    return res.status(403).json({ error: 'Invalid tracking URL' });
  }

  try {
    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Client-ID ${API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Unsplash tracking failed with status: ${response.status}`);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Tracking endpoint error:', err);
    // Even if tracking fails, we don't want to crash the client app, so return 200 with an error flag
    return res.status(200).json({ success: false, error: err.message });
  }
}
