import Image from 'next/image';
import Link from 'next/link';
import { db } from '@/lib/db';
import { ensureAdminPage } from '@/components/admin/shared';
import finalMedia from '../../../../config/final-product-media-2026-10-29.json';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مراجعة الصور النهائية | ركن الحناء', robots: { index: false, follow: false } };

const unpictured = [
  { slug: 'green-mashat-mask', label: 'ماسك المشاط الأخضر' },
  { slug: 'green-mashat-powder', label: 'بودرة المشاط الأخضر' },
];

export default async function CatalogMediaReviewPage() {
  await ensureAdminPage();
  const products = await db.product.findMany({
    select: { id: true, slug: true, name: true, images: { select: { url: true }, take: 1, orderBy: { position: 'asc' } } },
  });
  const bySlug = new Map(products.map(product => [product.slug, product]));
  const synchronized = finalMedia.images.every(entry => bySlug.get(entry.slug)?.images[0]?.url === entry.url);
  return (
    <div className="admin-card" dir="rtl">
      <h1>صور منتجات ركن الحناء النهائية</h1>
      <p>سبع صور أصلية معتمدة، صورة واحدة لكل منتج. لم تُضغط أو تُقصّ الصور عند رفعها، وتُعرض بنسبة أبعادها الأصلية.</p>
      <p>{synchronized ? 'مراجع قاعدة بيانات المعاينة تطابق الصور النهائية السبع، صورة واحدة لكل منتج.' : 'الصور النهائية موجودة في المشروع، لكن ربط قاعدة بيانات المعاينة ما زال بحاجة إلى مزامنة قبل اعتماد العرض.'} أسماء المنتجات وأسعارها وأوصافها لا تتغير بسبب مزامنة الصور.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 20, marginBlock: 24 }}>
        {finalMedia.images.map(entry => {
          const product = bySlug.get(entry.slug);
          return (
            <article key={entry.slug} style={{ padding: 12, border: '1px solid #e8e0db', background: '#fff' }}>
              <Image unoptimized src={entry.url} alt={entry.alt} width={1122} height={1402} style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
              <h2 style={{ fontSize: 19, marginBlock: 8 }}>{product?.name ?? entry.alt}</h2>
              <p style={{ fontSize: 13, marginBottom: 8 }}>الملف الأصلي: {entry.file}</p>
              {product && <Link className="admin-link-button" href={`/admin/products/${product.id}`}>تحرير بيانات المنتج</Link>}
            </article>
          );
        })}
      </div>
      <h2>منتجات محفوظة بدون صورة نهائية</h2>
      <p>صور المشاط الأخضر لم تُرفع ضمن الدفعة المعتمدة، ولذلك بقيت سجلات المنتجين محفوظة في الإدارة بدون صورة ولم تُعرض في المتجر أو معاينة الواجهة.</p>
      <ul>{unpictured.map(item => <li key={item.slug}>{item.label}</li>)}</ul>
      <Link className="admin-link-button" href="/admin/products">العودة لإدارة المنتجات</Link>
    </div>
  );
}
