# Deploying the portal on Vercel

Vercel hosts the **static portal** in `frontend/`. The backend is a separate
long-running Node service with SQLite and a media directory, so it cannot run on
Vercel's stateless functions without changing its storage layer.

The repository root contains [`vercel.json`](../vercel.json), which builds the
portal and rewrites client-side routes to `index.html`.

## 1. Import the repository

1. In Vercel, choose **Add New → Project** and import
   `baala-codes/Rent-olana`.
2. Keep **Root Directory** at the repository root. Do **not** select `frontend/`:
   the build needs `clients/`, `shared/`, and the root dependencies.
3. Vercel reads `vercel.json` and uses:
   - install: `npm ci && npm ci --prefix frontend`
   - build: `npm --prefix frontend run build`
   - output: `frontend/dist`
4. Select Node **22.x** (the repository's tooling targets Node 22).

## 2. Set the backend URL

Add an environment variable in **Project → Settings → Environment Variables**:

```text
VITE_API_URL=https://your-backend.example.com
```

`VITE_API_URL` is embedded at build time. Changing it requires a redeploy.

If it is unset, the portal defaults to `http://<the-page-host>:8787`. That works
only when a backend is listening on the same host, which is not true on Vercel.
Without a reachable backend the portal still reads listings from Solana RPC, but
names, photos, and shared media fall back to the current browser only.

## 3. Host the backend separately

The repository's [`backend/Dockerfile`](../backend/Dockerfile) is ready for a
host that supports a persistent volume (Render, Fly.io, Railway, a VPS, or
Docker Compose). It already sets `HOST=0.0.0.0` and stores state under `/data`.

Required settings:

| Variable | Value |
| --- | --- |
| `CORS_ORIGINS` | `https://<your-project>.vercel.app` (comma-separate preview domains if needed) |
| `ADMIN_TOKEN` | a long random value, only if you need `/v1/admin/*` |
| `SYNC_ON_START` | `1` |
| `SYNC_INTERVAL_MS` | `60000` (or your preferred cadence) |
| `RPC_URL` | `https://api.devnet.solana.com` |
| `NOTIFY_WEBHOOK_URL` | optional |

Mount a persistent volume at `/data`. The reflected chain rows can be rebuilt,
but **metadata documents and uploaded media cannot** — back up that volume.

Then set `VITE_API_URL` in Vercel to the backend's public HTTPS URL.

## 4. Local check

```bash
npm --prefix frontend run build
# output: frontend/dist
```

The SPA rewrite is only needed on the host; Vite's dev server already handles it.

## 5. Fully serverless backend (optional, larger change)

To keep everything on Vercel, the backend must stop using local SQLite and the
local filesystem:

- Postgres for listings, metadata, and media rows.
- Object storage (S3/R2/Supabase Storage/Vercel Blob) for images.
- A Vercel Function entry point replacing `backend/src/server.ts`.

That is an architecture change, not a configuration change. The current
Dockerfile plus a persistent volume is the low-risk path.
