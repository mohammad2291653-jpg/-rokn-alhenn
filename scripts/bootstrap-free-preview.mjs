import { spawn } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkpointKey = 'renderFreePreviewBootstrap';
const purpose = 'render-free-readonly-preview';
const version = 1;
const lockId = 72656481;
const appTables = new Set(['Account', 'Article', 'AuditLog', 'Category', 'City', 'ContentSection', 'DeliveryZone', 'Discount', 'FAQ', 'Order', 'OrderItem', 'OrderStatusHistory', 'Product', 'ProductImage', 'RateLimit', 'Session', 'SiteSetting', 'User', 'Verification']);

export class FreePreviewBootstrapError extends Error {
  constructor(code, message) { super(message); this.name = 'FreePreviewBootstrapError'; this.code = code; }
}
const failure = (code, message) => new FreePreviewBootstrapError(code, message);

function configuration(env) {
  if (env.RENDER_FREE_PREVIEW !== 'true' || env.COMMERCIAL_LAUNCH_APPROVED !== 'false' || env.ALLOW_INDEXING !== 'false') {
    throw failure('PREVIEW_CONFIGURATION', 'Free preview requires explicit read-only, commercial-launch-disabled, and indexing-disabled flags.');
  }
  try {
    const url = new URL(env.DATABASE_URL);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || !database || database !== env.FREE_PREVIEW_DATABASE_NAME || ['rokn', 'test_rokn', 'postgres', 'template0', 'template1'].includes(database)) throw new Error('Invalid target.');
    for (const [key, value] of url.searchParams) {
      if (!['schema', 'sslmode', 'connect_timeout'].includes(key) || (key === 'schema' && value !== 'public')) throw new Error('Unsupported connection selector.');
    }
    url.searchParams.delete('schema');
    return { database, connectionString: url.toString() };
  } catch {
    throw failure('PREVIEW_DATABASE_TARGET', 'Free preview requires its explicitly named dedicated database.');
  }
}

async function runStep(label, args, env, cwd, signal) {
  if (signal?.aborted) throw failure('PREVIEW_INTERRUPTED', 'Free preview startup was interrupted.');
  await new Promise((resolveStep, rejectStep) => {
    const grouped = process.platform !== 'win32';
    const child = spawn(process.execPath, args, { cwd, env, detached: grouped, stdio: ['ignore', 'ignore', 'ignore'] });
    const abort = () => {
      try {
        if (grouped && child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch { /* The process may already have exited. */ }
    };
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', () => {
      signal?.removeEventListener('abort', abort);
      rejectStep(failure('PREVIEW_COMMAND_FAILED', `Free preview ${label} could not start.`));
    });
    child.once('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) rejectStep(failure('PREVIEW_INTERRUPTED', 'Free preview startup was interrupted.'));
      else if (code !== 0) rejectStep(failure('PREVIEW_COMMAND_FAILED', `Free preview ${label} failed. Check the dedicated preview configuration and source assets.`));
      else resolveStep();
    });
    if (signal?.aborted) abort();
  });
}

async function existingCheckpoint(client) {
  const exists = await client.query(`SELECT to_regclass('public."SiteSetting"') IS NOT NULL AS present`);
  if (!exists.rows[0].present) return null;
  const result = await client.query('SELECT "value" FROM public."SiteSetting" WHERE "key" = $1', [checkpointKey]);
  return result.rows[0]?.value ?? null;
}

async function refuseOrders(client) {
  const exists = await client.query(`SELECT to_regclass('public."Order"') IS NOT NULL AS present`);
  if (exists.rows[0].present) {
    const orders = await client.query('SELECT EXISTS (SELECT 1 FROM public."Order") AS present');
    if (orders.rows[0].present) throw failure('PREVIEW_EXISTING_ORDERS', 'Free preview refuses a database containing orders; existing records were not removed.');
  }
}

async function requireEmptyApplication(client) {
  const relations = await client.query(`SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')`);
  for (const relation of relations.rows) {
    if (relation.schema !== 'public' || (!appTables.has(relation.name) && relation.name !== '_prisma_migrations')) {
      throw failure('PREVIEW_EXISTING_DATA', 'Free preview cannot initialize a database containing unrelated user objects.');
    }
    if (relation.name === '_prisma_migrations') continue;
    // Identifiers are restricted to the fixed application-table allowlist above.
    const rows = await client.query(`SELECT EXISTS (SELECT 1 FROM public."${relation.name}") AS present`);
    if (rows.rows[0].present) throw failure('PREVIEW_EXISTING_DATA', 'Free preview cannot adopt existing application data without its own initialization checkpoint.');
  }
}

function requireCheckpoint(checkpoint, database) {
  if (!checkpoint || typeof checkpoint !== 'object' || checkpoint.purpose !== purpose || checkpoint.version !== version || checkpoint.database !== database || !['INITIALIZING', 'READY'].includes(checkpoint.status)) {
    throw failure('PREVIEW_CHECKPOINT', 'The database preview checkpoint does not match this initialization version and target.');
  }
}

async function previewState(client) {
  await refuseOrders(client);
  const setting = await client.query('SELECT "value" FROM public."SiteSetting" WHERE "key" = $1', ['checkoutEnabled']);
  if (setting.rows[0]?.value !== false) throw failure('PREVIEW_CHECKOUT_ENABLED', 'Checkout must remain disabled in the free preview database.');
  const counts = await client.query('SELECT (SELECT COUNT(*)::int FROM public."Product") AS products, (SELECT COUNT(*)::int FROM public."ProductImage") AS images');
  return counts.rows[0];
}

/** No .env is read here. Render supplies the dedicated database and explicit flags. */
export async function bootstrapFreePreview({ env = process.env, signal } = {}) {
  const target = configuration(env);
  const client = new pg.Client({ connectionString: target.connectionString, connectionTimeoutMillis: 15000, query_timeout: 120000, application_name: 'rokn-free-preview-bootstrap' });
  let locked = false;
  let scratch;
  const abortDatabase = () => { void client.end().catch(() => {}); };
  signal?.addEventListener('abort', abortDatabase, { once: true });
  try {
    if (signal?.aborted) throw failure('PREVIEW_INTERRUPTED', 'Free preview startup was interrupted.');
    await client.connect();
    const identity = await client.query('SELECT current_database() AS name');
    if (identity.rows[0].name !== target.database) throw failure('PREVIEW_DATABASE_TARGET', 'The connected database does not match the dedicated preview target.');
    await client.query('SELECT pg_advisory_lock($1)', [lockId]);
    locked = true;
    await refuseOrders(client);
    let checkpoint = await existingCheckpoint(client);
    if (checkpoint) requireCheckpoint(checkpoint, target.database);
    else await requireEmptyApplication(client);

    await runStep('migrations', [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], env, root, signal);
    if (checkpoint?.status === 'READY') {
      await runStep('final owner photo sync', [join(root, 'scripts/sync-final-product-media.mjs')], env, root, signal);
      return { initialized: false, ...await previewState(client), checkoutDisabled: true };
    }

    if (!checkpoint) {
      checkpoint = { purpose, version, database: target.database, status: 'INITIALIZING', startedAt: new Date().toISOString() };
      await client.query('INSERT INTO public."SiteSetting" ("key", "value", "updatedAt") VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)', [checkpointKey, JSON.stringify(checkpoint)]);
    }
    await runStep('seed', [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'prisma/seed.ts')], env, root, signal);
    await previewState(client);

    // Existing trusted importers write their verification artifacts only here.
    scratch = await mkdtemp(join(tmpdir(), 'rokn-free-preview-'));
    for (const directory of ['brand-assets', 'product-assets', 'public', 'config']) await symlink(join(root, directory), join(scratch, directory), 'dir');
    await runStep('logo import', [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'scripts/import-brand-logo.ts')], env, scratch, signal);
    await runStep('final owner photo sync', [join(root, 'scripts/sync-final-product-media.mjs'), '--seed-metadata'], env, root, signal);
    const state = await previewState(client);
    const drafts = await client.query('SELECT COUNT(*)::int AS count FROM public."Product" WHERE "status" = \'DRAFT\'');
    if (state.products !== 9 || state.images !== 7 || drafts.rows[0].count !== 9) throw failure('PREVIEW_SOURCE_DATA', 'Initial free preview catalog did not match the reviewed source data.');
    await client.query('UPDATE public."SiteSetting" SET "value" = $2::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = $1', [checkpointKey, JSON.stringify({ ...checkpoint, status: 'READY', completedAt: new Date().toISOString() })]);
    return { initialized: true, ...state, checkoutDisabled: true };
  } catch (error) {
    if (signal?.aborted) throw failure('PREVIEW_INTERRUPTED', 'Free preview startup was interrupted.');
    if (error instanceof FreePreviewBootstrapError) throw error;
    throw failure('PREVIEW_DATABASE_UNAVAILABLE', 'Free preview database initialization could not complete. Check its availability and dedicated configuration.');
  } finally {
    signal?.removeEventListener('abort', abortDatabase);
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {});
    await client.end().catch(() => {});
    if (scratch) await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.info(JSON.stringify({ event: 'free-preview-bootstrap', result: 'passed', ...await bootstrapFreePreview() })); }
  catch (error) {
    console.error(JSON.stringify({ event: 'free-preview-bootstrap', result: 'failed', code: error instanceof FreePreviewBootstrapError ? error.code : 'PREVIEW_STARTUP_FAILED', message: error instanceof FreePreviewBootstrapError ? error.message : 'Free preview startup could not complete.' }));
    process.exitCode = 1;
  }
}
