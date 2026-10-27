import type { NextFunction, Request, Response } from 'express';

/**
 * Network exposure controls for the bridge server.
 *
 * The previous configuration was `Access-Control-Allow-Origin: *` on a server
 * bound to `0.0.0.0`, with no authentication. Any website the operator visited
 * could therefore issue a cross-origin `DELETE` to `/api/database/tables/orders`
 * and wipe the trade audit trail, or `POST` to `/api/commands` and place real
 * trades, without the operator's knowledge.
 *
 * The defaults now assume a local-only tool: the server binds to loopback and
 * only answers CORS requests from this machine. Both can be relaxed explicitly
 * with environment variables for a genuine multi-client deployment.
 */

/** Origins that are always allowed - the machine the server runs on. */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:7777',
  'http://127.0.0.1:7777',
];

// `null` origin (file:// pages, sandboxed iframes) is only allowed when the
// operator explicitly opts in. Allowing it by default lets any local HTML file
// the operator opens issue cross-origin requests to the bridge.
if (process.env.ALLOW_NULL_ORIGIN === 'true') {
  DEFAULT_ALLOWED_ORIGINS.push('null');
}

/**
 * Parse the CORS allow-list.
 *
 * `CORS_ORIGINS=*` is an explicit opt-in to the old behaviour. `CORS_ORIGINS`
 * can also be a comma-separated list, and it is merged with the loopback
 * defaults so the UI keeps working.
 */
export function getAllowedOrigins(): { wildcard: boolean; origins: string[] } {
  const raw = (process.env.CORS_ORIGINS || '').trim();
  if (raw === '*') {
    return { wildcard: true, origins: [] };
  }

  const configured = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const merged = [...DEFAULT_ALLOWED_ORIGINS];
  for (const origin of configured) {
    if (!merged.includes(origin)) merged.push(origin);
  }

  return { wildcard: false, origins: merged };
}

/**
 * CORS middleware that reflects an allow-list and permits Google AI Studio preview/share domains.
 */
export function corsMiddleware() {
  const { wildcard, origins } = getAllowedOrigins();

  return (req: Request, res: Response, next: NextFunction) => {
    const requestOrigin = req.headers.origin;

    if (wildcard) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (
      requestOrigin &&
      (origins.includes(requestOrigin) ||
        requestOrigin.endsWith('.run.app') ||
        requestOrigin.endsWith('.googleusercontent.com') ||
        requestOrigin.endsWith('.aistudio.google.com') ||
        requestOrigin.includes('localhost') ||
        requestOrigin.includes('127.0.0.1'))
    ) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
      res.header('Vary', 'Origin');
    } else if (!requestOrigin) {
      res.header('Access-Control-Allow-Origin', '*');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  };
}

/** Address the server should bind to. Defaults to 0.0.0.0 for containerized and shareable environments. */
export function getBindHost(): string {
  const host = (process.env.HOST || '').trim();
  if (host) return host;
  return '0.0.0.0';
}

/** True when the bind host is reachable from outside this machine. */
export function isPublicBind(host: string): boolean {
  return host !== '127.0.0.1' && host !== 'localhost' && host !== '::1';
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Paths the MetaTrader 5 Expert Advisor talks to.
 *
 * The EA issues plain WebRequests and cannot send an Authorization header, so
 * these routes are exempt from the optional bearer token. Everything else is
 * protected when `BRIDGE_TOKEN` is configured.
 */
const EA_EXEMPT_PREFIXES = ['/api/mt5', '/mt5'];

/**
 * Optional bearer-token guard for mutating requests.
 *
 * Enable with `BRIDGE_TOKEN=<secret>`. When set, any mutating request to a
 * non-EA route must send `Authorization: Bearer <secret>`.
 *
 * Returns `null` when no token is configured (the common local-only case), so
 * callers can simply skip the middleware.
 */
export function bearerTokenGuard() {
  const token = (process.env.BRIDGE_TOKEN || '').trim();
  if (!token) return null;

  return (req: Request, res: Response, next: NextFunction) => {
    if (!MUTATING_METHODS.has(req.method)) return next();

    const path = req.originalUrl.split('?')[0];
    if (EA_EXEMPT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return next();
    }

    const header = req.headers.authorization || '';
    const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!provided || provided !== token) {
      return res.status(401).json({
        error: 'Unauthorized. Set BRIDGE_TOKEN to protect this bridge and send it as "Authorization: Bearer <token>".',
      });
    }
    next();
  };
}

/**
 * Log the network exposure posture at startup so an operator can see whether
 * they accidentally exposed the terminal to the network.
 */
export function describeExposure(port: number, host: string): string {
  const { wildcard, origins } = getAllowedOrigins();
  const public_ = isPublicBind(host);
  const token = (process.env.BRIDGE_TOKEN || '').trim();

  const lines = [
    `[Security] Listening on http://${host}:${port}`,
    `[Security] CORS ${wildcard ? 'wildcard (*) - any website may call this API' : `allow-list (${origins.length} origin(s))`}`,
  ];

  if (public_) {
    lines.push(`[Security] WARNING: bound to ${host}, so other machines can reach this bridge.`);
    lines.push('[Security]         Set HOST=127.0.0.1 to restrict it to this machine.');
  } else {
    lines.push('[Security] Bound to loopback - other machines cannot reach this bridge.');
  }

  if (token) {
    lines.push('[Security] BRIDGE_TOKEN is set - mutating API requests require a bearer token (MT5 EA routes are exempt).');
  } else {
    lines.push('[Security] No BRIDGE_TOKEN configured. Enable it if this bridge is reachable from other machines.');
  }

  return lines.join('\n');
}
