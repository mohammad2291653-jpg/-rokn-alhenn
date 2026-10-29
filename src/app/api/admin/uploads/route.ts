import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { assertSameOrigin, consumeRateLimit, HttpError, jsonError, boundedRequest } from '@/lib/security';
import { storeOriginal } from '@/lib/storage';
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const actor=await requireAdmin();
    await consumeRateLimit(request,'admin-upload',30,60*60*1000);
    if (Number(request.headers.get('content-length')||0)>6*1024*1024) throw new HttpError('حجم الطلب أكبر من المسموح.',413);
    const bounded=await boundedRequest(request,6*1024*1024);
    const form=await bounded.formData(); const file=form.get('file');
    if (!(file instanceof File)) throw new HttpError('اختر صورة.');
    const result=await storeOriginal(file);
    await db.auditLog.create({data:{actorId:actor.id,action:'IMAGE_UPLOADED',entityType:'ProductImage',entityId:result.originalKey}});
    return Response.json(result);
  } catch(error) { return jsonError(error); }
}
