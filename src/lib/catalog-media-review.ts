import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";

const pageNumber = z.number().int().min(1).max(10000);
const pages = z.array(pageNumber).max(200);
const note = z.string().trim().max(10000);
const productReviewSchema = z.object({
  slug: z.string().max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  catalogName: z.string().max(250),
  printedName: z.string().max(250).nullable().optional(),
  pages,
  notes: z.array(note).max(100).default([]),
  ownerResolution: note.optional(),
  confirmedAt: z.string().max(100).optional(),
  usageConflict: z.object({
    sources: z.array(z.object({ page: pageNumber, text: note })).max(30),
    status: z.enum(["PENDING", "RESOLVED"]),
    ownerResolution: note.optional(),
    confirmedAt: z.string().max(100).optional(),
  }).optional(),
});
const unassignedSchema = z.object({
  pages,
  label: z.string().max(500),
  reason: note,
});
const imageSchema = z.object({
  page: pageNumber,
  url: z.string().max(2000).regex(/^\/catalog-media\/\d{4}-\d{2}-\d{2}\/page-\d{2,4}\.webp$/),
  originalKey: z.string().max(1000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  width: z.number().int().min(1).max(50000),
  height: z.number().int().min(1).max(50000),
});

export type CatalogProductReview = z.infer<typeof productReviewSchema>;
export type CatalogReviewImage = z.infer<typeof imageSchema>;
export type CatalogMediaReview = {
  sourceName: string;
  receivedAt: string;
  summary: string;
  products: CatalogProductReview[];
  unassigned: z.infer<typeof unassignedSchema>[];
  images: CatalogReviewImage[];
  invalidRecords: boolean;
};

function parseList<T>(value: unknown, schema: z.ZodType<T>) {
  if (!Array.isArray(value)) return { values: [] as T[], invalid: value !== undefined };
  const values: T[] = [];
  let invalid = value.length > 500;
  for (const candidate of value.slice(0, 500)) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) values.push(parsed.data);
    else invalid = true;
  }
  return { values, invalid };
}

/** Only the known review fields are used; arbitrary JSON is never rendered. */
export function parseCatalogMediaReview(value: unknown): CatalogMediaReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const products = parseList(raw.products, productReviewSchema);
  const unassigned = parseList(raw.unassigned, unassignedSchema);
  const images = parseList(raw.images, imageSchema);
  return {
    sourceName: typeof raw.sourceName === "string" ? raw.sourceName.slice(0, 500) : "ملف صور المنتجات",
    receivedAt: typeof raw.receivedAt === "string" ? raw.receivedAt.slice(0, 100) : "",
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 10000) : "",
    products: products.values,
    unassigned: unassigned.values,
    images: images.values,
    invalidRecords: products.invalid || unassigned.invalid || images.invalid,
  };
}

/** Call only after ensureAdminPage: source-review metadata is administrative. */
export async function getCatalogMediaReview() {
  const row = await db.siteSetting.findUnique({ where: { key: "catalogMediaReview" } });
  return parseCatalogMediaReview(row?.value);
}
