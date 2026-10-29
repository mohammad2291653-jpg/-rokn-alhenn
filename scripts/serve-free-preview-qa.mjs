import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://127.0.0.1:3443';
const children = new Set();
const sockets = new Set();
let scratch;
let proxy;
let interrupted;
let forcedShutdown;
let proxyFailed = false;

function validateEnvironment() {
  try {
    const database = new URL(process.env.DATABASE_URL);
    if (process.env.NEXT_PUBLIC_SITE_URL !== origin || process.env.BETTER_AUTH_URL !== origin || process.env.RENDER_FREE_PREVIEW !== 'true' || process.env.FREE_PREVIEW_DATABASE_NAME !== 'test_rokn_preview' || database.pathname !== '/test_rokn_preview' || !['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.username || !database.password || database.hash) throw new Error('Invalid QA environment.');
    if (process.env.COMMERCIAL_LAUNCH_APPROVED !== 'false' || process.env.ALLOW_INDEXING !== 'false') throw new Error('Invalid preview safeguards.');
    for (const [key, value] of database.searchParams) {
      if (!['schema', 'sslmode', 'connect_timeout'].includes(key) || (key === 'schema' && value !== 'public')) throw new Error('Unsupported connection selector.');
    }
  } catch {
    throw new Error('The isolated HTTPS QA environment is not configured.');
  }
}

function killChild(record, signal) {
  if (record.done) return;
  try {
    if (process.platform !== 'win32' && record.child.pid) process.kill(-record.child.pid, signal);
    else record.child.kill(signal);
  } catch { /* Already stopped. */ }
}

function spawnTracked(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'ignore'], ...options });
  const record = { child, done: false, closed: undefined };
  record.closed = new Promise(resolveClosed => {
    let failed = false;
    child.once('error', () => { failed = true; });
    child.once('close', (code, signal) => {
      record.done = true;
      resolveClosed({ code: failed ? null : code, signal });
    });
  });
  children.add(record);
  return record;
}

function stopResources() {
  if (proxy) {
    proxy.close(() => {});
    proxy.closeAllConnections();
  }
  for (const socket of sockets) socket.destroy();
  for (const child of children) killChild(child, 'SIGTERM');
  if (!forcedShutdown) {
    forcedShutdown = setTimeout(() => {
      for (const child of children) killChild(child, 'SIGKILL');
    }, 10_000);
    forcedShutdown.unref();
  }
}

const terminate = () => { interrupted = 'SIGTERM'; stopResources(); };
const interrupt = () => { interrupted = 'SIGINT'; stopResources(); };
process.once('SIGTERM', terminate);
process.once('SIGINT', interrupt);

function ensureRunning() {
  if (interrupted) throw new Error('QA was interrupted.');
}

function forward(request, response) {
  const upstream = http.request({ hostname: '127.0.0.1', port: 3002, method: request.method, path: request.url, headers: request.rawHeaders }, incoming => {
    response.writeHead(incoming.statusCode ?? 502, incoming.statusMessage, incoming.rawHeaders);
    incoming.on('error', () => response.destroy());
    incoming.pipe(response);
  });
  upstream.on('error', () => {
    if (response.headersSent) response.destroy();
    else {
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('QA backend unavailable.');
    }
  });
  request.on('aborted', () => upstream.destroy());
  request.on('error', () => upstream.destroy());
  response.on('close', () => { if (!response.writableEnded) upstream.destroy(); });
  request.pipe(upstream);
}

try {
  validateEnvironment();
  scratch = await mkdtemp(join(tmpdir(), 'rokn-preview-qa-tls-'));
  ensureRunning();
  const keyPath = join(scratch, 'key.pem');
  const certPath = join(scratch, 'cert.pem');
  const certificate = spawnTracked('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
    '-keyout', keyPath, '-out', certPath,
  ], { timeout: 30_000 });
  const generated = await certificate.closed;
  ensureRunning();
  if (generated.code !== 0) throw new Error('QA TLS setup failed.');
  await Promise.all([chmod(keyPath, 0o600), chmod(certPath, 0o600)]);
  const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
  ensureRunning();
  proxy = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, forward);
  proxy.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  proxy.on('error', () => { proxyFailed = true; stopResources(); });
  await new Promise((resolveListening, rejectListening) => {
    proxy.once('error', rejectListening);
    proxy.listen(3443, '127.0.0.1', resolveListening);
  });
  ensureRunning();
  if (proxyFailed) throw new Error('QA proxy could not listen.');
  const backend = spawnTracked(process.execPath, [join(root, 'scripts/start-free-preview.mjs')], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '3002', BIND_HOST: '127.0.0.1' },
  });
  // This confirms only the TLS listener; Playwright separately checks backend health.
  console.info(JSON.stringify({ event: 'free-preview-qa', result: 'proxy-listening' }));
  const result = await backend.closed;
  ensureRunning();
  if (proxyFailed || result.code !== 0) throw new Error('QA backend stopped.');
  throw new Error('QA backend exited before shutdown.');
} catch {
  if (!interrupted) console.error(JSON.stringify({ event: 'free-preview-qa', result: 'failed', message: 'The isolated HTTPS QA server could not continue.' }));
  process.exitCode = interrupted === 'SIGTERM' ? 143 : interrupted === 'SIGINT' ? 130 : 1;
} finally {
  stopResources();
  await Promise.all([...children].map(child => child.closed));
  if (forcedShutdown) clearTimeout(forcedShutdown);
  if (scratch) await rm(scratch, { recursive: true, force: true }).catch(() => {});
  process.removeListener('SIGTERM', terminate);
  process.removeListener('SIGINT', interrupt);
}
