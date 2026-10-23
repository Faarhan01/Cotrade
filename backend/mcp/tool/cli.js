// MCP CLI — call any tool or JSON-RPC method directly from the terminal.
//
//   node backend/mcp-tool/cli.js list
//   node backend/mcp-tool/cli.js call <toolName> '<json args>' | @file.json | @-
//   node backend/mcp-tool/cli.js rpc <method> '<json params>' | @file.json | @-
//   node backend/mcp-tool/cli.js health [url]
//
// Examples:
//   node backend/mcp-tool/cli.js list
//   node backend/mcp-tool/cli.js call mt5_get_account_info '{}'
//   node backend/mcp-tool/cli.js call mt5_get_market_data '{"symbol":"EURUSD"}'
//   node backend/mcp-tool/cli.js call mt5_execute_trade '{"symbol":"EURUSD","orderType":"BUY","volume":0.01,"sl":1.1180,"tp":1.1210}'
//   node backend/mcp-tool/cli.js rpc initialize '{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}'
//
// JSON args can be passed inline (single-quoted), read from a file with
// @file.json, or read from stdin with @-.
// Defaults to http://127.0.0.1:3000/api/mcp. Override with MCP_URL env var.
// Uses only Node built-ins (http, fs). No dependencies.

import http from 'http';
import fs from 'fs';

const BRIDGE_URL = new URL(process.env.MCP_URL || 'http://127.0.0.1:3000/api/mcp');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: BRIDGE_URL.hostname,
        port: BRIDGE_URL.port,
        path: path || BRIDGE_URL.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data, status: res.statusCode });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: BRIDGE_URL.hostname, port: BRIDGE_URL.port, path, method: 'GET' },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data, status: res.statusCode });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function usage() {
  console.log(`Usage:
  node backend/mcp-tool/cli.js <command> [args...]

Direct AI Trading & Market Inspection Shortcuts:
  node backend/mcp-tool/cli.js status                       (Account & connection summary)
  node backend/mcp-tool/cli.js quote <symbol>               (Live quote, spread, session metrics)
  node backend/mcp-tool/cli.js positions                    (Open active MT5 positions)
  node backend/mcp-tool/cli.js orders                       (Active pending limit/stop orders)
  node backend/mcp-tool/cli.js buy <symbol> <lots> [sl] [tp] [comment]
  node backend/mcp-tool/cli.js sell <symbol> <lots> [sl] [tp] [comment]
  node backend/mcp-tool/cli.js close <ticket> [lots]        (Close position ticket)
  node backend/mcp-tool/cli.js cancel <ticket>              (Cancel pending order ticket)
  node backend/mcp-tool/cli.js indicators <symbol> [tf]     (Precomputed RSI, MACD, EMA, summary)
  node backend/mcp-tool/cli.js candles <symbol> [tf] [cnt]  (Past OHLCV candlestick history)
  node backend/mcp-tool/cli.js strategies [symbol]          (List quantitative strategies)
  node backend/mcp-tool/cli.js backtest <stratId> [candles] (Run backtest against stored MT5 data)
  node backend/mcp-tool/cli.js observations [category]      (List research notes & patterns)
  node backend/mcp-tool/cli.js prune                        (Purge 24h+ unexecuted orders & trim DB)

Standard Model Context Protocol (MCP) Commands:
  node backend/mcp-tool/cli.js list
  node backend/mcp-tool/cli.js call <toolName> '<json args>' | @file.json | @-
  node backend/mcp-tool/cli.js rpc <method> '<json params>' | @file.json | @-
  node backend/mcp-tool/cli.js health [url]

Examples:
  node backend/mcp-tool/cli.js status
  node backend/mcp-tool/cli.js quote EURUSD
  node backend/mcp-tool/cli.js buy EURUSD 0.01 1.0820 1.0920
  node backend/mcp-tool/cli.js call mt5_get_account_info '{}'

Set MCP_URL to override the bridge endpoint (default http://127.0.0.1:3000/api/mcp).`);
  process.exit(1);
}

// Resolve a JSON argument: inline string, @file path, or @- for stdin.
function resolveArg(raw) {
  if (!raw) return {};
  if (raw === '@-') return JSON.parse(fs.readFileSync(0, 'utf8'));
  if (raw.startsWith('@')) return JSON.parse(fs.readFileSync(raw.slice(1), 'utf8'));
  return JSON.parse(raw);
}

async function callTool(name, args) {
  const res = await post(BRIDGE_URL.pathname, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const text = res.result?.content?.[0]?.text;
  const parsed = text ? JSON.parse(text) : res;
  return parsed;
}

const [, , cmd, arg1, arg2, arg3, arg4, arg5] = process.argv;

try {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
  } else if (cmd === 'status') {
    const account = await callTool('mt5_get_account_info', {});
    const chart = await callTool('mt5_get_current_chart', {});
    console.log(JSON.stringify({ account, currentChart: chart }, null, 2));
  } else if (cmd === 'quote') {
    if (!arg1) usage();
    const data = await callTool('mt5_get_market_data', { symbol: arg1.toUpperCase() });
    console.log(JSON.stringify(data, null, 2));
  } else if (cmd === 'positions') {
    const pos = await callTool('mt5_get_open_positions', arg1 ? { symbol: arg1.toUpperCase() } : {});
    console.log(JSON.stringify(pos, null, 2));
  } else if (cmd === 'orders') {
    const orders = await callTool('mt5_get_pending_orders', arg1 ? { symbol: arg1.toUpperCase() } : {});
    console.log(JSON.stringify(orders, null, 2));
  } else if (cmd === 'buy' || cmd === 'sell') {
    if (!arg1 || !arg2) {
      console.error(`Usage: node backend/mcp-tool/cli.js ${cmd} <symbol> <lots> [sl] [tp] [comment]`);
      process.exit(1);
    }
    const order = await callTool('mt5_execute_trade', {
      symbol: arg1.toUpperCase(),
      orderType: cmd.toUpperCase(),
      volume: parseFloat(arg2),
      sl: arg3 ? parseFloat(arg3) : undefined,
      tp: arg4 ? parseFloat(arg4) : undefined,
      comment: arg5 || `CLI_${cmd.toUpperCase()}`,
    });
    console.log(JSON.stringify(order, null, 2));
  } else if (cmd === 'close') {
    if (!arg1) {
      console.error('Usage: node backend/mcp-tool/cli.js close <ticket> [lots]');
      process.exit(1);
    }
    const res = await callTool('mt5_close_position', {
      ticket: parseInt(arg1, 10),
      volume: arg2 ? parseFloat(arg2) : undefined,
    });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'cancel') {
    if (!arg1) {
      console.error('Usage: node backend/mcp-tool/cli.js cancel <ticket>');
      process.exit(1);
    }
    const res = await callTool('mt5_cancel_pending_order', {
      ticket: parseInt(arg1, 10),
    });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'indicators') {
    const res = await callTool('mt5_get_technical_indicators', {
      symbol: arg1 ? arg1.toUpperCase() : undefined,
      timeframe: arg2 || 'M1',
    });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'candles') {
    const res = await callTool('mt5_get_chart_history', {
      symbol: arg1 ? arg1.toUpperCase() : undefined,
      timeframe: arg2 || 'M1',
      limit: arg3 ? parseInt(arg3, 10) : 60,
      includeIndicators: true,
    });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'strategies') {
    const res = await callTool('mt5_list_strategies', {
      symbol: arg1 ? arg1.toUpperCase() : undefined,
    });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'backtest') {
    if (!arg1) {
      console.error('Usage: node backend/mcp-tool/cli.js backtest <strategyId> [candleLimit] [deposit]');
      process.exit(1);
    }
    const res = await callTool('mt5_backtest_strategy', {
      strategyId: arg1,
      candleLimit: arg2 ? parseInt(arg2, 10) : 300,
      initialDeposit: arg3 ? parseFloat(arg3) : 10000,
    });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'observations') {
    const res = await callTool('mt5_list_observations', {
      category: arg1 || 'all',
    });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'prune') {
    const res = await post('/api/database/prune', {});
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'autodetect') {
    const res = await callTool('mt5_knowledge_auto_detect', { symbol: arg1 ? arg1.toUpperCase() : undefined });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'patterns') {
    const res = await callTool('mt5_knowledge_detect_patterns', {
      symbol: arg1 ? arg1.toUpperCase() : undefined,
      timeframe: arg2 || 'M1',
    });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'news') {
    const res = await callTool('mt5_knowledge_get_news_and_events', {
      symbol: arg1 ? arg1.toUpperCase() : undefined,
      category: arg2 || 'ALL',
    });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'impact') {
    if (!arg1) {
      console.error('Usage: node backend/mcp-tool/cli.js impact <symbol>');
      process.exit(1);
    }
    const res = await callTool('mt5_knowledge_get_symbol_impact', { symbol: arg1.toUpperCase() });
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'speed') {
    const res = await callTool('mt5_knowledge_get_market_speed', {});
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'templates') {
    const res = await callTool('mt5_knowledge_get_strategy_templates', {});
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'list') {
    const res = await post(BRIDGE_URL.pathname, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = res.result?.tools || [];
    console.log(`${tools.length} tools available via MCP:\n`);
    for (const t of tools) {
      const req = t.inputSchema?.required?.length
        ? ` (required: ${t.inputSchema.required.join(', ')})`
        : '';
      console.log(`  ${t.name}${req}`);
      console.log(`    ${t.description}`);
    }
  } else if (cmd === 'call') {
    if (!arg1) usage();
    const name = arg1;
    const args = resolveArg(arg2);
    const parsed = await callTool(name, args);
    console.log(JSON.stringify(parsed, null, 2));
  } else if (cmd === 'rpc') {
    if (!arg1) usage();
    const method = arg1;
    const params = resolveArg(arg2);
    const res = await post(BRIDGE_URL.pathname, { jsonrpc: '2.0', id: Date.now(), method, params });
    console.log(JSON.stringify(res, null, 2));
    if (res.error) process.exitCode = 1;
  } else if (cmd === 'health') {
    const url = arg1 || 'http://127.0.0.1:3000/api/mt5/health';
    const u = new URL(url);
    const res = await get(u.pathname + u.search);
    console.log(JSON.stringify(res, null, 2));
  } else {
    usage();
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}