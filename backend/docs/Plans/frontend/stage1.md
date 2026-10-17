# Stage 1 — Copy, install, and run dev servers

**Goal:** Get the ScalarAI React/Vite frontend running inside Cotrade's repo and talking to Cotrade backend, with no backend edits.

**Prerequisite:** Cotrade backend runs (`python run.py`) and Vite/Node available (`node --version`, `npm --version`).

## 1.1 Replace the frontend folder

```powershell
Remove-Item -Recurse -Force C:\Users\faarh\Workspaces\Custom-apps\Cotrade\frontend
Copy-Item -Recurse C:\Users\faarh\Workspaces\Custom-apps\scalarai\frontend C:\Users\faarh\Workspaces\Custom-apps\Cotrade\frontend
```

Verify the copy:

```powershell
Get-ChildItem C:\Users\faarh\Workspaces\Custom-apps\Cotrade\frontend
# expect: index.html, package.json, tsconfig.json, vite.config.ts, src/, dist? (no node_modules)
```

## 1.2 Install dependencies

```powershell
cd C:\Users\faarh\Workspaces\Custom-apps\Cotrade\frontend
npm install
```

This installs React 19, Vite 6, Tailwind v4, etc. from `frontend/package.json`. Cotrade root has no node_modules; keep deps inside `frontend/`.

## 1.3 Vite config tweaks (frontend only)

Edit `frontend/vite.config.ts`:

- Remove or comment the `/api` proxy block (Cotrade has no `/api` prefix).
- Keep `outDir: path.resolve(__dirname, '../dist')` (or `frontend/dist`).
- Keep `emptyOutDir: false`.

```ts
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), ... } },
  server: { hmr: false, watch: null },
  build: { outDir: path.resolve(__dirname, '../dist'), emptyOutDir: false },
}));
```

## 1.4 Dev base URL

Create `frontend/.env`:

```
VITE_COTRADE_URL=http://localhost:3000
```

## 1.5 API base change

In `frontend/src/services/api.ts`, change:

```ts
const API_BASE = "/api";
```

to

```ts
const API_BASE = import.meta.env.VITE_COTRADE_URL || "http://localhost:3000";
```

(Stage 2 will replace most calls with the adapter; this keeps early calls working.)

## 1.6 Unified dev command (optional, recommended)

Instead of two terminals, add to root `package.json`:

```json
"scripts": {
  "dev": "concurrently -n backend,frontend -c blue,green \"python run.py\" \"npm --prefix frontend run dev\"",
  "dev:backend": "python run.py",
  "dev:frontend": "npm --prefix frontend run dev"
}
```

Install `concurrently` at root (`npm i -D concurrently`), then `npm run dev`.

Alternatively enable Vite HMR by removing `hmr: false` / `watch: null` from `vite.config.ts` for better DX.

## 1.6 Run dev servers (two terminals) (fallback)

Terminal 1 (backend, unchanged):

```powershell
cd C:\Users\faarh\Workspaces\Custom-apps\Cotrade
python run.py
# Cotrade on http://localhost:3000, CONY_AUTO_CONNECT defaults true
```

Terminal 2 (frontend):

```powershell
cd C:\Users\faarh\Workspaces\Custom-apps\Cotrade\frontend
npm run dev
# Vite on http://localhost:5173
```

## 1.7 Verify connectivity

- Open `http://localhost:5173` — page should render (React shell).
- In browser DevTools, `fetch("http://localhost:3000/health")` should return `{ status: "ok", ... }`.
- Cotrade's default CORS is `*`, so no CORS errors expected.

## 1.8 Known issues at this stage

- The app will show errors because `/api/*` endpoints don't exist on Cotrade yet; that's expected until Stage 2+.
- MT5 connection: if Cotrade can't connect, `/health.mt5_connected=false`; data will be empty but UI still renders.

## Success criteria

- Vite dev server serves the copied ScalarAI UI without build errors.
- `npm run dev` runs cleanly (TypeScript may warn; ignore for now).
- Browser can reach Cotrade `/health` cross-origin.