# Preparation — Backend readiness & unified dev workflow

**Goal:** Prepare Cotrade's backend and dev workflow so the copied ScalarAI frontend integrates seamlessly, with both dev servers starting from one root command. Includes optional backend improvements.

**Scope:** This doc proposes changes (mostly optional) to backend and root tooling. The core frontend swap (Stages 1-11) does not require them, but they make dev/prod smoother.

---

## 1. Current workflow gaps

- Root `package.json` only runs Python (`"dev": "python3 app.py"`). There is no Node/Vite step.
- `dev-server.sh` starts only the Python backend and even assumes bash/lsof (poor on Windows).
- `frontend/` (after swap) is a Vite app needing `npm install` + `npm run dev`.
- Running both today means two terminals and manual URL management.
- Cotrade backend already supports CORS `*` and SSE, so cross-origin dev works, but there is no single entry point.

---

## 2. Proposed unified dev command (root)

### Option A — Node-based orchestration (recommended, cross-platform)

Add a root `package.json` (or update existing) with `concurrently`:

```json
{
  "name": "cotrade",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "concurrently -n backend,frontend -c blue,green \"python run.py\" \"npm --prefix frontend run dev\"",
    "dev:backend": "python run.py",
    "dev:frontend": "npm --prefix frontend run dev",
    "build:frontend": "npm --prefix frontend run build",
    "start": "python app.py",
    "lint": "python -m compileall app.py run.py backend"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

Usage:

```powershell
npm install          # root, installs concurrently
npm run dev          # starts backend :3000 + Vite :5173
```

Pros: simple, familiar, works on Windows/macOS/Linux. Cons: adds a Node dependency at root.

### Option B — Extend `run.py` to spawn Vite

Modify `run.py` `cmd_server`/`cmd_dev` to optionally start Vite when `frontend/package.json` exists:

```python
# in cmd_server, after starting backend thread or before serve_forever:
import subprocess, os, threading
frontend_dir = os.path.join(_root, "frontend")
if os.path.exists(os.path.join(frontend_dir, "package.json")):
    env = dict(os.environ, VITE_COTRADE_URL=f"http://localhost:{port}")
    proc = subprocess.Popen(["npm", "run", "dev"], cwd=frontend_dir, env=env, shell=True)
    # register cleanup on exit
```

Pros: keeps Python as single entry point (matches current `python run.py`). Cons: process management complexity, signal handling on Windows.

### Option C — PowerShell/batch wrapper (Windows-first)

Create `dev.ps1`:

```powershell
$backend = Start-Process python -ArgumentList "run.py" -PassThru
$frontend = Start-Process npm -ArgumentList "run","dev" -WorkingDirectory "frontend" -PassThru
Wait-Process -Id $backend.Id, $frontend.Id
```

**Recommendation:** Option A for cross-platform simplicity, with Option B as the "python-only" alternative for users who don't want Node at root. Provide both; default to Option A.

### Frontend Vite HMR

ScalarAI's `vite.config.ts` sets `hmr: false` and `watch: null` (to avoid file-watcher issues). For dev, consider enabling HMR by removing those lines or making them conditional on `NODE_ENV`. This is a frontend edit but improves DX significantly.

---

## 3. Backend improvements (optional, recommended)

These are **not** required for the swap but make integration seamless. Each is an optional backend edit.

### 3.1 CORS hardening for production

Current: `CONY_CORS_ORIGIN=*` default. For production with the frontend on a different origin, set `CONY_CORS_ORIGIN=https://your-frontend-origin`. The `_headers` method in `deamon/__main__.py` already reads this env var. No code change needed — just document and default to a stricter value when `CONY_ENV=production`.

### 3.2 SPA static serving (optional, for same-origin hosting)

Currently `core/frontconnect` serves `pages/partials/assets` only. To host the built SPA on Cotrade's origin (Option C in Stage 11), add to `assets.py`/`__init__.py`:

- Serve files from `frontend/dist/` if present.
- Fallback to `dist/index.html` for unknown GET paths (SPA routing).

This is the only way to avoid a separate static server in production. Defer until after dev validation.

### 3.3 `/api` compatibility shim (optional)

The frontend adapter (Stage 2) removes `/api` prefix calls. If you prefer fewer frontend changes, add a thin router wrapper in `handlers.py`/`plugins.py` that aliases `/api/*` -> `/*` (strip prefix). This lets the copied frontend work with minimal edits but is not necessary. **Not recommended** — the adapter approach is cleaner.

### 3.4 Richer `/health` for frontend status

Add to `/health` response: `frontend_build` version (read from `frontend/dist/index.html` or env), `server_time_utc`. Helps the About page and diagnostics. Small change in `handlers.py`.

### 3.5 Rate limiting (optional)

ScalarAI has `rateLimit` middleware. Cotrade has none. For public deployments, add a simple per-IP token bucket in `GatewayHandler.handle_request` (or middleware). Low priority for local dev.

### 3.6 Optional API key for state-changing routes

ScalarAI gates state-changing routes with `SCALARAI_MCP_API_KEY`. Cotrade gates none. Add optional `CONY_API_KEY` support in `RouteHandlers` that, when set, requires `Authorization: Bearer <key>` on `/order`, `/buy`, `/sell`, `/close`, `/modify`, `/cancel`, `/research/*` POSTs, `/bot/*`, `/db/vacuum`. Frontend stores the key in `localStorage` and sends it. Improves production safety.

### 3.7 SSE improvements

- Add `Last-Event-ID` support for replay on reconnect (currently not implemented). Minor.
- Ensure `/stream/ticks` accepts `symbols` defaulting to open positions (already does via `require_symbols`).
- Consider a combined `/stream/all` for frontend convenience (account + ticks in one connection). Optional; two connections are fine.

### 3.8 Logging & observability

- `logger` already structured. Add request duration to access log.
- Add `/metrics` frontend-related counters (SSE connections, active streams) — already has DB stats; extend.

### 3.9 Database

- Already WAL mode + auto-indexing. Ensure `peron.db` path configurable via `PERON_DB`/`CONY_DB_PATH` (already supported).
- Add a `/db/vacuum` confirmation and progress (currently synchronous; fine for local).

### 3.10 Hot-reload for backend (dev)

Cotrade reads frontend files from disk on every request (no restart needed for HTML/CSS/JS). Python backend changes require restart. For dev, use `watchdog` or `uvicorn`-style reloader? Not trivial with stdlib server. Document: restart backend on Python changes. Frontend changes hot-reload via Vite.

---

## 4. Environment variables to add/document

Add to `.env.example` and docs:

```
# Frontend dev (used by Vite)
VITE_COTRADE_URL=http://localhost:3000

# Backend
CONY_FRONTEND_DEV_URL=http://localhost:5173   # for CORS allow-list in dev
CONY_API_KEY=                                 # optional, gates state-changing routes
CONY_ENV=development                          # development | production
```

In production, set `CONY_CORS_ORIGIN` to the frontend origin (not `*`).

---

## 5. Preparation checklist (before Stage 1)

- [ ] Node 18+ and npm installed (`node --version`).
- [ ] Python 3.11+ with MetaTrader5 package (already).
- [ ] MT5 terminal installed and logged in (for live data; optional for UI dev with `CONY_AUTO_CONNECT=false`).
- [ ] Choose unified dev command (Option A recommended) and add to root.
- [ ] Create `frontend/.env` with `VITE_COTRADE_URL`.
- [ ] Decide on optional backend improvements (3.1-3.10) to apply now vs later.
- [ ] Confirm ports free: 3000 (backend), 5173 (Vite).

---

## 6. Recommended application order

1. Apply unified dev command (Option A) — immediate DX win.
2. Enable Vite HMR (frontend edit) — immediate DX win.
3. Apply CORS hardening (3.1) + env docs (section 4).
4. Defer 3.2 (SPA serving), 3.5 (rate limit), 3.6 (API key) until after Stage 10 validation.
5. Apply 3.4 (richer /health) if About page wants build version.

---

## 6.5 Applied backend improvements (executed)

The following backend edits were applied to support the frontend seamlessly:

1. **`/api/*` compatibility shim** — `backend/gateway/deamon/__main__.py` `_dispatch` strips the `/api` prefix before routing, so both `/api/health` and `/health` resolve. `/api/*` 404s return JSON (not SPA HTML).
2. **SPA static serving** — `backend/managers/front_manager/frontconnect/assets.py` now detects `dist/index.html` (Vite build) and serves it plus `dist/assets/*`. `__init__.py` registers `/` and `/ui/{page}` to serve the built index.
3. **SPA fallback** — unknown GET routes serve `dist/index.html` (client-side routing), except `/api/*` and `/stream/*`.
4. **CORS** — unchanged default `*`; set `CONY_CORS_ORIGIN` for production.

These let `python run.py` serve the built React app on the same origin with no separate static server.

## 7. Success criteria

- `npm run dev` from root starts backend + frontend and prints both URLs.
- Backend restart not needed for frontend edits (Vite HMR).
- Python edits require backend restart (documented).
- Production path documented: build frontend, serve static, point at Cotrade origin, set CORS origin.