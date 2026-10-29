import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp, { type Metadata } from 'sharp';
import { HttpError } from '@/lib/security';
import { isFreePreview } from '@/lib/preview-access';

function proof(url:string, originalKey:string) {
  const secret=process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length<32) throw new HttpError('إعداد التخزين غير مكتمل.',503);
  return createHmac('sha256',secret).update(JSON.stringify({url,originalKey})).digest('hex');
}
export function verifyUploadedImage(input:{url:string;originalKey:string;proof?:string}) {
  const expected=proof(input.url,input.originalKey);
  if (!input.proof || !/^[a-f0-9]{64}$/.test(input.proof) || !timingSafeEqual(Buffer.from(input.proof,'hex'),Buffer.from(expected,'hex'))) throw new HttpError('يجب رفع الصورة الأصلية أولًا.',400);
  return true;
}
export async function storeOriginal(file:File) {
  if (isFreePreview()) throw new HttpError('رفع الصور غير متاح في المعاينة المجانية.',503,'PREVIEW_READ_ONLY');
  if (file.size<1 || file.size>5*1024*1024) throw new HttpError('الحد الأقصى للصورة 5 ميغابايت.');
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new HttpError('ارفع صورة JPEG أو PNG أو WebP.');
  const original=Buffer.from(await file.arrayBuffer());
  let metadata:Metadata;
  try { metadata=await sharp(original,{limitInputPixels:25_000_000}).metadata(); }
  catch { throw new HttpError('تعذّر قراءة الصورة.'); }
  const formats:Record<string,string>={jpeg:'jpg',png:'png',webp:'webp'};
  if (!metadata.format || !formats[metadata.format] || !metadata.width || !metadata.height || (metadata.pages||1)>1) throw new HttpError('صيغة الصورة غير مسموحة.');
  const id=randomUUID();
  const originalKey=`originals/${id}.${formats[metadata.format]}`;
  const optimizedKey=`products/${id}.webp`;
  // Fit within bounds, never crop, and retain the untouched original separately.
  const optimized=await sharp(original,{limitInputPixels:25_000_000}).rotate().resize(1400,1400,{fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
  let url:string;
  if (process.env.STORAGE_DRIVER==='local' && process.env.NODE_ENV!=='production') {
    const {mkdir,writeFile}=await import('node:fs/promises');
    const {join}=await import('node:path');
    const dir=join(process.cwd(),'public','uploads');
    await mkdir(join(dir,'originals'),{recursive:true});
    await mkdir(join(dir,'products'),{recursive:true});
    await writeFile(join(dir,originalKey),original,{flag:'wx'});
    await writeFile(join(dir,optimizedKey),optimized,{flag:'wx'});
    url=`/uploads/${optimizedKey}`;
  } else {
    const {S3_REGION:region,S3_BUCKET:bucket,S3_ACCESS_KEY_ID:accessKeyId,S3_SECRET_ACCESS_KEY:secretAccessKey,S3_PUBLIC_URL:publicUrl}=process.env;
    if (!region||!bucket||!accessKeyId||!secretAccessKey||!publicUrl||!publicUrl.startsWith('https://')) throw new HttpError('لم يُربط التخزين الدائم بعد.',503);
    const client=new S3Client({region,endpoint:process.env.S3_ENDPOINT||undefined,forcePathStyle:!!process.env.S3_ENDPOINT,credentials:{accessKeyId,secretAccessKey}});
    // Originals stay private; only the products/ prefix should be readable publicly.
    await client.send(new PutObjectCommand({Bucket:bucket,Key:originalKey,Body:original,ContentType:`image/${metadata.format}`,ServerSideEncryption:'AES256'}));
    await client.send(new PutObjectCommand({Bucket:bucket,Key:optimizedKey,Body:optimized,ContentType:'image/webp',CacheControl:'public, max-age=31536000, immutable'}));
    url=`${publicUrl.replace(/\/$/,'')}/${optimizedKey}`;
  }
  return {url,originalKey,proof:proof(url,originalKey)};
}
