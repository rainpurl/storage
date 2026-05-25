// Cloudflare Pages Function — handles POST /api/ask
// Uses Cloudflare Workers AI (free tier, no API keys, no external calls).
// Reads inventory from KV server-side, sends it to the model with the user's question.
//
// Requires bindings:
//   - KV namespace: STORAGE_KV
//   - AI:           AI
// Optional env var:
//   - LLM_MODEL  (defaults to @cf/meta/llama-3.1-8b-instruct-fast)

const SYSTEM_PROMPT = `You help a person find items in their personal storage unit. They will ask where something is or what is in a box. Use ONLY the inventory provided — never invent items.

Response rules:
- If you find a match: "That's in Box 12 ('Kitchen ceramics')." Always say "Box <id>" with the exact id so it can be tapped.
- If multiple boxes match, list them briefly.
- If nothing matches, say so honestly. Suggest related items if any are present.
- Treat each box's description as additional context — items mentioned in the description count as being in that box.
- Be brief and conversational. Never dump the whole inventory.
- If user asks a question that is not related to the storage unit or asking where an item is, return the verbatim response: "Please don't waste my tokens with unrelated questions. Ask about the storage."
- Never invent item names. If the inventory is empty, say so.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.AI) {
    return json({ error: 'Server missing AI binding' }, 500);
  }
  if (!env.STORAGE_KV) {
    return json({ error: 'Server missing STORAGE_KV binding' }, 500);
  }

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const question = (body?.question || '').trim();
  if (!question) return json({ error: 'Missing "question"' }, 400);

  // Pull current inventory from KV
  let boxes = {};
  try {
    const raw = await env.STORAGE_KV.get('inventory');
    if (raw) boxes = JSON.parse(raw);
  } catch {
    return json({ error: 'Inventory read failed' }, 500);
  }

  const inventoryText = formatInventory(boxes);
  const userContent = `INVENTORY:\n\n${inventoryText}\n\n---\n\nQUESTION: ${question}`;

  const model = env.LLM_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast';

  try {
    const result = await env.AI.run(model, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 512,
    });

    // Workers AI returns { response: "..." } for text models
    const answer =
      (typeof result === 'string' ? result : null) ||
      result?.response ||
      result?.result?.response ||
      '';

    return json({
      answer: answer.trim() || "Hmm, I couldn't form a response. Try rephrasing?",
    });
  } catch (e) {
    return json({ error: 'AI call failed', detail: String(e) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function formatInventory(boxes) {
  const values = Object.values(boxes || {});
  if (values.length === 0) return '(no boxes in inventory yet)';
  values.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
  return values.map((b) => {
    const head = `Box ${b.id}${b.label ? ' — "' + b.label + '"' : ''}${b.description ? ' [' + b.description + ']' : ''}`;
    const items = (b.items || [])
      .map((it) => `  • ${it.name}${it.notes ? ' (' + it.notes + ')' : ''}`)
      .join('\n');
    return head + (items ? '\n' + items : '\n  (empty)');
  }).join('\n\n');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
