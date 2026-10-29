import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { verifyPassword } from "better-auth/crypto";

// This drill creates its own cluster. It never reads .env or accepts a target URL.
const runId = randomUUID();
const directory = resolve(".local", `backup-restore-${runId}`);
const archive = join(directory, "snapshot.dump");
const password = randomBytes(32).toString("base64url");
const adminPassword = randomBytes(32).toString("base64url");
const checkNames: string[] = [];
const evidence: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  result: "running",
  mainDatabaseAccessed: false,
  testDatabaseAccessed: false,
  credentialsRecorded: false,
  limitations: [
    "Local isolated PostgreSQL dump/restore drill; managed production backups, scheduling, encryption at rest and off-site storage were not exercised.",
    "Database restoration retains image references; S3/object files require their own backup and restore drill.",
  ],
};
const port = await new Promise<number>((resolvePort, reject) => {
  const probe = createServer();
  probe.on("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    if (!address || typeof address === "string") return reject(new Error("No isolated drill port."));
    probe.close((error) => error ? reject(error) : resolvePort(address.port));
  });
});
assert.notEqual(port, 5433);
const sourceUrl = `postgresql://backup_drill:${password}@127.0.0.1:${port}/backup_drill_source`;
const restoredUrl = `postgresql://backup_drill:${password}@127.0.0.1:${port}/backup_drill_restored`;
Object.assign(process.env, {
  DATABASE_URL: sourceUrl,
  NODE_ENV: "test",
  ORDER_TOKEN_SECRET: randomBytes(32).toString("base64url"),
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
});
const postgres = new EmbeddedPostgres({ databaseDir: join(directory, "postgres"), user: "backup_drill", password, port, persistent: true, authMethod: "scram-sha-256", onLog: () => {}, onError: () => {} });
let started = false;
let source: PrismaClient | undefined;
let restored: PrismaClient | undefined;
let serviceDatabase: typeof import("../src/lib/db") | undefined;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const pass = (name: string) => { checkNames.push(name); console.info(`PASS: ${name}`); };

function command(file: string, args: string[], env: NodeJS.ProcessEnv = process.env, expectSuccess = true) {
  const result = spawnSync(file, args, { cwd: process.cwd(), env, encoding: "utf8", timeout: 90_000 });
  if (expectSuccess && result.status !== 0) {
    // Subprocess errors are useful, but a driver might include a connection string.
    const safeError = (result.stderr || result.error?.message || "Unknown subprocess error")
      .split(password).join("[REDACTED]").split(adminPassword).join("[REDACTED]");
    throw new Error(`Drill subprocess ${file} failed (exit ${result.status}): ${safeError}`);
  }
  return result;
}

async function tableSnapshot(url: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const tables = await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    const result: Record<string, { count: number; sha256: string }> = {};
    for (const { table_name: table } of tables.rows) {
      const identifier = table.replaceAll('"', '""');
      const rows = await client.query<{ row: string }>(`SELECT row_to_json(t)::text AS row FROM public."${identifier}" t ORDER BY row_to_json(t)::text`);
      result[table] = { count: rows.rowCount ?? 0, sha256: hash(JSON.stringify(rows.rows.map((row) => row.row))) };
    }
    return result;
  } finally { await client.end(); }
}

try {
  for (const tool of ["pg_dump", "pg_restore", "psql"]) command(tool, ["--version"]);
  await mkdir(directory, { recursive: true });
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase("backup_drill_source");
  await postgres.createDatabase("backup_drill_restored");
  command(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  command(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"]);
  source = new PrismaClient({ adapter: new PrismaPg({ connectionString: sourceUrl }) });
  assert.equal(await source.product.count(), 9);
  pass("Current migrations and exact nine-product seed applied to a new isolated source database");

  const product = await source.product.findUniqueOrThrow({ where: { slug: "integrated-henna" } });
  await source.product.update({ where: { id: product.id }, data: { status: "PUBLISHED", nameNeedsConfirmation: false, images: { create: { url: "/catalog-media/2026-10-29/page-23.webp", originalKey: "product-assets/originals/2026-10-29/page-23.jpeg", alt: "صورة حقيقية مرتبطة بسجل اختبار معزول" } } } });
  for (const key of ["returns", "privacy", "terms"]) await source.siteSetting.update({ where: { key }, data: { value: { approved: true, body: "Isolated backup drill policy" } } });
  await source.siteSetting.update({ where: { key: "checkoutEnabled" }, data: { value: true } });
  const zone = await source.deliveryZone.findUniqueOrThrow({ where: { code: "west-bank" } });
  serviceDatabase = await import("../src/lib/db");
  const { createOrder } = await import("../src/lib/order-service");
  const request = { items: [{ productId: product.id, quantity: 1 }], zoneId: zone.id, city: "رام الله", address: "رام الله شارع اختبار الاستعادة بناية ١", customerName: "عميلة اختبار استعادة معزولة", phone: "0599123456", idempotencyKey: randomUUID(), acceptPolicies: true };
  const order = await createOrder(request);
  assert.equal(order.totalAgorot, 9500);
  assert.equal(order.paymentStatus, "UNPAID");
  await source.product.update({ where: { id: product.id }, data: { priceAgorot: 8000 } });
  await source.deliveryZone.update({ where: { id: zone.id }, data: { feeAgorot: 2500 } });
  command(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/create-admin.ts"], { ...process.env, ADMIN_EMAIL: "backup-drill@example.invalid", ADMIN_PASSWORD: adminPassword });
  await source.auditLog.create({ data: { action: "BACKUP_DRILL_SOURCE_READY", entityType: "Order", entityId: order.number, details: { syntheticTestOnly: true } } });
  pass("Synthetic COD order, historic prices, administrator hash, image metadata and audit record created only in drill database");

  const before = await tableSnapshot(sourceUrl);
  command("bash", ["scripts/backup.sh"], { ...process.env, BACKUP_PATH: archive, PGSERVICE: "must_not_redirect_the_explicit_url", PGSERVICEFILE: join(directory, "nonexistent-service-file") });
  const bytes = await readFile(archive);
  assert(bytes.length > 0);
  assert.equal((await stat(archive)).mode & 0o777, 0o600);
  evidence.archive = { bytes: bytes.length, sha256: hash(bytes), permissions: "0600" };
  evidence.clientVersion = command("pg_dump", ["--version"]).stdout.trim();
  pass("Production backup script created a valid custom-format archive with owner-only file permissions");
  pass("The explicit source URL takes precedence over inherited libpq service selectors");

  const duplicateBackup = command("bash", ["scripts/backup.sh"], { ...process.env, BACKUP_PATH: archive }, false);
  assert.notEqual(duplicateBackup.status, 0);
  assert.equal(hash(await readFile(archive)), hash(bytes));
  pass("Backup script rejects overwriting an existing archive without modifying its bytes");
  const failedArchive = join(directory, "must-not-exist.dump");
  const failedBackup = command("bash", ["scripts/backup.sh"], { ...process.env, DATABASE_URL: sourceUrl.replace("/backup_drill_source", "/does_not_exist"), BACKUP_PATH: failedArchive }, false);
  assert.notEqual(failedBackup.status, 0);
  assert(!(await readdir(directory)).some((name) => name.startsWith("must-not-exist.dump")));
  pass("Failed database connection leaves no final backup or partial archive");

  const missingConfirmation = command("bash", ["scripts/restore.sh"], { ...process.env, RESTORE_DATABASE_URL: restoredUrl, BACKUP_PATH: archive, CONFIRM_EMPTY_RESTORE_TARGET: "NO" }, false);
  assert.notEqual(missingConfirmation.status, 0);
  assert.deepEqual(await tableSnapshot(restoredUrl), {});
  pass("Restoration requires explicit empty-target confirmation before making changes");
  const nonemptyRestore = command("bash", ["scripts/restore.sh"], { ...process.env, RESTORE_DATABASE_URL: sourceUrl, BACKUP_PATH: archive, CONFIRM_EMPTY_RESTORE_TARGET: "YES" }, false);
  assert.notEqual(nonemptyRestore.status, 0);
  assert(nonemptyRestore.stderr.includes("existing user objects"));
  assert.deepEqual(await tableSnapshot(sourceUrl), before);
  pass("Restoration refuses a nonempty target and leaves all source rows unchanged");

  const corruptArchive = join(directory, "invalid.dump");
  await writeFile(corruptArchive, "This is not a PostgreSQL archive.", { mode: 0o600 });
  const invalidRestore = command("bash", ["scripts/restore.sh"], { ...process.env, RESTORE_DATABASE_URL: restoredUrl, BACKUP_PATH: corruptArchive, CONFIRM_EMPTY_RESTORE_TARGET: "YES" }, false);
  assert.notEqual(invalidRestore.status, 0);
  assert.deepEqual(await tableSnapshot(restoredUrl), {});
  pass("Invalid archive is rejected without creating tables in the target");

  const namespaceClient = new Client({ connectionString: restoredUrl });
  await namespaceClient.connect();
  try {
    await namespaceClient.query("CREATE SCHEMA pgexample");
    const namespaceRestore = command("bash", ["scripts/restore.sh"], { ...process.env, RESTORE_DATABASE_URL: restoredUrl, BACKUP_PATH: archive, CONFIRM_EMPTY_RESTORE_TARGET: "YES" }, false);
    assert.notEqual(namespaceRestore.status, 0);
    assert(namespaceRestore.stderr.includes("existing user objects"));
    assert.equal((await namespaceClient.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname='pgexample'")).rows[0]?.count, 1);
    await namespaceClient.query("DROP SCHEMA pgexample");
  } finally { await namespaceClient.end(); }
  pass("Restoration also refuses an otherwise empty database containing a custom schema without removing it");

  command("bash", ["scripts/restore.sh"], { ...process.env, RESTORE_DATABASE_URL: restoredUrl, BACKUP_PATH: archive, CONFIRM_EMPTY_RESTORE_TARGET: "YES" });
  assert.deepEqual(await tableSnapshot(restoredUrl), before);
  evidence.restoredTables = before;
  pass("Every restored public table matches the source row count and full row-content SHA256");
  restored = new PrismaClient({ adapter: new PrismaPg({ connectionString: restoredUrl }) });
  const saved = await restored.order.findUniqueOrThrow({ where: { number: order.number }, include: { items: true, history: true } });
  assert.equal(saved.paymentMethod, "COD");
  assert.equal(saved.paymentStatus, "UNPAID");
  assert.equal(saved.totalAgorot, 9500);
  assert.equal(saved.deliveryAgorot, 2000);
  assert.equal(saved.items[0]?.unitPriceAgorot, 7500);
  assert.equal(saved.items[0]?.productName, "خلطة الحناء المتكاملة");
  assert.equal(saved.history.length, 1);
  assert.equal((await restored.product.findUniqueOrThrow({ where: { id: product.id } })).priceAgorot, 8000);
  assert.equal((await restored.deliveryZone.findUniqueOrThrow({ where: { id: zone.id } })).feeAgorot, 2500);
  pass("COD payment, order history and original 75 + 20 = 95 ILS snapshots survive restoration alongside newer catalog prices");

  const admin = await restored.user.findUniqueOrThrow({ where: { email: "backup-drill@example.invalid" }, include: { accounts: true } });
  const storedPassword = admin.accounts.find((account) => account.providerId === "credential")?.password;
  assert(storedPassword);
  assert.equal(await verifyPassword({ hash: storedPassword, password: adminPassword }), true);
  assert.equal(await verifyPassword({ hash: storedPassword, password: randomBytes(32).toString("base64url") }), false);
  assert.equal(admin.role, "ADMIN");
  pass("Restored private administrator credential hash verifies the correct password and rejects a wrong password");
  const image = await restored.productImage.findFirstOrThrow({ where: { productId: product.id } });
  assert.equal(image.url, "/catalog-media/2026-10-29/page-23.webp");
  assert.equal(image.originalKey, "product-assets/originals/2026-10-29/page-23.jpeg");
  assert((await readFile(resolve("public", image.url.slice(1)))).length > 0);
  pass("Restored image URL and original key still resolve to the separately preserved local media assets");

  const serviceCheck = command(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import assert from 'node:assert/strict';
    const {db}=await import('./src/lib/db.ts');
    const {lookupOrder,createOrder}=await import('./src/lib/order-service.ts');
    const tracked=await lookupOrder(process.env.DRILL_TRACKING_TOKEN);
    assert.equal(tracked.number,process.env.DRILL_ORDER_NUMBER);
    assert.equal(tracked.totalAgorot,9500);
    assert(!('phone' in tracked));assert(!('address' in tracked));
    const replayed=await createOrder(JSON.parse(process.env.DRILL_ORDER_REQUEST));
    assert.equal(replayed.number,tracked.number);
    assert.equal(await db.order.count(),1);
    await db.$disconnect();
    console.log('Restored tracking and idempotent replay passed.');
  `], { ...process.env, DATABASE_URL: restoredUrl, DRILL_TRACKING_TOKEN: order.trackingToken, DRILL_ORDER_NUMBER: order.number, DRILL_ORDER_REQUEST: JSON.stringify(request) });
  assert(serviceCheck.stdout.includes("passed"));
  pass("Secure tracking and idempotent retry function on the restored database without exposing PII or creating a second order");
  command(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { ...process.env, DATABASE_URL: restoredUrl });
  command(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], { ...process.env, DATABASE_URL: restoredUrl });
  assert.equal(await restored.order.count(), 1);
  assert.equal((await restored.product.findUniqueOrThrow({ where: { id: product.id } })).priceAgorot, 8000);
  assert.equal((await restored.deliveryZone.findUniqueOrThrow({ where: { id: zone.id } })).feeAgorot, 2500);
  pass("Redeploy migrations and seed preserve the restored order and administrative price changes");
  evidence.result = "passed";
} catch (error) {
  evidence.result = "failed";
  evidence.error = error instanceof Error ? error.message.split(password).join("[REDACTED]").split(adminPassword).join("[REDACTED]") : "Unknown error";
  throw error;
} finally {
  await serviceDatabase?.db.$disconnect();
  await source?.$disconnect();
  await restored?.$disconnect();
  if (started) await postgres.stop();
  await rm(directory, { recursive: true, force: true });
  evidence.checks = checkNames;
  evidence.checkCount = checkNames.length;
  evidence.cleanup = { temporaryClusterAndSyntheticArchiveRemoved: true };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/backup-restore-drill.json", JSON.stringify(evidence, null, 2) + "\n");
}
