import { Router } from 'express';
import { tradeStore } from '../services/tradeStore.js';
import { broadcast } from '../services/websocketServer.js';
import { EASyncPayload, EASyncResponse } from '../types/mt5.js';

export const mt5Router = Router();

// Health check and handshake endpoint for MT5 EA WebRequest verification
mt5Router.get(['/health', '/api/mt5/health', '/handshake', '/api/mt5/handshake'], (req, res) => {
  res.json({
    status: 'ok',
    bridge: 'AI MT5 Bridge Service',
    version: '2.10',
    timestamp: Date.now(),
    port: 7777,
    mcpEndpoint: 'http://127.0.0.1:3000/api/mcp',
  });
});

// Primary high-frequency synchronization endpoint called by MT5 EA
mt5Router.post(['/sync', '/api/mt5/sync'], (req, res) => {
  const payload: EASyncPayload = req.body;

  if (!payload) {
    return res.status(400).json({ status: 'error', message: 'Missing sync payload' });
  }

  // Optional API-key check. When BRIDGE_API_KEY is configured, the EA must
  // send a matching key (it already does via InpApiKey). When unset, the
  // bridge stays open for backwards compatibility with older EA builds.
  const expectedKey = (process.env.BRIDGE_API_KEY || '').trim();
  if (expectedKey && payload.apiKey !== expectedKey) {
    return res.status(401).json({ status: 'error', message: 'Invalid or missing API key.' });
  }

  // Process EA incoming state (account, positions, ticks, results, currentChart, allSymbols)
  const commandsToExecute = tradeStore.handleEASync(payload);

  // Broadcast live updates immediately to connected web terminals
  broadcast({
    type: 'ea:sync',
    payload: {
      account: tradeStore.getAccount(),
      positions: tradeStore.getPositions(),
      ticks: tradeStore.getTicks(),
      currentChart: tradeStore.getCurrentChart(),
      allSymbols: tradeStore.getAllSymbols(),
      chartHistory: tradeStore.getChartHistory(),
      connection: tradeStore.getState().connection,
      isEaConnected: true,
      lastEaSync: Date.now(),
    },
  });

  const response: EASyncResponse = {
    status: 'ok',
    serverTime: Math.floor(Date.now() / 1000),
    commands: commandsToExecute,
    riskGuard: tradeStore.getRiskGuard(),
  };

  res.json(response);
});

// Direct execution result reporting
mt5Router.post(['/result', '/api/mt5/result'], (req, res) => {
  const result = req.body;
  if (result && result.commandId) {
    tradeStore.resolveExecutionResult(result);
    broadcast({
      type: 'command:result',
      payload: result,
    });
    return res.json({ status: 'ok' });
  }
  res.status(400).json({ status: 'error', message: 'Invalid result payload' });
});

// Live tick push from EA
mt5Router.post(['/tick', '/api/mt5/tick'], (req, res) => {
  const tick = req.body;
  if (tick && tick.symbol) {
    tradeStore.updateTick(tick);
    // Persist the tick so the tick history survives a restart (previously only
    // the /sync path persisted ticks, so /tick pushes were lost on reboot).
    import('../database/db.js')
      .then(({ dbInsertTicks }) => dbInsertTicks([tick]))
      .catch((e) => console.error('DB insert tick error:', e));
    broadcast({
      type: 'tick',
      payload: tick,
    });
    return res.json({ status: 'ok' });
  }
  res.status(400).json({ status: 'error', message: 'Invalid tick payload' });
});
