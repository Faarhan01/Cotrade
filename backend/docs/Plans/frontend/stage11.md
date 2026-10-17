# Stage 11 — Production build + serving (without backend edits)

**Goal:** Produce a production build of the adapted frontend and serve it, keeping Cotrade backend untouched.

**Depends on:** Stages 1-10 (feature-complete frontend).

## 11.1 Build

```powershell
cd C:\Users\faarh\Workspaces\Custom-apps\Cotrade\frontend
npm run build
# Vite builds to ../dist (or frontend/dist per config)
```

Verify output exists:

```powershell
Get-ChildItem C:\Users\faarh\Workspaces\Custom-apps\Cotrade\dist
# expect index.html + assets/
```

## 11.2 Environment for production

Set `VITE_COTRADE_URL` to the real Cotrade origin at build time (e.g. in `frontend/.env.production`):

```
VITE_COTRADE_URL=http://<cotrade-host>:3000
```

Rebuild after changing.

## 11.3 Serving options (no backend edits)

Since Cotrade's `frontconnect` module only serves `pages/partials/assets` (vanilla), and we are not editing the backend, choose one:

**Option A — Separate static server (recommended, zero backend changes):**
Serve `dist/` with any static server (e.g. `npx serve dist`, nginx, IIS). API calls go to Cotrade origin via `VITE_COTRADE_URL`. Cotrade's CORS is `*` by default.

**Option B — Vite preview:**
```powershell
cd frontend; npm run preview
```
Serves the built SPA on its own port; API calls point to Cotrade.

**Option C — Cotrade origin (requires one small backend edit, deferred):**
Modify `core/frontconnect/assets.py` + `__init__.py` to serve `dist/index.html` as SPA fallback for unknown paths. This is the only way to host on the same origin. Defer until after validation; document as optional.

## 11.3b Production environment

Set at build time (`frontend/.env.production`):
```
VITE_COTRADE_URL=https://<cotrade-host>:3000
```
Set on Cotrade backend:
```
CONY_CORS_ORIGIN=https://<frontend-origin>   # not *
CONY_ENV=production
```

## 11.4 Cache / CORS notes:

- Cotrade sends `Access-Control-Allow-Origin: *` by default. For production with credentials, set `CONY_CORS_ORIGIN` to the frontend origin.
- Static assets: Vite hashes filenames, so long cache is safe. Cotrade's own assets use `no-cache`; not relevant for separate static server.

## 11.5 Verification checklist

- [ ] `npm run build` succeeds with no TypeScript errors.
- [ ] `dist/index.html` exists and references hashed assets.
- [ ] Serving `dist/` loads the app.
- [ ] All tabs functional against Cotrade backend.
- [ ] No `/api/*` 404s in network tab.
- [ ] Live SSE streams connect.
- [ ] Trade actions work.
- [ ] `git diff` touches `frontend/` plus backend improvements (see preparation.md).

## Success criteria

- Production build runs standalone against Cotrade backend.
- No backend files modified.