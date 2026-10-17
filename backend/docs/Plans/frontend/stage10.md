# Stage 10 — Repurpose Downloads → About; remove missing features

**Goal:** Remove ScalarAI features that have no Cotrade equivalent (EA bridge, MCP, GitHub sync, web-request test) and repurpose the Downloads tab into an informational "About / How Cotrade works" page.

**Depends on:** Stages 2-9 (core data working).

## 10.1 Repurpose DownloadsCenter into About page

Replace `components/downloads/DownloadsCenter.tsx` usage in `App.tsx` with a simple About component (inline in App.tsx or new `components/About.tsx`) containing static content:

- Title: "About Cotrade"
- Sections:
  - What is Cotrade: MetaTrader 5 gateway, real-time trading dashboard, research analytics, algorithmic strategy engine.
  - How it works: Python drives MT5 via official package; exposes REST API, research API, SSE streams; vanilla→React dashboard.
  - Architecture: daemon (sockets) -> server (routing) -> cony (MT5 engine); SQLite DB; research lab; bot sessions.
  - Data flow: `/stream/portfolio`, `/stream/ticks`, `/stream/marketbook`; REST endpoints; `/research/*`; `/bot/*`; `/db/*`.
  - Links: `/health`, `/routes`, `/enums`, `/metrics`.
- Optional live status: fetch `/health` and `/db/stats` to show MT5 connection + DB counts.

## 10.2 Remove BridgeConsole (MCP)

- Remove `import { BridgeConsole }` and its tab render in `App.tsx`.
- Remove "bridge" from TabBar tabs array.
- Delete `components/bridge/BridgeConsole.tsx` (or leave unused).

## 10.3 Remove WebRequestTest

`SettingsForm` props include `webRequestStatus`, `isVerifyingWebRequest`, `onTriggerWebRequestTest`. After removal, either:
- Keep props but pass `null` / no-op, or
- Edit `SettingsForm.tsx` to remove those props and the test button.

Recommended: edit `SettingsForm.tsx` to drop `webRequestStatus`, `isVerifyingWebRequest`, `onTriggerWebRequestTest`, and the `WebRequestTest` subcomponent. Simpler and avoids dead UI.

- Remove `WebRequestTest` component usage in `SettingsForm`.
- Remove `triggerWebRequestTest` and webrequest status polling from `useSettings` (or leave stubbed).
- Remove `isVerifyingWebRequest` / `webRequestStatus` from settings state if unused.

## 10.4 Remove GitHub sync/status/logout

- Remove buttons and calls to `/api/github-status`, `/api/sync-from-github`, `/api/auth/github/logout` in `SettingsForm` / `App.tsx`.

## 10.5 Remove useDownloadBridge / mql5_generator

- Remove `useDownloadBridge` import and usage in `App.tsx`.
- Remove `downloadNodejsBridge` prop from `DownloadsCenter` (now About).
- Delete or leave `hooks/useDownloadBridge.ts` and `lib/mql5_generator.ts` unused.

## 10.6 Remove useAiStudyFeed (or stub)

- Option A (recommended): remove `AiStudyFeed` banner from home tab and delete `useAiStudyFeed` usage. Keep `KnowledgeBase` fed from `/research/stored`.
- Option B: stub `useAiStudyFeed` to return calibrating state without fetching.

## 10.7 Logs tab

- Cotrade has no log stream. Options:
  - Hide Logs tab.
  - Feed from `/db/*` or `/bot/sessions/{id}/logs` (poll). Simpler: hide tab for now.

## 10.8 TabBar final tabs

```ts
tabs={[
  { id: "home", label: "Live Trading", icon: Home, badge: `$${currentPrice.toFixed(1)}` },
  { id: "symbols", label: "Symbols", icon: ... },
  { id: "risk", label: "Risk & Strategy", icon: Sliders, badge: config.selectedStrategy },
  { id: "history", label: "History", icon: ... },
  { id: "bot", label: "Bot & Database", icon: ... },
  { id: "about", label: "About", icon: ... },
  { id: "logs", label: "System Logs", icon: Terminal, badge: `${logs.length}` }, // optional
  { id: "settings", label: "Settings", icon: Settings },
]}
```

## 10.9 Clean imports

Remove unused imports in `App.tsx`: `BridgeConsole`, `DownloadsCenter`, `WebRequestTest`, `useDownloadBridge`, `useAiStudyFeed` (if removed), `useWebSocket`.

## 10.10 Verification

- No 404s for removed `/api/*` endpoints.
- About page renders static content + live health/DB stats.
- All remaining tabs functional.

## Success criteria

- No references to EA/bridge/MCP/GitHub/web-request in active code paths.
- App builds (`npm run lint`) with no errors.