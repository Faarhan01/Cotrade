import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { setupWebSocketServer } from './backend/services/websocketServer.js';
import { mt5Router } from './backend/routes/mt5Routes.js';
import { apiRouter } from './backend/routes/apiRoutes.js';
import { backtestRouter } from './backend/routes/backtestRoutes.js';
import { bearerTokenGuard, corsMiddleware, describeExposure, getBindHost } from './backend/security.js';
import { tradingBot } from './backend/bot/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const MT5_PORT = 7777;
const BIND_HOST = getBindHost();

async function startServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS for local UI, local Vite dev server and the MT5 EA.
  app.use(corsMiddleware());

  // Optional bearer-token guard for state-changing API calls.
  const tokenGuard = bearerTokenGuard();
  if (tokenGuard) {
    app.use(tokenGuard);
    console.log('[Security] BRIDGE_TOKEN is configured - mutating requests require a bearer token.');
  }

  // Mount MT5 direct routes for http://127.0.0.1:7777 and http://127.0.0.1:3000
  app.use('/', mt5Router);
  app.use('/api/mt5', mt5Router);

  // Mount API & MCP routes
  app.use('/api', apiRouter);
  app.use('/api/backtest', backtestRouter);

  // Global error handler: convert unhandled route errors into JSON instead of
  // an HTML stack trace (which would break the SPA's fetch() callers).
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('[server] unhandled error on', req.method, req.originalUrl, err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  });

  const server = http.createServer(app);

  // Attach WebSocket server for real-time tick streaming and order events
  setupWebSocketServer(server);

  // Initialize Trading Bot and restore configuration from SQLite
  tradingBot.initialize().catch((err) => {
    console.warn('[TradingBot] Failed to hydrate initial bot configuration:', err?.message || err);
  });

  // Vite middleware in dev or static files in production
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  // Start Main Server
  server.listen(PORT, BIND_HOST, () => {
    console.log(`[MT5 Bridge Terminal] Web UI & WebSocket Server running at http://${BIND_HOST}:${PORT}`);
    console.log(describeExposure(PORT, BIND_HOST));
  });

  // Start Dedicated MT5 Listener on Port 7777 (http://127.0.0.1:7777)
  try {
    const mt5App = express();
    mt5App.use(express.json({ limit: '10mb' }));
    mt5App.use(corsMiddleware());

    mt5App.use('/', mt5Router);
    mt5App.use('/api/mt5', mt5Router);
    mt5App.use('/api', apiRouter);

    mt5App.use((err: any, req: any, res: any, next: any) => {
      console.error('[mt5] unhandled error on', req.method, req.originalUrl, err);
      if (res.headersSent) return next(err);
      res.status(500).json({ error: err?.message || 'Internal server error' });
    });

    const mt5Server = http.createServer(mt5App);
    mt5Server.listen(MT5_PORT, BIND_HOST, () => {
      console.log(`[MT5 Bridge Hub] Dedicated MT5 Endpoint running at http://${BIND_HOST}:${MT5_PORT}`);
      console.log(describeExposure(MT5_PORT, BIND_HOST));
    });
    mt5Server.on('error', (err: any) => {
      console.warn(`[MT5 Bridge Hub] Port ${MT5_PORT} notice: ${err.message}. Port ${PORT} remains fully active for MT5 routing.`);
    });
  } catch (err: any) {
    console.warn(`[MT5 Bridge Hub] Could not bind port ${MT5_PORT}: ${err.message}`);
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
