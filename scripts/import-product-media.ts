import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import sharp from 'sharp';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../src/lib/db';

const manifestPath = 'config/catalog-media-review-2026-10-29.json';
const reportPath = 'artifacts/catalog-media-import-verification.json';
const imageSchema = z.object({
  page: z.number().int().min(1).max(26),
  file: z.string().regex(/^page-\d{2}\.jpeg$/),
  originalKey: z.string().regex(/^product-assets\/originals\/2026-10-29\/page-\d{2}\.jpeg$/),
  url: z.string().regex(/^\/catalog-media\/2026-10-29\/page-\d{2}\.webp$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive(), height: z.number().int().positive(),
  bytes: z.number().int().positive(),
}).passthrough();
const productSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  catalogName: z.string().min(1), printedName: z.string().min(1),
  pages: z.array(z.number().int().min(1).max(26)).min(1),
  ingredients: z.string().nullable().optional(),
  usage: z.string().nullable().optional(),
  warnings: z.string().nullable().optional(),
  usageConflict: z.object({ status: z.string() }).passthrough().optional(),
}).passthrough();
const manifestSchema = z.object({
  sourceName: z.string().min(1), sourcePdf: z.literal('product-assets/source/2026-10-29/products-source.pdf'),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  images: z.array(imageSchema).length(26),
  products: z.array(productSchema).min(1),
  unassigned: z.array(z.object({ pages: z.array(z.number().int().min(1).max(26)) }).passthrough()),
}).passthrough();
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function insideRoot(relativePath: string) {
  const path = resolve(relativePath);
  check(path.startsWith(process.cwd() + sep), 'Asset path escaped the repository.');
  return path;
}
const invariantSelect = {
  id: true, slug: true, name: true, priceAgorot: true, weightGrams: true,
  available: true, stockTracked: true, stockQuantity: true, status: true,
} satisfies Prisma.ProductSelect;

async function main() {
  const raw: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifest = manifestSchema.parse(raw);
  const pages = manifest.images.map((image) => image.page);
  check(new Set(pages).size === 26, 'Source page numbers must be unique.');
  check(new Set(manifest.products.map((product) => product.slug)).size === manifest.products.length, 'Product mappings contain a repeated slug.');
  const assignedPages = manifest.products.flatMap((product) => product.pages);
  check(new Set(assignedPages).size === assignedPages.length, 'A photograph must not be assigned to different products.');
  const unassignedPages = manifest.unassigned.flatMap((group) => group.pages);
  check(new Set([...assignedPages, ...unassignedPages]).size === 26 && assignedPages.length + unassignedPages.length === 26, 'Assigned and held photographs must form an exact non-overlapping source partition.');
  const images = new Map(manifest.images.map((image) => [image.page, image]));
  const pdf = await readFile(insideRoot(manifest.sourcePdf));
  check(sha256(pdf) === manifest.sourceSha256, 'Source PDF integrity check failed.');

  const verifiedAssets = [];
  for (const image of manifest.images) {
    const expectedStem = `page-${String(image.page).padStart(2, '0')}`;
    check(image.file === `${expectedStem}.jpeg` && image.originalKey.endsWith(`/${image.file}`) && image.url.endsWith(`/${expectedStem}.webp`), `Source page ${image.page} filenames do not match.`);
    const original = await readFile(insideRoot(image.originalKey));
    check(original.byteLength === image.bytes && sha256(original) === image.sha256, `Original photo ${image.page} integrity check failed.`);
    const originalMetadata = await sharp(original).metadata();
    check(originalMetadata.format === 'jpeg' && originalMetadata.width === image.width && originalMetadata.height === image.height, `Original photo ${image.page} metadata mismatch.`);
    const derivative = await readFile(insideRoot(`public${image.url}`));
    const metadata = await sharp(derivative).metadata();
    check(metadata.format === 'webp' && metadata.width && metadata.height, `Web photograph ${image.page} is missing or malformed.`);
    check(Math.abs(metadata.width / metadata.height - image.width / image.height) < 0.001, `Web photograph ${image.page} proportions changed.`);
    check(metadata.width <= image.width && metadata.height <= image.height, `Web photograph ${image.page} was upscaled.`);
    verifiedAssets.push({ page: image.page, originalSha256: image.sha256, originalBytes: original.byteLength, webBytes: derivative.byteLength, webSha256: sha256(derivative), width: metadata.width, height: metadata.height });
  }

  const outcome = await db.$transaction(async (tx) => {
    const beforeProducts = await tx.product.findMany({ select: invariantSelect, orderBy: { id: 'asc' } });
    const beforeCheckout = await tx.siteSetting.findUnique({ where: { key: 'checkoutEnabled' } });
    check(beforeCheckout?.value === false, 'Import requires checkout to remain disabled during owner review.');
    const beforeOrders = await tx.order.count();
    const importedBefore = await tx.productImage.count({ where: { originalKey: { startsWith: 'product-assets/originals/2026-10-29/' } } });
    let imagesCreated = 0;
    const filledFields: Array<{ slug: string; fields: string[] }> = [];
    const preservedExisting: Array<{ slug: string; fields: string[] }> = [];
    const usageHeld: string[] = [];
    const productResults = [];

    for (const mapping of manifest.products) {
      const product = await tx.product.findUnique({ where: { slug: mapping.slug }, include: { images: { orderBy: { position: 'asc' } } } });
      check(product, `Draft product ${mapping.slug} does not exist.`);
      check(product.status === 'DRAFT', `Refusing to overwrite non-draft product ${mapping.slug}.`);
      const data: Prisma.ProductUpdateInput = {};
      const filled: string[] = [];
      const preserved: string[] = [];
      if (!product.nameNeedsConfirmation) data.nameNeedsConfirmation = true;
      for (const field of ['ingredients', 'usage', 'warnings'] as const) {
        if (field === 'usage' && mapping.usageConflict?.status === 'PENDING') {
          usageHeld.push(mapping.slug);
          if (product.usage !== null) preserved.push(field);
          continue;
        }
        const incoming = mapping[field];
        if (product[field] !== null) { preserved.push(field); continue; }
        if (typeof incoming === 'string' && incoming.trim()) { data[field] = incoming; filled.push(field); }
      }
      if (Object.keys(data).length) await tx.product.update({ where: { id: product.id }, data });
      if (filled.length) filledFields.push({ slug: mapping.slug, fields: filled });
      if (preserved.length) preservedExisting.push({ slug: mapping.slug, fields: preserved });
      // Append any new photographs without moving or deleting owner-managed images.
      let position = product.images.length ? Math.max(...product.images.map((image) => image.position)) + 1 : 0;
      for (const page of mapping.pages) {
        const image = images.get(page);
        check(image, `Missing source page ${page}.`);
        const existing = await tx.productImage.findFirst({ where: { productId: product.id, OR: [{ url: image.url }, { originalKey: image.originalKey }] } });
        if (!existing) {
          await tx.productImage.create({ data: { productId: product.id, url: image.url, originalKey: image.originalKey, alt: `${mapping.printedName} — صورة أصلية من المالك، الصفحة ${page}`, position } });
          position += 1;
          imagesCreated += 1;
        }
      }
      const photoCount = await tx.productImage.count({ where: { productId: product.id, originalKey: { startsWith: 'product-assets/originals/2026-10-29/' } } });
      check(photoCount === mapping.pages.length, `Imported photo count mismatch for ${mapping.slug}.`);
      productResults.push({ slug: mapping.slug, importedPhotoCount: photoCount, status: product.status, nameNeedsConfirmation: true });
    }

    const attached = await tx.productImage.findMany({ where: { originalKey: { startsWith: 'product-assets/originals/2026-10-29/' } }, select: { url: true, originalKey: true, product: { select: { slug: true, status: true, nameNeedsConfirmation: true } } } });
    check(attached.length === assignedPages.length, 'Total assigned photograph count mismatch.');
    for (const heldPage of unassignedPages) {
      const image = images.get(heldPage);
      check(image && !attached.some((attachedImage) => attachedImage.originalKey === image.originalKey || attachedImage.url === image.url), 'An unconfirmed photograph was attached to a product.');
    }
    check(attached.every((image) => image.product.status === 'DRAFT' && image.product.nameNeedsConfirmation), 'Imported products must remain unpublished and pending review.');
    const afterProducts = await tx.product.findMany({ select: invariantSelect, orderBy: { id: 'asc' } });
    check(JSON.stringify(beforeProducts) === JSON.stringify(afterProducts), 'Import changed product names, prices, weights, status or inventory.');
    check((await tx.siteSetting.findUnique({ where: { key: 'checkoutEnabled' } }))?.value === beforeCheckout.value, 'Checkout setting changed.');
    check(await tx.order.count() === beforeOrders, 'Order count changed during the import.');
    const value = raw as Prisma.InputJsonValue;
    await tx.siteSetting.upsert({ where: { key: 'catalogMediaReview' }, create: { key: 'catalogMediaReview', value }, update: { value } });
    await tx.auditLog.create({ data: { action: imagesCreated ? 'PRODUCT_MEDIA_IMPORTED' : 'PRODUCT_MEDIA_IMPORT_RECHECKED', entityType: 'SiteSetting', entityId: 'catalogMediaReview', details: { sourceSha256: manifest.sourceSha256, imageCount: attached.length, imagesCreated, unassignedPages, products: manifest.products.map((mapping) => mapping.slug) } } });
    return { importedImagesBefore: importedBefore, importedImagesAfter: attached.length, imagesCreated, products: productResults, filledFields, preservedExisting, usageHeld, unassignedPages, monetaryAndInventoryInvariantsUnchanged: true, unassignedImagesNotAttached: true, checkoutRemainsDisabled: true, ordersUnchanged: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });

  await mkdir('artifacts', { recursive: true });
  let executions: unknown[] = [];
  try {
    const previous: unknown = JSON.parse(await readFile(reportPath, 'utf8'));
    if (previous && typeof previous === 'object' && 'sourceSha256' in previous && previous.sourceSha256 === manifest.sourceSha256 && 'executions' in previous && Array.isArray(previous.executions)) executions = previous.executions;
  } catch { /* First verified import has no prior execution artifact. */ }
  executions.push({ verifiedAt: new Date().toISOString(), ...outcome });
  await writeFile(reportPath, JSON.stringify({ result: 'passed', sourceName: manifest.sourceName, sourceSha256: manifest.sourceSha256, verifiedOriginalCount: verifiedAssets.length, verifiedAssets, expectedAssignedImages: assignedPages.length, expectedHeldImages: unassignedPages.length, executions }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', created: outcome.imagesCreated, attached: outcome.importedImagesAfter, draftProducts: outcome.products.length, unassigned: outcome.unassignedPages.length, checkoutRemainsDisabled: true }));
}

main().finally(() => db.$disconnect());
