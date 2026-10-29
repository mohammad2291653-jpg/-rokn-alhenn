import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { isFreePreview } from "./preview-access";
import { addressArea, addressMentions, normalizeAddress } from "./delivery";
import { isRetryableTransactionError, withTransactionRetry } from "./transaction-retry";

export class OrderError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_ORDER") { super(message); }
}

export const itemSchema = z.object({productId:z.string().min(1).max(100), quantity:z.number().int().min(1).max(99)}).strict();
const itemsSchema = z.array(itemSchema).min(1).max(50).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.productId)).size !== items.length)
    ctx.addIssue({code:"custom", message:"يوجد منتج مكرر في السلة؛ حدّثي الكمية في سطر واحد."});
});
export const quoteSchema = z.object({
  items:itemsSchema, zoneId:z.string().min(1).max(100),
  city:z.string().trim().max(100).optional(), address:z.string().trim().max(500).optional(),
}).strict();
export const orderSchema = z.object({
  items:itemsSchema, zoneId:z.string().min(1).max(100),
  city:z.string().trim().min(2).max(100), address:z.string().trim().min(8).max(500),
  customerName:z.string().trim().min(3).max(120),
  phone:z.string().trim().regex(/^(?:\+?(?:970|972)|0)?5\d{8}$/, "أدخلي رقم هاتف فلسطيني صحيحًا."),
  notes:z.string().trim().max(1000).optional(), idempotencyKey:z.string().uuid(),
  acceptPolicies:z.literal(true),
}).strict();
export type CreateOrderInput = z.infer<typeof orderSchema>;
export type QuoteOrderInput = z.infer<typeof quoteSchema>;

type Tx = Prisma.TransactionClient;
type PricedItem = {productId:string; productName:string; weightGrams:number; unitPriceAgorot:number; quantity:number; totalAgorot:number};

function parse<T>(schema:z.ZodType<T>, input:unknown):T {
  const result = schema.safeParse(input);
  if (!result.success) throw new OrderError(result.error.issues[0]?.message ?? "تحقّقي من بيانات الطلب.");
  return result.data;
}

async function calculate(tx:Tx, input:QuoteOrderInput) {
  const zone = await tx.deliveryZone.findUnique({where:{id:input.zoneId},include:{cities:{where:{enabled:true}}}});
  const text = `${input.city ?? ""} ${input.address ?? ""}`;
  const area = addressArea(text);
  if (area === "gaza" || zone?.code === "gaza") throw new OrderError("التوصيل غير متاح حاليًا إلى غزة.",400,"UNSUPPORTED_AREA");
  if (!zone || !zone.enabled) throw new OrderError("اختاري منطقة توصيل مدعومة.",400,"UNSUPPORTED_AREA");
  if (area === "jerusalem" && zone.code !== "jerusalem") throw new OrderError("العنوان يشير إلى القدس؛ يرجى تصحيح المنطقة وتأكيد تكلفة التوصيل.",400,"REGION_MISMATCH");
  if (!zone.approved || zone.feeAgorot === null) throw new OrderError("توصيل القدس وتكلفته يحتاجان إلى تأكيد المتجر قبل إتمام الطلب.",400,"PENDING_DELIVERY");
  if (!Number.isSafeInteger(zone.feeAgorot) || zone.feeAgorot < 0) throw new OrderError("إعدادات التوصيل تحتاج مراجعة المتجر.",503,"INVALID_CONFIGURATION");
  if (input.city) {
    const city = zone.cities.find((city) => normalizeAddress(city.name) === normalizeAddress(input.city!));
    if (!city) throw new OrderError("المدينة لا تتوافق مع المنطقة المختارة؛ اختاري مدينة معتمدة أو تواصلي معنا لإضافتها.",400,"REGION_MISMATCH");
    const otherCities = await tx.city.findMany({where:{enabled:true,zoneId:{not:zone.id}},select:{name:true}});
    if (otherCities.some((other) => addressMentions(input.address ?? "",other.name)))
      throw new OrderError("العنوان يتعارض مع منطقة التوصيل؛ يرجى تصحيح المنطقة أو العنوان.",400,"REGION_MISMATCH");
  }
  const products = await tx.product.findMany({where:{id:{in:input.items.map((item)=>item.productId)}},include:{images:{take:1}}});
  const items:PricedItem[] = input.items.map((item) => {
    const product = products.find((p)=>p.id===item.productId);
    if (!product || product.status !== "PUBLISHED" || !product.available || product.images.length === 0 || product.nameNeedsConfirmation)
      throw new OrderError("أحد المنتجات غير متوفر للشراء؛ يرجى تحديث السلة.",409,"UNAVAILABLE_PRODUCT");
    if (!Number.isSafeInteger(product.priceAgorot) || product.priceAgorot <= 0 || product.priceAgorot > 100_000_000)
      throw new OrderError("سعر المنتج يحتاج مراجعة المتجر.",503,"INVALID_CONFIGURATION");
    if (product.stockTracked && (product.stockQuantity === null || product.stockQuantity < item.quantity))
      throw new OrderError("الكمية المطلوبة غير متاحة؛ يرجى تحديث السلة.",409,"UNAVAILABLE_PRODUCT");
    return {productId:product.id,productName:product.name,weightGrams:product.weightGrams,unitPriceAgorot:product.priceAgorot,quantity:item.quantity,totalAgorot:product.priceAgorot*item.quantity};
  });
  const subtotalAgorot = items.reduce((sum,item)=>sum+item.totalAgorot,0);
  const totalAgorot = subtotalAgorot+zone.feeAgorot;
  if (!Number.isSafeInteger(totalAgorot) || totalAgorot > 1_000_000_000)
    throw new OrderError("قيمة الطلب تتجاوز الحد المسموح؛ تواصلي مع المتجر.");
  return {items,subtotalAgorot,deliveryAgorot:zone.feeAgorot,totalAgorot,currency:"ILS",zone:{id:zone.id,name:zone.name,code:zone.code}};
}

export async function quoteOrder(raw:unknown) {
  if (isFreePreview()) throw new OrderError("المعاينة لا تستقبل طلبات أو بيانات توصيل.",503,"PREVIEW_READ_ONLY");
  const input = parse(quoteSchema,raw);
  return db.$transaction(async (tx)=>calculate(tx,input),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}

function key() {
  const secret = process.env.ORDER_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new OrderError("إعدادات حماية الطلبات غير مكتملة.",503,"INVALID_CONFIGURATION");
  return createHash("sha256").update(secret).digest();
}
function seal(token:string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm",key(),iv);
  const encrypted = Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString("base64url");
}
function unseal(sealed:string) {
  const data = Buffer.from(sealed,"base64url");
  const decipher = createDecipheriv("aes-256-gcm",key(),data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString("utf8");
}
function hash(value:string) { return createHash("sha256").update(value).digest("hex"); }

const summarySelect = {
  number:true,status:true,paymentStatus:true,paymentMethod:true,currency:true,
  subtotalAgorot:true,deliveryAgorot:true,totalAgorot:true,createdAt:true,
  items:{select:{productId:true,productName:true,weightGrams:true,quantity:true,unitPriceAgorot:true,totalAgorot:true}},
} satisfies Prisma.OrderSelect;

async function replay(tx:Tx, idempotencyKey:string, requestHash:string) {
  const existing = await tx.order.findUnique({where:{idempotencyKey},select:{...summarySelect,requestHash:true,trackingTokenSealed:true}});
  if (!existing) return null;
  if (existing.requestHash !== requestHash) throw new OrderError("رمز إرسال الطلب مستخدم لطلب مختلف؛ أعيدي المحاولة من السلة.",409,"IDEMPOTENCY_CONFLICT");
  const {requestHash:_requestHash,trackingTokenSealed,...summary} = existing;
  void _requestHash;
  return {...summary,trackingToken:unseal(trackingTokenSealed)};
}

export async function createOrder(raw:unknown) {
  if (isFreePreview()) throw new OrderError("المعاينة لا تستقبل طلبات أو بيانات توصيل.",503,"PREVIEW_READ_ONLY");
  const input = parse(orderSchema,raw);
  if (process.env.NODE_ENV === "production" && process.env.COMMERCIAL_LAUNCH_APPROVED !== "true")
    throw new OrderError("المتجر في مرحلة المعاينة ولا يستقبل طلبات تجارية بعد.",503,"LAUNCH_NOT_APPROVED");
  const normalized = {...input,items:[...input.items].sort((a,b)=>a.productId.localeCompare(b.productId))};
  const requestHash = hash(JSON.stringify(normalized));
  try {
    return await withTransactionRetry(() => db.$transaction(async (tx) => {
      const existing = await replay(tx,input.idempotencyKey,requestHash);
      if (existing) return existing;
      const settings = await tx.siteSetting.findMany({where:{key:{in:["checkoutEnabled","returns","privacy","terms"]}}});
      const checkout = settings.find((s)=>s.key==="checkoutEnabled")?.value;
      const policiesApproved = ["returns","privacy","terms"].every((key)=>{
        const policy = settings.find((s)=>s.key===key)?.value;
        return policy && typeof policy === "object" && !Array.isArray(policy) && policy.approved === true;
      });
      if (checkout !== true || !policiesApproved)
        throw new OrderError("استقبال الطلبات متوقف لحين اعتماد بيانات المتجر والسياسات. يسعدنا تواصلك عبر واتساب.",503,"CHECKOUT_DISABLED");
      const priced = await calculate(tx,input);
      const reservations = new Map<string, boolean>();
      for (const item of priced.items) {
        const product = await tx.product.findUniqueOrThrow({where:{id:item.productId},select:{stockTracked:true}});
        reservations.set(item.productId, product.stockTracked);
        if (product.stockTracked) {
          const update = await tx.product.updateMany({where:{id:item.productId,stockQuantity:{gte:item.quantity}},data:{stockQuantity:{decrement:item.quantity}}});
          if (update.count !== 1) throw new OrderError("الكمية المطلوبة لم تعد متاحة؛ حدّثي السلة.",409,"UNAVAILABLE_PRODUCT");
        }
      }
      const trackingToken = randomBytes(32).toString("base64url");
      const number = `RA-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${randomBytes(5).toString("hex").toUpperCase()}`;
      const order = await tx.order.create({data:{
        number,customerName:input.customerName,phone:input.phone,zoneId:priced.zone.id,zoneName:priced.zone.name,
        city:input.city,address:input.address,notes:input.notes,
        subtotalAgorot:priced.subtotalAgorot,deliveryAgorot:priced.deliveryAgorot,totalAgorot:priced.totalAgorot,
        trackingTokenHash:hash(trackingToken),trackingTokenSealed:seal(trackingToken),idempotencyKey:input.idempotencyKey,requestHash,
        items:{create:priced.items.map((item)=>({...item,inventoryReserved:reservations.get(item.productId) ?? false}))},history:{create:{status:"NEW",paymentStatus:"UNPAID",note:"تم إنشاء الطلب بالدفع عند الاستلام."}},
      },select:summarySelect});
      return {...order,trackingToken};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:15000}));
  } catch (error) {
    if (isRetryableTransactionError(error))
      throw new OrderError("تعذّر حفظ الطلب الآن؛ يرجى إعادة المحاولة.",503,"ORDER_BUSY");
    throw error;
  }
}

export async function lookupOrder(token:string) {
  if (isFreePreview()) throw new OrderError("متابعة الطلبات غير متاحة في المعاينة.",503,"PREVIEW_READ_ONLY");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new OrderError("تعذّر العثور على الطلب بهذا الرمز.",404,"NOT_FOUND");
  const order = await db.order.findUnique({where:{trackingTokenHash:hash(token)},select:{...summarySelect,history:{select:{status:true,paymentStatus:true,createdAt:true},orderBy:{createdAt:"asc"}}}});
  if (!order) throw new OrderError("تعذّر العثور على الطلب بهذا الرمز.",404,"NOT_FOUND");
  return order;
}
