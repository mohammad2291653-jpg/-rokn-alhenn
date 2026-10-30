import { NextResponse } from 'next/server';
import { createPreviewSession, isFreePreview, PREVIEW_COOKIE, PREVIEW_SESSION_SECONDS, previewTokenValid } from '@/lib/preview-access';

export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

export function GET(request: Request) {
  const url = new URL(request.url);
  const tokens = url.searchParams.getAll('token');
  const secret = process.env.PREVIEW_ACCESS_TOKEN;
  if (!isFreePreview() || tokens.length !== 1 || !previewTokenValid(tokens[0], secret)) {
    return new NextResponse('المعاينة غير متاحة بهذا الرابط.', { status: 404, headers: privateHeaders });
  }
  const response = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL || url), { status: 303, headers: privateHeaders });
  response.cookies.set(PREVIEW_COOKIE, createPreviewSession(secret!), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: PREVIEW_SESSION_SECONDS,
  });
  return response;
}

/**
 * Owner entry via POST prevents secret-bearing URLs in browser history,
 * referrer headers, analytics, and access logs.
 */
export async function POST(request: Request) {
  if (!isFreePreview()) {
    return new NextResponse('Not found', { status: 404, headers: privateHeaders });
  }
  const rejected = () => NextResponse.redirect(new URL('/preview-login?error=invalid', request.url), { status: 303, headers: privateHeaders });
  const length = Number(request.headers.get('content-length') || 0);
  if (!Number.isFinite(length) || length > 1024) return rejected();
  let submitted: FormData;
  try { submitted = await request.formData(); } catch { return rejected(); }
  const tokens = submitted.getAll('token');
  if (tokens.length !== 1 || typeof tokens[0] !== 'string' ||
      !previewTokenValid(tokens[0], process.env.PREVIEW_ACCESS_TOKEN)) return rejected();
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303, headers: privateHeaders });
  response.cookies.set(PREVIEW_COOKIE, createPreviewSession(process.env.PREVIEW_ACCESS_TOKEN!), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: PREVIEW_SESSION_SECONDS,
  });
  return response;
}
