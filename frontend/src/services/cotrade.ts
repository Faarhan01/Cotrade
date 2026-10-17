const BASE = import.meta.env.VITE_COTRADE_URL || "";

export async function cotradeGet(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function cotradePost(path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export function toTradeRecord(p: any) {
  return {
    ticket: p.ticket,
    type: (p._type || (p.type === 0 ? "buy" : "sell")).toString().toUpperCase(),
    lotSize: p.volume,
    entryPrice: p.price_open,
    sl: p.sl,
    tp: p.tp,
    closePrice: p.price_current,
    profit: p.profit,
    status: "OPEN",
    openTime: new Date((p.time_msc || (p.time || 0) * 1000)).toLocaleString(),
    symbol: p.symbol,
    strategy: p.comment || "",
    reason: p.comment || "",
  };
}

export async function getStatus(): Promise<any> {
  const [health, account, terminal, totals, positions, orders, portfolio, summary, symbols] =
    await Promise.all([
      cotradeGet("/health"), cotradeGet("/account"), cotradeGet("/terminal"),
      cotradeGet("/totals"), cotradeGet("/positions"), cotradeGet("/orders"),
      cotradeGet("/portfolio"), cotradeGet("/history/summary"),
      cotradeGet("/symbols?visible=true"),
    ]);
  const selected = (symbols.symbols || [])
    .filter((s: any) => s.select || s.visible)
    .slice(0, 24);

  return {
    config: {
      isActive: false,
      selectedStrategy: "TREND_FOLLOWING",
      lotSize: 0.1, takeProfitPoints: 300, stopLossPoints: 150,
      trailingStopPoints: 100, useTrailingStop: true, maxTrades: 3,
      isAiModeEnabled: false, tradingMode: "Scalping",
      selectedAssets: selected.map((s: any) => s.name),
      mt5Path: terminal.path, appEndpoint: BASE,
    },
    connection: {
      isEaConnected: !!health.mt5_connected, clientIp: null, lastPing: null,
      broker: account.server, accountNumber: account.login,
      balance: account.balance, symbol: selected[0]?.name ?? null,
      symbolDigits: selected[0]?.digits ?? null,
      symbolTickSize: selected[0]?.trade_tick_size ?? null,
      symbolDescription: selected[0]?.description ?? null,
    },
    isBridgeConnected: !!health.mt5_connected,
    logs: [],
    trades: (positions.positions || []).map(toTradeRecord),
    history: [],
    status: health.status || "ok",
    currentPrice: selected[0]?.bid ?? 0,
    activeSymbol: selected[0]?.name ?? "",
    symbolStates: selected.map((s: any) => ({
      symbol: s.name, connection: health.connection,
      currentPrice: s.bid, tickCount: 0,
    })),
    aiSynthesizedStrategy: null,
    terminal: terminal,
    account: account,
    stats: {
      totalProfit: summary.realized_profit ?? 0,
      tradesCount: summary.deal_count ?? 0,
      winRate: 0,
      activePositionsCount: positions.count ?? (positions.positions || []).length,
      lastHeartbeatTime: null,
    },
    webRequestStatus: null,
  };
}

export async function getCandles(symbol: string, limit = 1000, timeframe = "M1") {
  const data = await cotradeGet(`/candles/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}&count=${limit}`);
  return { candles: data.candles || [] };
}

export async function getStrategies() {
  const data = await cotradeGet("/research/stored");
  return data.strategies || [];
}

export async function switchSymbol(symbol: string) {
  try { await cotradePost(`/symbol/${encodeURIComponent(symbol)}/select`, { enable: true }); } catch {}
  return { success: true, activeSymbol: symbol };
}

export async function searchSymbols(q: string) {
  const data = await cotradeGet(`/symbols/search?q=${encodeURIComponent(q)}`);
  return data.symbols || [];
}

export async function getSymbol(name: string) {
  return cotradeGet(`/symbol/${encodeURIComponent(name)}`);
}

export async function selectSymbol(name: string) {
  return cotradePost(`/symbol/${encodeURIComponent(name)}/select`, { enable: true });
}

export async function getHistoryDeals(days = 7) {
  const data = await cotradeGet(`/history/deals?days=${days}`);
  return { count: data.count, deals: data.deals || [] };
}

export async function getHistorySummary(days = 7) {
  return cotradeGet(`/history/summary?days=${days}`);
}

export async function getHistoryTotals(days = 7) {
  return cotradeGet(`/history/totals?days=${days}`);
}

export async function getHistoryOrders(days = 7) {
  return cotradeGet(`/history/orders?days=${days}`);
}

export async function getResearchStored() { const d = await cotradeGet("/research/stored"); return d.strategies || []; }
export async function getResearchStrategy(name: string) { return cotradeGet(`/research/strategy/${encodeURIComponent(name)}`); }
export async function getResearchLibrary() { return cotradeGet("/research/library"); }
export async function getResearchCatalogue() { return cotradeGet("/research/catalogue"); }
export async function getResearchIndicators() { return cotradeGet("/research/indicators"); }
export async function getResearchPatterns() { return cotradeGet("/research/patterns"); }
export async function getResearchStrategies() { return cotradeGet("/research/strategies"); }
export async function runBacktest(body: any) { return cotradePost("/research/backtest", body); }
export async function runSweep(body: any) { return cotradePost("/research/sweep", body); }
export async function scanPatterns(body: any) { return cotradePost("/research/patterns/scan", body); }
export async function runIndicator(body: any) { return cotradePost("/research/indicator", body); }
export async function getReportsBest() { return cotradeGet("/research/reports/best"); }

export async function getBotStatus() { return cotradeGet("/bot/status"); }
export async function getBotRunning() { return cotradeGet("/bot/running"); }
export async function getBotStrategies() { return cotradeGet("/bot/strategies"); }
export async function getBotSessions(limit = 50) { return cotradeGet(`/bot/sessions?limit=${limit}`); }
export async function getBotSession(id: string) { return cotradeGet(`/bot/sessions/${encodeURIComponent(id)}`); }
export async function getBotSessionLogs(id: string, limit = 200) { return cotradeGet(`/bot/sessions/${encodeURIComponent(id)}/logs?limit=${limit}`); }
export async function getBotSignal(strategy: string, symbol: string, timeframe = "M1", bars = 500) {
  return cotradeGet(`/bot/signal?strategy=${encodeURIComponent(strategy)}&symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&bars=${bars}`);
}
export async function startBot(body: any) { return cotradePost("/bot/start", body); }
export async function stepBot(body?: any) { return cotradePost("/bot/step", body || {}); }
export async function pauseBotSession(id: string) { return cotradePost(`/bot/sessions/${encodeURIComponent(id)}/pause`); }
export async function resumeBotSession(id: string) { return cotradePost(`/bot/sessions/${encodeURIComponent(id)}/resume`); }
export async function stopBotSession(id: string, body?: any) { return cotradePost(`/bot/sessions/${encodeURIComponent(id)}/stop`, body || {}); }
export async function createBotSession(body: any) { return cotradePost("/bot/sessions", body); }
export async function getReportTrades(runId: string) { return cotradeGet(`/db/trades/${encodeURIComponent(runId)}`); }

export async function getDbStats() { return cotradeGet("/db/stats"); }
export async function getDbReports(limit = 50, strategy?: string, verdict?: string) {
  let url = `/db/reports?limit=${limit}`;
  if (strategy) url += `&strategy=${encodeURIComponent(strategy)}`;
  if (verdict) url += `&verdict=${encodeURIComponent(verdict)}`;
  return cotradeGet(url);
}
export async function getDbIntegrity() { return cotradeGet("/db/integrity"); }
export async function getDbSessions(limit = 25) { return cotradeGet(`/db/sessions?limit=${limit}`); }
export async function vacuumDb() { return cotradePost("/db/vacuum"); }

export async function buyOrder(body: any) { return cotradePost("/buy", body); }
export async function sellOrder(body: any) { return cotradePost("/sell", body); }
export async function closePosition(body: any) { return cotradePost("/close", body); }
export async function closeAll(body?: any) { return cotradePost("/close-all", body || {}); }
export async function modifyPosition(body: any) { return cotradePost("/modify", body); }
export async function cancelOrder(body: any) { return cotradePost("/cancel", body); }
export async function checkOrder(body: any) { return cotradePost("/order/check", body); }
export async function placeOrder(body: any) { return cotradePost("/order", body); }
export async function calcMargin(body: any) { return cotradePost("/calc/margin", body); }
export async function calcProfit(body: any) { return cotradePost("/calc/profit", body); }
export async function calcSize(body: any) { return cotradePost("/calc/size", body); }
export async function getMarketbook(symbol?: string) { return cotradeGet(`/marketbook/${encodeURIComponent(symbol || "")}`); }
export async function getHealth() { return cotradeGet("/health"); }
export async function getAccount() { return cotradeGet("/account"); }
export async function getTerminal() { return cotradeGet("/terminal"); }
export async function getTotals() { return cotradeGet("/totals"); }
export async function getPositions() { return cotradeGet("/positions"); }
export async function getOrders() { return cotradeGet("/orders"); }
export async function getPortfolio() { return cotradeGet("/portfolio"); }
export async function getSymbols() { return cotradeGet("/symbols"); }