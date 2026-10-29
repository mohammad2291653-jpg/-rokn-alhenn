import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { db } from '@/lib/db';
import { ensureAdminPage } from '@/components/admin/shared';
import { ProductDetail } from '@/components/store/product-detail';
import { ProductCard } from '@/components/store/product-card';
import { publicProductSelect } from '@/components/store/data';
import { toPublicProduct } from '@/lib/availability';
import '../preview.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'معاينة المنتج — الإدارة', robots: { index: false, follow: false } };
const statusLabels = { DRAFT: 'مسودة', HIDDEN: 'مخفي', PUBLISHED: 'منشور' };

export default async function StorePreviewProductPage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureAdminPage();
  const { slug } = await params;
  const record = await db.product.findUnique({ where: { slug }, select: { ...publicProductSelect, status: true, nameNeedsConfirmation: true } });
  if (!record) notFound();
  const { status, nameNeedsConfirmation, ...selected } = record;
  const product = toPublicProduct(selected);
  const related = (await db.product.findMany({ where: { categoryId: product.category.id, id: { not: product.id } }, select: publicProductSelect, orderBy: { createdAt: 'asc' }, take: 4 })).map(toPublicProduct);
  return (
    <div className="store-preview preview-detail">
      <aside className="preview-banner" aria-label="حالة المعاينة"><LockKeyhole size={20} /><div><strong>معاينة خاصة للإدارة — الشراء معطّل</strong><p>حالة المنتج: {statusLabels[status]}.{nameNeedsConfirmation ? ' الاسم بحاجة إلى تأكيد قبل النشر.' : ''}</p></div><Link href={`/admin/products/${product.id}`}>تعديل بيانات المنتج</Link></aside>
      <nav className="preview-breadcrumbs" aria-label="مسار المعاينة"><Link href="/admin/store-preview"><ArrowRight size={17} />العودة إلى معاينة المتجر</Link></nav>
      <ProductDetail product={product} readOnly />
      {related.length > 0 && <section className="related-section"><div className="section-heading"><h2>منتجات من الفئة نفسها</h2></div><div className="product-grid">{related.map(p => <ProductCard key={p.id} product={p} readOnly href={`/admin/store-preview/${p.slug}`} />)}</div></section>}
    </div>
  );
}
