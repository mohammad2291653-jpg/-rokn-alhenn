import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { getProducts } from '@/components/store/data';
import { PageIntro } from '@/components/store/page-intro';
import { Catalog } from '@/components/store/catalog';
export const metadata: Metadata = { title: 'تسوّقي منتجات العناية بالشعر', description: 'اكتشفي منتجات ركن الحناء من الحناء والسدر والمشاط بأسعار الشيكل، مع الدفع عند الاستلام.', alternates: { canonical: '/products' } };
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) { const [products, categories, params] = await Promise.all([getProducts(), db.category.findMany({ select: { id: true, name: true, slug: true }, orderBy: { position: 'asc' } }), searchParams]); return <><PageIntro title="العناية تبدأ باختياركِ" description="اكتشفي منتجاتنا، واقرئي تفاصيل كل عبوة لتختاري ما يناسب روتينكِ." /><div className="shell page-content"><Catalog products={products} categories={categories} initialCategory={params.category || ''} /></div></>; }
