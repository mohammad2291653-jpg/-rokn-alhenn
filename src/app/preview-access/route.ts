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
