# storage.katr.es

Personal storage inventory · Studio Katresai

A mobile-first website that mirrors your physical storage unit. Each numbered box on the site corresponds to a real cardboard box. Scan the QR code on a box → tap that box on the site → see its contents. Ask the AI where something is and it'll tell you which box.

**Runs entirely on Cloudflare's free tier.** Pages hosts the site, KV stores the inventory, Workers AI answers questions. Zero external API keys, zero monthly cost.

## Files

```
.
├── index.html                    ← the whole site (single file, no build step)
├── functions/
│   └── api/
│       ├── inventory.js          ← GET (public) + PUT (password) inventory
│       ├── verify.js             ← validates edit password
│       └── ask.js                ← AI endpoint (uses Workers AI)
└── README.md
```

## Deploy to Cloudflare Pages

### 1. Push to GitHub
Commit these files at the repo root.

### 2. Create a KV namespace
- Cloudflare dashboard → **Workers & Pages** → **KV** → **Create namespace**
- Name it `storage-locker-kv` (or whatever). You'll bind it by name, not ID.

### 3. Create the Pages project
- **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
- Pick your repo.
- **Build settings:**
  - Framework preset: `None`
  - Build command: *(leave empty)*
  - Build output directory: `/`
- Click **Save and Deploy**. First deploy will succeed but the API endpoints will error until you finish steps 4–6.

### 4. Bind KV to the Pages project
- Project → **Settings** → **Bindings** → **Add** → **KV namespace**
- **Variable name:** `STORAGE_KV` (must match exactly)
- **KV namespace:** the one you created in step 2
- Add for **Production** *and* **Preview** environments.

### 5. Bind Workers AI to the Pages project
- Same Bindings page → **Add** → **Workers AI**
- **Variable name:** `AI` (must match exactly)
- No namespace selection — Workers AI is account-wide.
- Add for **Production** *and* **Preview**.

### 6. Set environment variables
- Project → **Settings** → **Variables and Secrets**
- Add (Production *and* Preview):
  - `EDIT_PASSWORD` = `rain` (or whatever you want)
  - (optional) `LLM_MODEL` = `@cf/meta/llama-3.1-8b-instruct-fast` *(default if unset)*

### 7. Redeploy
Trigger a redeploy so the new bindings take effect. From the Deployments tab → **Retry deployment**, or push any small change.

### 8. Custom domain
Project → **Custom domains** → add `storage.katr.es`. Cloudflare auto-configures DNS since `katr.es` is already on Cloudflare.

Done. Every push to `main` redeploys automatically.

## Free tier limits

You're well inside the free tier for personal use:

- **Cloudflare Pages:** unlimited requests, 500 builds/month — way more than you'll use.
- **KV:** 1,000 writes/day + 100,000 reads/day — even heavy editing won't approach this.
- **Workers AI:** 10,000 neurons/day. The default Llama 3.1 8B model uses ~400 neurons per call, giving you roughly 20–25 questions/day. Plenty for finding things in a storage unit. If you want to upgrade for free-tier headroom, swap `LLM_MODEL` (see below).

No credit card required at any stage.

## Choosing a different model

The `LLM_MODEL` env var sets which Workers AI model handles `/api/ask`. Options:

| Model | Quality | Speed | Neurons/call |
|---|---|---|---|
| `@cf/meta/llama-3.1-8b-instruct-fast` (default) | Good | Fast | ~400 |
| `@cf/meta/llama-3.1-8b-instruct` | Good | Medium | ~400 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Better | Slower | ~1500 |
| `@cf/mistral/mistral-7b-instruct-v0.1` | OK | Fast | ~350 |

The 8B fast variant is the sweet spot for a storage inventory app — responses are quick and quality is plenty for "where's my winter coat?" type questions.

## How it works

- **Public read.** `GET /api/inventory` is open — anyone with the URL can see your boxes. The QR code on each physical box points to the site root.
- **Protected write.** `PUT /api/inventory` requires the `X-Edit-Password` header. Without it, nothing can be modified.
- **Verify endpoint.** When you tap the pencil and enter the password, the site posts to `/api/verify` to check it server-side. The password is never stored in the page source.
- **Session.** Once verified, the password is kept in your browser's `sessionStorage` so you don't get re-prompted until you close the tab.
- **AI.** `/api/ask` reads the latest inventory from KV and sends it (plus your question) to Workers AI. No external APIs, no keys, no Anthropic.

## QR codes

Point the QRs on your physical boxes at the site root:
```
https://storage.katr.es
```

If you ever want a QR to open directly to a specific box, the URL is:
```
https://storage.katr.es/#box-12
```

## Editing

- Tap the **pencil** in the bottom nav → password modal → enter your `EDIT_PASSWORD`.
- The pencil becomes "Done" while editing. Tap again to exit.
- Every change auto-saves to KV. "Saving…" appears in the header during requests.
- If a save fails, you'll see a "Sync error" toast and can retry by editing again.

## Local dev

```bash
npx wrangler pages dev . --kv STORAGE_KV --ai AI
```

Add a `.dev.vars` file for the password:
```
EDIT_PASSWORD=rain
```

Note: Workers AI hits your live Cloudflare account even in local dev (and counts against your free tier).

## Notes

- **Public read is the default.** Don't put anything you wouldn't want strangers seeing into the inventory. If you ever want to lock down read access too, change `onRequestGet` in `inventory.js` to require the password header.
- **Concurrent edits.** If you edit on two devices simultaneously, last write wins. For one person this is fine.
