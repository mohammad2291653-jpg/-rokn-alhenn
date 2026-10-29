import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'config/final-product-media-2026-10-29.json');
const mediaDirectory = join(root, 'public/final-product-images/2026-10-29');
const expectedSlugs = [
  'ground-henna', 'sidr-powder', 'integrated-henna', 'dark-color-powder',
  'red-mashat-mask', 'red-mashat-powder', 'sidr-mask',
];
const requiredCatalog = [...expectedSlugs, 'green-mashat-mask', 'green-mashat-powder'].sort();
const fileHash = bytes => createHash('sha256').update(bytes).digest('hex');

async function main() {
  // This job changes ONLY image rows. It is intentionally restricted to the dedicated
  // read-only free preview, which does not accept orders and has a known database name.
  const env = process.env;
  if (env.RENDER_FREE_PREVIEW !== 'true' ||
      env.COMMERCIAL_LAUNCH_APPROVED !== 'false' ||
      env.ALLOW_INDEXING !== 'false') {
    throw new Error('Final media synchronization is allowed only in a disabled-checkout preview.');
  }
  let target;
  try { target = new URL(env.DATABASE_URL); }
  catch { throw new Error('A dedicated preview DATABASE_URL is required.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
      decodeURIComponent(target.pathname.slice(1)) !== env.FREE_PREVIEW_DATABASE_NAME ||
      !env.FREE_PREVIEW_DATABASE_NAME || !target.username || !target.password) {
    throw new Error('Refusing final image synchronization against an unapproved database.');
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== '2026-10-29' || manifest.images?.length !== 7 ||
      JSON.stringify(manifest.images.map(x => x.slug).sort()) !==
        JSON.stringify([...expectedSlugs].sort())) {
    throw new Error('The final product photo manifest is incomplete or mismatched.');
  }
  const assets = [];
  for (const item of manifest.images) {
    if (!/^[a-z0-9_-]+\.jpe?g$/.test(item.file) ||
        item.url !== '/final-product-images/2026-10-29/' + item.file ||
        item.width !== 1122 || item.height !== 1402 ||
        !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new Error('The final image manifest contains an invalid path or metadata.');
    }
    const source = await readFile(join(mediaDirectory, item.file));
    if (source.byteLength !== item.sizeBytes || fileHash(source) !== item.sha256 ||
        source[0] !== 0xff || source[1] !== 0xd8 ||
        source[source.length - 2] !== 0xff || source[source.length - 1] !== 0xd9) {
      throw new Error('The final JPEG does not exactly match the supplied original: ' + item.file);
    }
    assets.push(item);
  }

  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
    query_timeout: 30000,
    application_name: 'rokn-final-product-images-preview',
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [72656499]);
      const orders = await client.query('SELECT COUNT(*)::int AS count FROM public."Order"');
      const checkout = await client.query('SELECT "value" FROM public."SiteSetting" WHERE "key" = $1', ['checkoutEnabled']);
      if (orders.rows[0].count !== 0 || checkout.rows[0]?.value !== false) {
        throw new Error('Refusing image replacement when orders exist or checkout is enabled.');
      }
      const products = await client.query('SELECT id, slug FROM public."Product" ORDER BY slug');
      if (JSON.stringify(products.rows.map(x => x.slug)) !== JSON.stringify(requiredCatalog)) {
        throw new Error('The nine catalog products do not match the approved product slugs.');
      }
      const productIds = new Map(products.rows.map(x => [x.slug, x.id]));
      const previous = await client.query('SELECT p.slug, i.url, i.alt, i.position, i."originalKey" FROM public."ProductImage" i JOIN public."Product" p ON p.id = i."productId" ORDER BY p.slug, i.position');
      const expected = assets.map(a => ({slug: a.slug, url: a.url, alt: a.alt, position: 0, originalKey: 'final-owner-upload/2026-10-29/' + a.file})).sort((a,b) => a.slug.localeCompare(b.slug));
      const actual = previous.rows.map(x => ({slug: x.slug, url: x.url, alt: x.alt, position: x.position, originalKey: x.originalKey})).sort((a,b) => a.slug.localeCompare(b.slug));
      const needsReplacement = JSON.stringify(actual) !== JSON.stringify(expected);
      if (needsReplacement) {
        // One atomic transaction: either seven correct images replace ALL previous
        // product-image rows, or nothing changes.
        await client.query('DELETE FROM public."ProductImage"');
        for (const item of assets) {
          await client.query(
            'INSERT INTO public."ProductImage" (id, "productId", url, "originalKey", alt, position, "createdAt") VALUES ($1,$2,$3,$4,$5,0,NOW())',
            ['final-photo-' + item.slug, productIds.get(item.slug), item.url, 'final-owner-upload/2026-10-29/' + item.file, item.alt],
          );
        }
        await client.query(
          'INSERT INTO public."SiteSetting" ("key", "value", "updatedAt") VALUES ($1,$2::jsonb,NOW()) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()',
          ['finalProductMediaVersion', JSON.stringify({version:manifest.version, images:7, originalBytesVerified:true})],
        );
      }

      // Only on a BRAND NEW preview database, fill missing descriptions/usage
      // from the already approved existing review. Never replace an existing value.
      if (process.argv.includes('--seed-metadata')) {
        const reviewed = JSON.parse(await readFile(join(root, 'config/catalog-media-review-2026-10-29.json'), 'utf8'));
        for (const item of reviewed.products || []) {
          if (!productIds.has(item.slug)) continue;
          await client.query(
            'UPDATE public."Product" SET ingredients = COALESCE(ingredients,$1), usage = COALESCE(usage,$2), warnings = COALESCE(warnings,$3) WHERE slug = $4',
            [item.ingredients ?? null, item.usage ?? null, item.warnings ?? null, item.slug],
          );
        }
      }
      const after = await client.query('SELECT p.slug, i.url FROM public."ProductImage" i JOIN public."Product" p ON p.id=i."productId" ORDER BY p.slug');
      if (after.rows.length !== 7 || after.rows.some(x => !expected.some(y => y.slug === x.slug && y.url === x.url))) {
        throw new Error('Final photo count or product mapping validation failed.');
      }
      await client.query('COMMIT');
      console.info(JSON.stringify({event:'final-product-media-sync', images:7, changed:needsReplacement, oldReferences:0, checkoutDisabled:true}));
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  } finally { await client.end(); }
}
main().catch(error => { console.error(JSON.stringify({event:'final-product-media-sync', result:'failed', reason:error.message})); process.exitCode=1; });
