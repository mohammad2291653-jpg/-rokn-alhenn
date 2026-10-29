'use client';
import { useState, useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import { ProductCard } from './product-card';
import { EmptyCatalog } from './empty-catalog';
import type { StoreProduct } from './types';
const normalize = (s: string) => s.normalize('NFKD').replace(/[\u064b-\u065f]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase().trim();
const subscribeToReadiness = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function Catalog({ products, categories, initialCategory = '', readOnly = false }: { products: StoreProduct[]; categories: { id: string; name: string; slug: string }[]; initialCategory?: string; readOnly?: boolean }) {
  const ready = useSyncExternalStore(subscribeToReadiness, clientReady, serverReady);
  const [query, setQuery] = useState(''); const [category, setCategory] = useState(initialCategory); const [sort, setSort] = useState('featured'); const [available, setAvailable] = useState(false);
  const filtered = products.filter(p => (!category || p.category.slug === category) && (!available || p.available) && (!query || normalize(`${p.name} ${p.category.name}`).includes(normalize(query)))).sort((a, b) => sort === 'low' ? a.priceAgorot - b.priceAgorot : sort === 'high' ? b.priceAgorot - a.priceAgorot : Number(b.featured) - Number(a.featured));
  return <><div className="catalog-controls" aria-busy={!ready}><div className="catalog-search"><label htmlFor="catalog-search">ابحثي عن منتج</label><input id="catalog-search" type="search" disabled={!ready} placeholder="الحناء، السدر، المشاط..." value={query} onChange={e => setQuery(e.target.value)} maxLength={100} /><Search size={19} /></div><div className="field"><label htmlFor="category">الفئة</label><select disabled={!ready} id="category" value={category} onChange={e => setCategory(e.target.value)}><option value="">جميع الفئات</option>{categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></div><div className="field"><label htmlFor="sort">الترتيب</label><select disabled={!ready} id="sort" value={sort} onChange={e => setSort(e.target.value)}><option value="featured">المنتجات المميزة</option><option value="low">السعر: من الأقل للأعلى</option><option value="high">السعر: من الأعلى للأقل</option></select></div><div className="catalog-available"><label className="check-label"><input type="checkbox" disabled={!ready} checked={available} onChange={e => setAvailable(e.target.checked)} />المتوفر فقط</label></div></div><p className="catalog-count" aria-live="polite">{filtered.length} منتج</p>{filtered.length ? <div className="product-grid">{filtered.map(p => <ProductCard key={p.id} product={p} readOnly={readOnly} href={readOnly ? `/admin/store-preview/${p.slug}` : `/products/${p.slug}`} />)}</div> : readOnly ? <p className="empty-state">لا توجد منتجات مطابقة لخيارات البحث.</p> : <EmptyCatalog search={products.length > 0} />}</>;
}
