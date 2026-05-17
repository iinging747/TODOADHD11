// Vercel serverless function: server-side Anthropic proxy for admin AI features
// Setup:
//   1) Vercel dashboard → Project → Settings → Environment Variables
//   2) Add ANTHROPIC_API_KEY = sk-ant-…
//   3) Redeploy
// Without this env var the route returns 500 and the client falls back to user-supplied key.

// SHA-256 hash of the admin passkey — only this hash gets admin proxy access
const ADMIN_PASSKEY_HASH = 'c92095e898444015c0c48fef8ac08e0a925f5de5ad445f2ac3224025dcd124b1';

async function readJsonBody(req) {
  // Vercel parses JSON automatically when content-type is application/json; fall back manually otherwise
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  try {
    const body = await readJsonBody(req);
    const { adminHash, anthropic } = body || {};

    if (adminHash !== ADMIN_PASSKEY_HASH) {
      return res.status(403).json({ error: '관리자 인증 실패' });
    }
    if (!anthropic || !Array.isArray(anthropic.messages)) {
      return res.status(400).json({ error: 'anthropic.messages required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다' });
    }

    // Forward to Anthropic
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropic)
    });

    const data = await upstream.json().catch(() => ({ error: 'upstream non-JSON response' }));
    return res.status(upstream.status).json(data);
  } catch (e) {
    console.error('admin-ai handler error:', e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
