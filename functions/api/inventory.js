// Cloudflare Pages Function — handles /api/inventory
// GET  is public (anyone can read inventory)
// PUT  requires correct X-Edit-Password header
//
// Requires KV namespace binding: STORAGE_KV
// Requires env var: EDIT_PASSWORD (defaults to "rain" if unset)

const KEY = 'inventory';

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.STORAGE_KV) {
    return json({ error: 'Server missing STORAGE_KV binding' }, 500);
  }
  try {
    const raw = await env.STORAGE_KV.get(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return json(data, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return json({ error: 'Read failed', detail: String(e) }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!env.STORAGE_KV) {
    return json({ error: 'Server missing STORAGE_KV binding' }, 500);
  }

  const password = request.headers.get('X-Edit-Password') || '';
  const expected = env.EDIT_PASSWORD || 'rain';
  if (password !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Basic shape validation — must be an object (boxes keyed by id)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json({ error: 'Inventory must be an object keyed by box id' }, 400);
  }

  // Cap payload size (defensive)
  const serialized = JSON.stringify(body);
  if (serialized.length > 1_000_000) {
    return json({ error: 'Inventory too large' }, 413);
  }

  try {
    await env.STORAGE_KV.put(KEY, serialized);
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'Write failed', detail: String(e) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Edit-Password',
    },
  });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}
