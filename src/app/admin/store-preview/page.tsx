import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpLeft, Eye, LockKeyhole } from 'lucide-react';
import { db } from '@/lib/db';
import { ensureAdminPage } from '@/components/admin/shared';
import { Catalog } from '@/components/store/catalog';
import { getStoreSettings, publicProductSelect } from '@/components/store/data';
import { toPublicProduct } from '@/lib/availability';
import './preview.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'معاينة المتجر — الإدارة', robots: { index: false, follow: false } };

export default async function StorePreviewPage() {
  await ensureAdminPage();
  const [records, settings] = await Promise.all([
    db.product.findMany({ where: { images: { some: {} } }, select: publicProductSelect, orderBy: [{ featured: 'desc' }, { createdAt: 'asc' }] }),
    getStoreSettings(),
  ]);
  const products = records.map(toPublicProduct);
  const categories = [...new Map(products.map(p => [p.category.id, p.category])).values()];
  const hero = products.find(p => p.images.length > 0);
  return (
    <div className="store-preview">
      <aside className="preview-banner" aria-label="حالة المعاينة"><LockKeyhole size={20} /><div><strong>معاينة خاصة للإدارة</strong><p>الشراء معطّل في هذه المعاينة. عرض المنتج هنا لا ينشره ولا يغيّر بياناته.</p></div><Link href="/admin/catalog-review">مراجعة الصور الأصلية <ArrowUpLeft size={16} /></Link></aside>
      <header className="preview-brand-row">
        <Link href="/admin/store-preview" aria-label="معاينة ركن الحناء">{settings.logoUrl ? <Image unoptimized src={settings.logoUrl} alt="شعار ركن الحناء الأصلي" width={1080} height={1080} className="preview-brand-logo" /> : <span className="preview-brand-name">ركن الحناء</span>}</Link>
        <span>عناية بالشعر من أصالة التراث</span>
        <Link href="/admin/products" className="text-link">إدارة المنتجات <ArrowUpLeft size={16} /></Link>
      </header>
      <section className="preview-hero">
        <div className="preview-hero-copy"><span className="eyebrow">ركن الحناء · Rokn Alhenna</span><h1>معاينة المتجر</h1><h2>من أصالة التراث إلى روتين العناية بشعرك</h2><p>اكتشفي منتجات ركن الحناء المستوحاة من مكونات العناية التقليدية بالشعر، بتجربة تسوق سهلة ومريحة.</p><a className="button" href="#preview-products">تصفّحي المنتجات <ArrowDown size={18} /></a></div>
        {hero ? <div className="preview-hero-photo"><Image unoptimized src={hero.images[0].url} alt={hero.images[0].alt || hero.name} width={900} height={1200} sizes="(max-width: 700px) 90vw, 45vw" fetchPriority="high" /><span>صورة أصلية لمنتج {hero.name}</span></div> : <div className="preview-hero-empty"><Eye size={40} /><p>تظهر هنا صورة المنتج بعد رفعها.</p></div>}
      </section>
      <section id="preview-products" className="preview-catalog">
        <header className="section-heading"><div><span className="eyebrow">الحناء والسدر والمشاط</span><h2>منتجات ركن الحناء</h2></div></header>
        <p className="preview-catalog-note">تتضمن المعاينة المسودات والمنتجات المخفية للمراجعة. المنتجات التي لم تصل صورها النهائية تُحفظ في الإدارة ولا تظهر ضمن هذه المعاينة. لا تعني حالة «متوفر» اعتماد المنتج للنشر.</p>
        <Catalog products={products} categories={categories} readOnly />
      </section>
      <footer className="preview-footer"><span>ركن الحناء · عناية بالشعر</span><span>التوصيل إلى الضفة الغربية والداخل الفلسطيني · الدفع عند الاستلام</span><Link href="/admin/settings">مراجعة إعدادات المتجر</Link></footer>
    </div>
  );
}
