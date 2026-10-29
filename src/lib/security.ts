import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(message: string, public status = 400, public code = 'INVALID_REQUEST') { super(message); }
}
export function siteOrigin() {
  const value = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new HttpError('إعداد عنوان المتجر غير مكتمل.', 503);
  return new URL(value).origin;
}
export function assertSameOrigin(request: Request) {
  if (request.headers.get('origin') !== siteOrigin()) throw new HttpError('تعذّر التحقق من مصدر الطلب.', 403, 'ORIGIN_REJECTED');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin','none'].includes(fetchSite)) throw new HttpError('طلب غير مسموح.',403);
}
export async function consumeRateLimit(request: Request, bucket: string, limit: number, windowMs: number) {
  // Only honor a proxy header when deployment explicitly guarantees stripping incoming values.
  const ip = process.env.TRUST_PROXY === 'true' ? (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown') : 'shared';
  const key = createHmac('sha256', process.env.BETTER_AUTH_SECRET || 'local-rate-bucket').update(`${bucket}:${ip}`).digest('hex');
  const expiresAt = new Date(Date.now() + windowMs);
  const result = await db.$queryRaw<Array<{count:number}>>`
    INSERT INTO "RateLimit" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateLimit"."expiresAt" < NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
    "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < NOW() THEN ${expiresAt} ELSE "RateLimit"."expiresAt" END
    RETURNING "count"`;
  if (result[0].count > limit) throw new HttpError('طلبات كثيرة. يرجى المحاولة لاحقًا.', 429, 'RATE_LIMITED');
}
export function jsonError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({error:'يرجى مراجعة البيانات المدخلة.',code:'VALIDATION_ERROR'}, {status:400});
  if (error instanceof Error && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status <= 599) {
    return NextResponse.json({error:error.message,code: 'code' in error ? error.code : 'REQUEST_ERROR'}, {status:error.status});
  }
  console.error('request_failed', error instanceof Error ? error.name : 'UnknownError');
  return NextResponse.json({error:'تعذّر إتمام العملية الآن. يرجى المحاولة لاحقًا.',code:'INTERNAL_ERROR'}, {status:500});
}
export async function readBody(request: Request, max: number): Promise<Uint8Array> {
  const length=request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length)>max)) throw new HttpError('حجم الطلب أكبر من المسموح.',413);
  if (!request.body) return new Uint8Array();
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    while(true) {
      const chunk=await reader.read(); if(chunk.done) break;
      size+=chunk.value.byteLength;
      if(size>max) { await reader.cancel(); throw new HttpError('حجم الطلب أكبر من المسموح.',413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size); let offset=0;
  for(const chunk of chunks) { bytes.set(chunk,offset);offset+=chunk.byteLength; }
  return bytes;
}
export async function readJson(request: Request) {
  const bytes=await readBody(request,64*1024);
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new HttpError('بيانات الطلب غير صالحة.'); }
}
export async function boundedRequest(request:Request,max:number) {
  const bytes=await readBody(request,max);
  return new Request(request.url,{method:request.method,headers:request.headers,body:Buffer.from(bytes)});
}
