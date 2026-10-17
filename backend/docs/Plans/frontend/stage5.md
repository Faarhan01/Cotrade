# Stage 5 — Symbols browser (instrument browser)

**Goal:** Wire the Symbols tab to Cotrade's `/symbols/search` and `/symbol/{name}` endpoints instead of fetching all 731 instruments.

**Depends on:** Stage 2 (adapter).

## 5.1 Why search on demand

`/symbols` returns ~731 instruments (~1.5 MB). Cotrade's old frontend never fetches it wholesale; it uses `/symbols/search?q=`. ScalarAI's UI may expect a full list. We must not fetch `/symbols` for the browser view; use search.

## 5.2 Adapter methods

Add to `frontend/src/services/cotrade.ts`:

```ts
export async function searchSymbols(q: string) {
  const data = await cotradeGet(`/symbols/search?q=${encodeURIComponent(q)}`);
  return data.symbols || data.results || [];
}

export async function getSymbol(name: string) {
  return cotradeGet(`/symbol/${encodeURIComponent(name)}`);
}

export async function selectSymbol(name: string) {
  return cotradePost(`/symbol/${encodeURIComponent(name)}/select`);
}
```

## 5.3 Cotrade symbol search response

`GET /symbols/search?q=EUR` returns `{ count, query, symbols: [ <full symbol objects> ] }`. Each symbol object includes all MT5 fields plus `_trade_mode` and (on `/symbol/{name}`) `_derived: { pip_size, pip_value_per_lot, lot_info: { min_lot, max_lot, lot_step } }`.

`POST /symbol/{name}/select` body `{ "enable": true }` (optional, default true) returns `{ success, symbol, selected }`. Calls `engine.select_symbol`.

`/symbols/search` returns a filtered list of symbol objects (same shape as `/symbols` entries). Each has `name`, `description`, `bid`, `ask`, `digits`, `point`, `pip_size` (under `_derived`), `spread`, `session_open`, `_trade_mode`, etc.

`/symbol/{name}` returns a single full symbol spec including `_derived` (pip_size, etc.).

## 5.4 Component work

ScalarAI has no dedicated symbols browser component, but `AssetSelector` and `SettingsForm` reference symbols. Options:

- **Option A (recommended):** Add a new "Symbols" tab in `App.tsx` TabBar with a simple search input + detail panel, modeled on Cotrade's `frontend/pages/symbols.html`. Reuse `Card`, `Badge`, `Button` UI components.
- **Option B:** Reuse `AssetSelector` and extend it to show specs.

Minimal implementation for Option A:

```tsx
const [symbolQuery, setSymbolQuery] = useState("");
const [symbolResults, setSymbolResults] = useState<any[]>([]);
const [selectedSymbol, setSelectedSymbol] = useState<any>(null);

async function doSearch() {
  const res = await searchSymbols(symbolQuery);
  setSymbolResults(res);
}
async function openSymbol(name: string) {
  const spec = await getSymbol(name);
  setSelectedSymbol(spec);
  await selectSymbol(name); // marks selected in MT5
  setActiveSymbol(name);
}
```

Render a search box + results list + detail panel showing bid/ask/spread/digits/contract size/swap/etc.

## 5.5 Pip size handling

Pip size comes from `symbol._derived.pip_size` (Cotrade derives it). Do not infer from digits. Cotrade's old frontend used `s.pip_size` from `/symbols` watchlist rows; for detail view use `_derived.pip_size`.

## 5.6 Verification

- Search "EUR" returns EURUSD etc.
- Selecting a symbol fetches full spec and marks it selected.
- Details show correct pip size and spread.

## Success criteria

- Symbols tab functional with search + detail.
- No full `/symbols` fetch for the browser view (only for composed status watchlist, capped at 24).