// Minimal raw-socket test: connect to the MCP SSE endpoint and read the
// `endpoint` event that tells the client where to POST JSON-RPC messages.
//
//   node backend/mcp-test/sse.js [out-dir]
//
// Uses only Node built-ins (net, fs, path). No dependencies.

import net from 'net';
import fs from 'fs';
import path from 'path';

const HOST = '127.0.0.1';
const PORT = 3000;
const OUT = process.argv[2] || path.join(path.dirname(path.resolve(import.meta.url)), 'out');

const req =
  `GET /api/mcp/sse HTTP/1.1\r\n` +
  `Host: ${HOST}:${PORT}\r\n` +
  `Connection: close\r\n\r\n`;

const socket = net.connect(PORT, HOST, () => socket.write(req));

let data = '';
let timer = setTimeout(() => { socket.destroy(); finish(); }, 3000);
socket.setEncoding('utf8');
socket.on('data', (chunk) => { data += chunk; });
socket.on('end', () => { clearTimeout(timer); finish(); });
socket.on('error', (e) => { clearTimeout(timer); console.error('ERROR', e.message); process.exit(1); });

function finish() {
  const idx = data.indexOf('\r\n\r\n');
  const headers = idx >= 0 ? data.slice(0, idx) : '(none)';
  const body = idx >= 0 ? data.slice(idx + 4) : data;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'sse_headers.txt'), headers);
  fs.writeFileSync(path.join(OUT, 'sse_body.txt'), body);
  console.log(body);
  console.log('OK');
}