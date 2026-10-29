import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
import { assertSameOrigin, consumeRateLimit, jsonError, boundedRequest } from '@/lib/security';
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const path = new URL(request.url).pathname;
    if (!['/api/auth/sign-in/email','/api/auth/sign-out'].includes(path)) return Response.json({error:'غير مسموح.'},{status:404});
    if(path==='/api/auth/sign-in/email') await consumeRateLimit(request,'auth-login',12,15*60*1000);
    return await handlers.POST(await boundedRequest(request,8*1024));
  } catch(error) { return jsonError(error); }
}
