#!/usr/bin/env node
/**
 * MT5 Bridge Stdio MCP Server Adapter
 * 
 * Allows any AI host (Claude Desktop, Cursor IDE, Windsurf, Cline, Gemini CLI, etc.)
 * to communicate directly with the MT5 Bridge using standard Stdio MCP protocol.
 *
 * Configuration for Claude Desktop / Cursor:
 * {
 *   "mcpServers": {
 *     "mt5-bridge": {
 *       "command": "node",
 *       "args": ["/path/to/backend/mcp-tool/stdio.js"],
 *       "env": {
 *         "MCP_URL": "http://127.0.0.1:3000/api/mcp"
 *       }
 *     }
 *   }
 * }
 */

import http from 'http';
import readline from 'readline';

const BRIDGE_URL = new URL(process.env.MCP_URL || 'http://127.0.0.1:3000/api/mcp');

function sendHttpRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: BRIDGE_URL.hostname,
        port: BRIDGE_URL.port,
        path: BRIDGE_URL.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({
              jsonrpc: '2.0',
              id: body.id || null,
              error: { code: -32603, message: `Invalid response from bridge: ${data}` },
            });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        jsonrpc: '2.0',
        id: body.id || null,
        error: { code: -32603, message: 'Bridge request timed out' },
      });
    });

    req.on('error', (err) => {
      resolve({
        jsonrpc: '2.0',
        id: body.id || null,
        error: { code: -32603, message: `Bridge connection error: ${err.message}` },
      });
    });

    req.write(payload);
    req.end();
  });
}

function sendStdout(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// Process incoming JSON-RPC lines from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const message = JSON.parse(trimmed);

    // Notifications (no id)
    if (message.id === undefined) {
      if (message.method === 'notifications/initialized') {
        // Handshake initialized notification
        return;
      }
    }

    // Forward JSON-RPC request to MT5 Bridge server
    const response = await sendHttpRequest(message);
    if (message.id !== undefined) {
      sendStdout(response);
    }
  } catch (err) {
    sendStdout({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `Parse error: ${err.message}` },
    });
  }
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
