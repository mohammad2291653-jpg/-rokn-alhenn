import 'server-only';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { isFreePreview, PREVIEW_COOKIE, previewSessionValid } from './preview-access';

/** This capability grants catalog reading only; it never creates an admin session. */
export async function requirePreviewReadAccess(): Promise<boolean> {
  if (!isFreePreview()) return false;
  const cookie = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (!previewSessionValid(cookie, process.env.PREVIEW_ACCESS_TOKEN)) notFound();
  return true;
}
