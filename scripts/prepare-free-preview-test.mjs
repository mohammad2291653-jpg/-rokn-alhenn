import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceName = 'test_rokn';
const targetName = 'test_rokn_preview';

function configuration() {
  try {
    const source = new URL(process.env.TEST_DATABASE_URL);
    const target = new URL(process.env.PREVIEW_TEST_DATABASE_URL);
    const token = process.env.PREVIEW_TEST_ACCESS_TOKEN;
    for (const [url, name] of [[source, sourceName], [target, targetName]]) {
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== `/${name}` || !url.hostname || !url.username || !url.password || url.hash) throw new Error('Invalid test target.');
      for (const [key, value] of url.searchParams) {
        if (!['schema', 'sslmode', 'connect_timeout'].includes(key) || (key === 'schema' && value !== 'public')) throw new Error('Unsupported connection selector.');
      }
    }
    if (source.hostname !== target.hostname || (source.port || '5432') !== (target.port || '5432') || decodeURIComponent(source.username) !== decodeURIComponent(target.username) || decodeURIComponent(source.password) !== decodeURIComponent(target.password)) throw new Error('Test connections must share one server and credentials.');
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token) || new Set(token).size < 10) throw new Error('Preview test access is not configured.');
    source.searchParams.delete('schema');
    return { source: source.toString(), target: target.toString(), token };
  } catch {
    throw new Error('Dedicated preview test database configuration is invalid.');
  }
}

async function prepareDatabase(source) {
  const client = new pg.Client({ connectionString: source, connectionTimeoutMillis: 15_000, query_timeout: 30_000, application_name: 'rokn-free-preview-test-preparation' });
  try {
    await client.connect();
    const identity = await client.query('SELECT current_database() AS name');
    if (identity.rows[0]?.name !== sourceName) throw new Error('Invalid test source.');
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetName]);
    if (existing.rowCount) return false;
    try {
      // This identifier is a fixed constant, never input from an environment value.
      await client.query('CREATE DATABASE "test_rokn_preview"');
      return true;
    } catch (error) {
      if (error?.code === '42P04') return false; // Another test preparer created it.
      throw error;
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function bootstrap(target, token) {
  await new Promise((resolveBootstrap, rejectBootstrap) => {
    const child = spawn(process.execPath, [join(root, 'scripts/bootstrap-free-preview.mjs')], {
      cwd: root,
      env: {
        ...process.env, DATABASE_URL: target, FREE_PREVIEW_DATABASE_NAME: targetName,
        RENDER_FREE_PREVIEW: 'true', COMMERCIAL_LAUNCH_APPROVED: 'false', ALLOW_INDEXING: 'false',
        STORAGE_DRIVER: 'disabled', PREVIEW_ACCESS_TOKEN: token,
      },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.once('error', () => rejectBootstrap(new Error('Preview test bootstrap could not start.')));
    child.once('close', code => code === 0 ? resolveBootstrap() : rejectBootstrap(new Error('Preview test bootstrap failed.')));
  });
}

try {
  const config = configuration();
  const databaseCreated = await prepareDatabase(config.source);
  await bootstrap(config.target, config.token);
  console.info(JSON.stringify({ event: 'free-preview-test-preparation', result: 'passed', databaseCreated }));
} catch {
  console.error(JSON.stringify({ event: 'free-preview-test-preparation', result: 'failed', message: 'Dedicated preview test preparation failed; verify its isolated connections, access token, and source assets.' }));
  process.exitCode = 1;
}
