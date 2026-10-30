import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Leaf, LockKeyhole } from 'lucide-react';
import { isFreePreview, PREVIEW_COOKIE, previewSessionValid } from '@/lib/preview-access';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'دخول المعاينة الخاصة | ركن الحناء',
  robots: { index: false, follow: false },
};

export default async function PreviewLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isFreePreview()) notFound();
  const cookie = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (previewSessionValid(cookie, process.env.PREVIEW_ACCESS_TOKEN)) redirect('/');
  const showError = (await searchParams).error === 'invalid';
  return (
    <main id="main-content" className="shell" style={{ minHeight: '75vh', display: 'grid', placeItems: 'center', paddingBlock: 60 }}>
      <section aria-labelledby="preview-login-heading" style={{ background: '#fffdf9', border: '1px solid #e8e0db', borderRadius: 12, width: 'min(100%, 480px)', padding: 'clamp(22px, 5vw, 44px)', boxShadow: '0 12px 42px #30252a0d' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, color: '#64283c', marginBlockEnd: 16 }}>
          <Leaf aria-hidden="true" size={29} strokeWidth={1.4} />
          <strong style={{ fontSize: 24 }}>ركن الحناء</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBlockEnd: 18, color: '#a46e84' }}><LockKeyhole size={26} aria-hidden="true" /></div>
        <h1 id="preview-login-heading" style={{ color: '#64283c', fontSize: 32, textAlign: 'center', marginBlockEnd: 10 }}>
          معاينة متجر ركن الحناء
        </h1>
        <p style={{ color: '#756970', textAlign: 'center', lineHeight: 1.9, marginBlockEnd: 28 }}>
          الموقع يعمل، لكن المعاينة حاليًا خاصة وغير مخصصة لاستقبال الطلبات.
          أدخل رمز الوصول الموجود في إعدادات الخدمة على Render لمشاهدة المنتجات.
        </p>
        <form action="/preview-access" method="post" style={{ display: 'grid', gap: 16 }}>
          <label htmlFor="preview-token" style={{ fontWeight: 600 }}>رمز دخول المعاينة</label>
          <input id="preview-token" name="token" type="password" autoComplete="off"
            required minLength={32} maxLength={256} spellCheck={false} dir="ltr"
            placeholder="رمز المعاينة الخاص" aria-describedby={showError ? 'preview-login-error' : undefined} />
          {showError && <p id="preview-login-error" role="alert" style={{ color: '#9f243d', margin: 0, fontSize: 14 }}>
            الرمز غير صحيح. تحقّق من قيمته في إعدادات Render.
          </p>}
          <button type="submit" className="button" style={{ width: '100%' }}>دخول المعاينة الخاصة</button>
        </form>
        <p style={{ color: '#756970', fontSize: 12, textAlign: 'center', marginBlock: '22px 0 0' }}>
          لا تشارك رمز المعاينة مع العملاء. تنتهي جلسة الدخول بعد ٨ ساعات.
        </p>
      </section>
    </main>
  );
}
