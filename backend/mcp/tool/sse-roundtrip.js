// Full MCP SSE round-trip test.
//
//   node backend/mcp-test/sse-roundtrip.js [out-dir]
//
// 1. Open GET /api/mcp/sse and read past the HTTP headers plus the initial
//    `event: endpoint` event, which carries the `?sessionId=...` the client
//    must use for its messages.
// 2. POST a JSON-RPC `tools/call` to /api/mcp/messages?sessionId=<id>.
// 3. Read the JSON-RPC response as a pushed `event: message` on the SSE stream.
//
// This proves the server pushes results downstream (Server-Sent Events)
// rather than requiring the client to poll. Uses only Node built-ins.

import net from 'net';
import fs from 'fs';
import path from 'path';

const HOST = '127.0.0.1';
const PORT = 3000;
const OUT = process.argv[2] || path.join(path.dirname(path.resolve(import.meta.url)), 'out');

// Read from a socket until `predicate` matches or `timeout` seconds elapse.
// The socket is left open (only the listener is removed) so callers can keep
// reading the same stream afterwards.
function recvUntil(socket, predicate, timeout = 3) {
  return new Promise((resolve) => {
    let buf = '';
    let settled = false;
    const timer = setTimeout(() => finish(), timeout * 1000);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('end', onEnd);
      resolve(buf);
    };
    const onData = (chunk) => {
      buf += chunk;
      if (predicate(buf)) finish();
    };
    const onError = () => finish();
    const onEnd = () => finish();
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('end', onEnd);
  });
}

// One-shot HTTP request; returns the response body.
function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req =
      `POST ${path} HTTP/1.1\r\n` +
      `Host: ${HOST}:${PORT}\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(payload)}\r\n` +
      `Connection: close\r\n\r\n` + payload;
    const socket = net.connect(PORT, HOST, () => socket.write(req));
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => {
      const idx = data.indexOf('\r\n\r\n');
      resolve(idx >= 0 ? data.slice(idx + 4) : data);
    });
    socket.on('error', reject);
  });
}

fs.mkdirSync(OUT, { recursive: true });

// 1. Open SSE stream and capture the endpoint event (contains sessionId)
const s = net.connect(PORT, HOST);
s.write(
  `GET /api/mcp/sse HTTP/1.1\r\n` +
  `Host: ${HOST}:${PORT}\r\n` +
  `Connection: keep-alive\r\n\r\n`
);
const raw = await recvUntil(
  s,
  (b) => b.includes('\r\n\r\n') && b.includes('event: endpoint'),
  3
);
const idx = raw.indexOf('\r\n\r\n');
fs.writeFileSync(path.join(OUT, 'sse_headers.txt'), raw.slice(0, idx));
fs.writeFileSync(path.join(OUT, 'sse_endpoint.txt'), raw.slice(idx + 4));
const m = raw.match(/sessionId=([^\s]+)/);
const sid = m ? m[1] : null;
console.log('SESSION_ID=' + (sid || 'NOT FOUND'));

// 2. POST a tools/call to /api/mcp/messages?sessionId=<id>
const resp = await post(`/api/mcp/messages?sessionId=${sid}`, {
  jsonrpc: '2.0', id: 4242, method: 'tools/call',
  params: { name: 'mt5_get_account_info', arguments: {} },
});
fs.writeFileSync(path.join(OUT, 'sse_messages_post.txt'), resp);

// 3. Read the pushed `event: message` on the SSE stream
const pushed = await recvUntil(s, (b) => b.includes('event: message'), 3);
fs.writeFileSync(path.join(OUT, 'sse_pushed.txt'), pushed);
s.destroy();
console.log('DONE');