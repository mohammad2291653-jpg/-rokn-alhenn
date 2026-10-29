import { NextResponse } from "next/server";
import { Prisma, OrderStatus, PaymentStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  assertSameOrigin,
  consumeRateLimit,
  HttpError,
  jsonError,
  readJson,
} from "@/lib/security";
import { verifyUploadedImage } from "@/lib/storage";
export const runtime = "nodejs";
const text = (max = 1000) => z.string().trim().max(max);
const slug = text(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const bool = z.boolean();
const integer = (min = 0, max = 1000000) =>
  z
    .union([z.number(), z.string().regex(/^\d+$/)])
    .transform((value) => Number(value))
    .pipe(z.number().int().min(min).max(max));
const identifier = text(180).min(1);
function price(value: unknown, nullable = false) {
  if (nullable && (value === "" || value === null)) return null;
  const raw = String(value);
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(raw))
    throw new HttpError("السعر غير صالح. استخدمي رقمًا حتى منزلتين عشريتين.");
  const [whole, fraction = ""] = raw.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (result > 10000000 || (!nullable && result < 1))
    throw new HttpError("السعر خارج الحدود المسموحة.");
  return result;
}
const productSchema = z.object({
  id: identifier.optional(),
  name: text(180).min(2),
  slug,
  weightGrams: integer(1, 100000),
  priceILS: z.union([z.string(), z.number()]),
  categoryId: identifier,
  description: text(10000),
  ingredients: text(10000),
  usage: text(10000),
  warnings: text(10000),
  status: z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]),
  available: bool,
  featured: bool,
  nameNeedsConfirmation: bool,
  stockTracked: bool,
  stockQuantity: z.union([z.string(), z.number(), z.null()]),
  images: z
    .array(
      z.object({
        id: identifier.optional(),
        url: text(2000).min(1),
        originalKey: text(500).nullable(),
        proof: text(200).optional(),
        alt: text(240).min(1),
        position: integer(0, 30),
      }),
    )
    .max(20),
});
async function saveProduct(raw: unknown, actorId: string) {
  const input = productSchema.parse(raw);
  const current = input.id
    ? await db.product.findUnique({
        where: { id: input.id },
        include: { images: true },
      })
    : null;
  if (input.id && !current) throw new HttpError("المنتج غير موجود.", 404);
  for (const image of input.images) {
    const saved = current?.images.find(
      (item) =>
        item.id === image.id &&
        item.url === image.url &&
        item.originalKey === image.originalKey,
    );
    if (!saved) {
      if (!image.originalKey) throw new HttpError("الصورة الأصلية مطلوبة.");
      verifyUploadedImage({
        url: image.url,
        originalKey: image.originalKey,
        proof: image.proof,
      });
    }
  }
  if (
    input.status === "PUBLISHED" &&
    (!input.images.length || input.nameNeedsConfirmation)
  )
    throw new HttpError("لن يُنشر المنتج قبل رفع صورته الأصلية وتأكيد اسمه.");
  const stockQuantity = input.stockTracked
    ? integer(0, 1000000).parse(input.stockQuantity)
    : null;
  const data = {
    name: input.name,
    slug: input.slug,
    weightGrams: input.weightGrams,
    priceAgorot: price(input.priceILS)!,
    categoryId: input.categoryId,
    description: input.description || null,
    ingredients: input.ingredients || null,
    usage: input.usage || null,
    warnings: input.warnings || null,
    status: input.status,
    available: input.available,
    featured: input.featured,
    nameNeedsConfirmation: input.nameNeedsConfirmation,
    stockTracked: input.stockTracked,
    stockQuantity,
  };
  return db.$transaction(
    async (tx) => {
      const saved = input.id
        ? await tx.product.update({ where: { id: input.id }, data })
        : await tx.product.create({ data });
      const retained = input.images
        .filter(
          (image) =>
            image.id &&
            current?.images.some(
              (old) =>
                old.id === image.id &&
                old.url === image.url &&
                old.originalKey === image.originalKey,
            ),
        )
        .map((image) => image.id!);
      await tx.productImage.deleteMany({
        where: { productId: saved.id, id: { notIn: retained } },
      });
      for (const [position, image] of input.images.entries()) {
        if (image.id && retained.includes(image.id))
          await tx.productImage.update({
            where: { id: image.id },
            data: { alt: image.alt, position },
          });
        else
          await tx.productImage.create({
            data: {
              productId: saved.id,
              url: image.url,
              originalKey: image.originalKey,
              alt: image.alt,
              position,
            },
          });
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: input.id ? "UPDATE" : "CREATE",
          entityType: "Product",
          entityId: saved.id,
          details: {
            name: saved.name,
            status: saved.status,
            priceAgorot: saved.priceAgorot,
          },
        },
      });
      return {
        id: saved.id,
        images: await tx.productImage.findMany({
          where: { productId: saved.id },
          orderBy: { position: "asc" },
          select: {
            id: true,
            url: true,
            originalKey: true,
            alt: true,
            position: true,
          },
        }),
      };
    },
    { isolationLevel: "Serializable" },
  );
}
async function checkedImage(
  raw: Record<string, unknown>,
  current: string | null | undefined,
) {
  const url = text(2000).parse(raw.imageUrl ?? "");
  if (!url) return null;
  if (url === current) return url;
  verifyUploadedImage({
    url,
    originalKey: text(500).min(1).parse(raw.imageUrlOriginalKey),
    proof: text(200).parse(raw.imageUrlProof),
  });
  return url;
}
async function saveSettings(raw: Record<string, unknown>, actorId: string) {
  const key = z
    .enum([
      "store",
      "checkoutEnabled",
      "returns",
      "privacy",
      "terms",
      "analytics",
    ])
    .parse(raw.key);
  let value: unknown;
  try {
    value = JSON.parse(z.string().max(60000).parse(raw.value));
  } catch {
    throw new HttpError("إعدادات غير صالحة.");
  }
  if (key === "store") {
    const social = (hosts: string[]) =>
      z
        .string()
        .url()
        .refine((v) => {
          const url = new URL(v);
          return url.protocol === "https:" && hosts.includes(url.hostname);
        });
    value = z
      .object({
        name: text(120).min(1),
        englishName: text(120).optional(),
        instagram: social(["instagram.com", "www.instagram.com"]),
        whatsapp: social(["wa.me"]),
        facebook: z.union([
          z.literal(""),
          z.null(),
          social(["facebook.com", "www.facebook.com"]),
        ]),
        logoUrl: text(2000).nullable().optional(),
        logoOriginalKey: text(500).nullable().optional(),
        logoProof: text(200).optional(),
      })
      .parse(value);
    const parsed = value as Record<string, unknown>;
    const existing = await db.siteSetting.findUnique({
      where: { key: "store" },
    });
    const old =
      existing?.value &&
      typeof existing.value === "object" &&
      !Array.isArray(existing.value)
        ? (existing.value as Record<string, unknown>)
        : {};
    if (
      parsed.logoUrl &&
      (parsed.logoUrl !== old.logoUrl ||
        parsed.logoOriginalKey !== old.logoOriginalKey)
    )
      verifyUploadedImage({
        url: String(parsed.logoUrl),
        originalKey: identifier.parse(parsed.logoOriginalKey),
        proof: parsed.logoProof as string | undefined,
      });
    delete parsed.logoProof;
    if (!parsed.logoUrl) parsed.logoOriginalKey = null;
  }
  if (["returns", "privacy", "terms"].includes(key))
    value = z
      .object({ body: text(30000).min(20), approved: bool })
      .parse(value);
  if (key === "analytics") {
    const object = z
      .object({
        enabled: z.literal(false),
        ga4Id: z.union([z.null(), text(40)]).optional(),
        metaPixelId: z.union([z.null(), text(40)]).optional(),
        searchConsoleVerification: z.union([z.null(), text(200)]).optional(),
      })
      .passthrough()
      .parse(value);
    value = object;
  }
  if (key === "checkoutEnabled") {
    value = bool.parse(value);
    if (value) {
      const [policies, productCount] = await Promise.all([
        db.siteSetting.findMany({
          where: { key: { in: ["returns", "privacy", "terms"] } },
        }),
        db.product.count({
          where: {
            status: "PUBLISHED",
            nameNeedsConfirmation: false,
            available: true,
            images: { some: {} },
          },
        }),
      ]);
      if (
        policies.length !== 3 ||
        policies.some(
          (policy) =>
            typeof policy.value !== "object" ||
            policy.value === null ||
            Array.isArray(policy.value) ||
            policy.value.approved !== true,
        ) ||
        !productCount
      )
        throw new HttpError(
          "يلزم اعتماد سياسات الاسترجاع والخصوصية والشروط ونشر منتج مراجع بصورته الأصلية قبل تفعيل الطلبات.",
        );
    }
  }
  return db.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "UPDATE_SETTING",
        entityType: "SiteSetting",
        entityId: key,
        details: { key },
      },
    });
    return key;
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const admin = await requireAdmin();
    assertSameOrigin(request);
    await consumeRateLimit(request, `admin-write:${admin.id}`, 180, 60000);
    const { resource } = await params;
    const raw = z
      .record(z.string(), z.unknown())
      .parse(await readJson(request));
    const operation = z.enum(["save", "delete"]).parse(raw.operation ?? "save");
    if (resource === "product") {
      if (operation !== "save")
        throw new HttpError("أخفي المنتج بدل حذفه للحفاظ على السجلات.");
      return NextResponse.json(await saveProduct(raw, admin.id));
    }
    if (resource === "settings") {
      if (operation !== "save")
        throw new HttpError("لا يمكن حذف إعدادات النظام.");
      return NextResponse.json({ id: await saveSettings(raw, admin.id) });
    }
    const id = raw.id ? identifier.parse(raw.id) : undefined;
    const entityMap: Record<string, string> = {
      category: "Category",
      section: "ContentSection",
      article: "Article",
      faq: "FAQ",
      discount: "Discount",
      zone: "DeliveryZone",
      city: "City",
      order: "Order",
    };
    if (!entityMap[resource]) throw new HttpError("المورد غير موجود.", 404);
    const result = await db.$transaction(
      async (tx) => {
        if (operation === "delete") {
          if (!id) throw new HttpError("السجل غير محدد.");
          if (resource === "category")
            await tx.category.delete({ where: { id } });
          else if (resource === "section")
            await tx.contentSection.delete({ where: { id } });
          else if (resource === "article")
            await tx.article.delete({ where: { id } });
          else if (resource === "faq") await tx.fAQ.delete({ where: { id } });
          else if (resource === "discount")
            await tx.discount.delete({ where: { id } });
          else if (resource === "city") await tx.city.delete({ where: { id } });
          else throw new HttpError("لا يمكن حذف هذا السجل؛ استخدمي التعطيل.");
          await tx.auditLog.create({
            data: {
              actorId: admin.id,
              action: "DELETE",
              entityType: entityMap[resource],
              entityId: id,
            },
          });
          return id;
        }
        let savedId: string;
        if (resource === "category") {
          const data = z
            .object({
              name: text(120).min(1),
              slug,
              position: integer(0, 10000),
            })
            .parse(raw);
          const item = id
            ? await tx.category.update({ where: { id }, data })
            : await tx.category.create({ data });
          savedId = item.id;
        } else if (resource === "zone") {
          if (!id)
            throw new HttpError(
              "المناطق المعتمدة تُعدّل فقط ولا يمكن إنشاء مناطق غير معتمدة.",
            );
          const input = z
            .object({
              code: z.enum(["west-bank", "interior", "jerusalem"]),
              name: text(120).min(1),
              enabled: bool,
              approved: bool,
            })
            .parse(raw);
          const existing = await tx.deliveryZone.findUnique({ where: { id } });
          if (!existing || existing.code !== input.code)
            throw new HttpError("المنطقة غير صالحة.");
          const feeAgorot = price(raw.feeILS, true);
          if (input.approved && feeAgorot === null)
            throw new HttpError("حددي رسم التوصيل قبل اعتماد المنطقة.");
          const item = await tx.deliveryZone.update({
            where: { id },
            data: {
              name: input.name,
              enabled: input.enabled,
              approved: input.approved,
              feeAgorot,
            },
          });
          savedId = item.id;
        } else if (resource === "city") {
          const data = z
            .object({
              name: text(120).min(1),
              zoneId: identifier,
              enabled: bool,
            })
            .parse(raw);
          if (
            /(?:غزة|غزه|gaza|rafah|رفح|خانيونس|خان يونس|جباليا|دير البلح|بيت حانون|بيت لاهيا)/i.test(
              data.name,
            )
          )
            throw new HttpError("التوصيل غير متاح حاليًا إلى غزة.");
          const item = id
            ? await tx.city.update({ where: { id }, data })
            : await tx.city.create({ data });
          savedId = item.id;
        } else if (resource === "section") {
          const input = z
            .object({
              key: text(100)
                .min(1)
                .regex(/^[a-z0-9-]+$/),
              title: text(250).min(1),
              body: text(30000),
              enabled: bool,
              position: integer(0, 10000),
            })
            .parse(raw);
          const current = id
            ? await tx.contentSection.findUnique({ where: { id } })
            : null;
          const imageUrl = await checkedImage(raw, current?.imageUrl);
          const data = { ...input, imageUrl };
          const item = id
            ? await tx.contentSection.update({ where: { id }, data })
            : await tx.contentSection.create({ data });
          savedId = item.id;
        } else if (resource === "article") {
          const input = z
            .object({
              title: text(250).min(1),
              slug,
              excerpt: text(1000).min(1),
              body: text(50000).min(20),
              published: bool,
              reviewed: bool,
            })
            .parse(raw);
          if (input.published && !input.reviewed)
            throw new HttpError("يلزم مراجعة المقال قبل نشره.");
          const current = id
            ? await tx.article.findUnique({ where: { id } })
            : null;
          const imageUrl = await checkedImage(raw, current?.imageUrl);
          const data = {
            ...input,
            imageUrl,
            publishedAt: input.published
              ? (current?.publishedAt ?? new Date())
              : null,
          };
          const item = id
            ? await tx.article.update({ where: { id }, data })
            : await tx.article.create({ data });
          savedId = item.id;
        } else if (resource === "faq") {
          const data = z
            .object({
              question: text(500).min(1),
              answer: text(5000).min(1),
              published: bool,
              position: integer(0, 10000),
            })
            .parse(raw);
          const item = id
            ? await tx.fAQ.update({ where: { id }, data })
            : await tx.fAQ.create({ data });
          savedId = item.id;
        } else if (resource === "discount") {
          const input = z
            .object({
              code: text(50)
                .min(1)
                .regex(/^[a-zA-Z0-9_-]+$/),
              title: text(180).min(1),
              percent: integer(1, 100),
            })
            .parse(raw);
          if (raw.active === true)
            throw new HttpError(
              "تفعيل الخصومات يحتاج اعتماد آلية تطبيقها؛ تُحفظ العروض كمسودات.",
            );
          const data = { ...input, active: false, approved: false };
          const item = id
            ? await tx.discount.update({ where: { id }, data })
            : await tx.discount.create({ data });
          savedId = item.id;
        } else {
          if (!id) throw new HttpError("الطلب غير محدد.");
          const input = z
            .object({
              status: z.nativeEnum(OrderStatus),
              paymentStatus: z.nativeEnum(PaymentStatus),
              internalNotes: text(10000),
            })
            .parse(raw);
          const current = await tx.order.findUnique({
            where: { id },
            include: { items: true },
          });
          if (!current) throw new HttpError("الطلب غير موجود.", 404);
          if (
            input.paymentStatus === "COLLECTED" &&
            input.status !== "DELIVERED"
          )
            throw new HttpError("سجلي التحصيل عند تسليم الطلب.");
          if (
            input.paymentStatus === "REFUNDED" &&
            !["COLLECTED", "REFUNDED"].includes(current.paymentStatus)
          )
            throw new HttpError("لا يمكن تسجيل إعادة مبلغ لم يُسجل تحصيله.");
          if (current.status === "CANCELLED" && input.status !== "CANCELLED")
            throw new HttpError(
              "الطلب الملغى لا يُعاد فتحه؛ أنشئي طلبًا جديدًا بعد مراجعة المخزون.",
            );
          if (
            current.paymentStatus === "COLLECTED" &&
            ["UNPAID", "CANCELLED"].includes(input.paymentStatus)
          )
            throw new HttpError("سجلي إعادة المبلغ بدل حذف أثر التحصيل.");
          if (
            current.paymentStatus === "REFUNDED" &&
            input.paymentStatus !== "REFUNDED"
          )
            throw new HttpError("لا يمكن محو أثر إعادة المبلغ من السجل.");
          if (
            input.status === "CANCELLED" &&
            current.status !== "CANCELLED" &&
            !current.inventoryReleasedAt
          ) {
            for (const item of current.items) {
              if (item.inventoryReserved && item.productId)
                await tx.product.updateMany({
                  where: { id: item.productId, stockQuantity: { not: null } },
                  data: { stockQuantity: { increment: item.quantity } },
                });
            }
          }
          await tx.order.update({
            where: { id },
            data: {
              ...input,
              ...(input.status === "CANCELLED" &&
              current.status !== "CANCELLED" &&
              !current.inventoryReleasedAt
                ? { inventoryReleasedAt: new Date() }
                : {}),
            },
          });
          await tx.orderStatusHistory.create({
            data: {
              orderId: id,
              status: input.status,
              paymentStatus: input.paymentStatus,
              actorId: admin.id,
              note:
                input.internalNotes !== current.internalNotes
                  ? "تحديث الحالة والملاحظات الداخلية"
                  : "تحديث الحالة",
            },
          });
          savedId = id;
        }
        await tx.auditLog.create({
          data: {
            actorId: admin.id,
            action: id ? "UPDATE" : "CREATE",
            entityType: entityMap[resource],
            entityId: savedId,
          },
        });
        return savedId;
      },
      { isolationLevel: "Serializable" },
    );
    return NextResponse.json({ id: result });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return jsonError(
        new HttpError("توجد قيمة مكررة؛ راجعي الرابط المختصر أو الرمز."),
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    )
      return jsonError(
        new HttpError("السجل مرتبط ببيانات أخرى ولا يمكن حذفه."),
      );
    return jsonError(error);
  }
}
