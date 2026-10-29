'use client';
import Image from 'next/image';
import Link from 'next/link';
import { WhatsAppLink, useStoreReadOnly } from './store-context';
import { ShoppingBag, ArrowUpLeft, MessageCircle } from 'lucide-react';
import { useCart } from './cart-context';
import { money, type StoreProduct } from './types';

function ProductCardActions({ product: p }: { product: StoreProduct }) {
  const { add, ready } = useCart();
  return <div className="product-card-actions"><button type="button" className="button button-small" onClick={() => add(p)} disabled={!p.available || !ready}><ShoppingBag size={16} /> أضيفي إلى السلة</button><WhatsAppLink className="icon-button whatsapp-card" message={`مرحبًا ركن الحناء، أود الاستفسار عن ${p.name}.`} target="_blank" rel="noopener noreferrer" aria-label={`استفسار عن ${p.name} عبر واتساب`}><MessageCircle size={21} /></WhatsAppLink></div>;
}

export function ProductCard({ product: p, readOnly = false, href = `/products/${p.slug}` }: { product: StoreProduct; readOnly?: boolean; href?: string }) {
  const preview = useStoreReadOnly();
  const displayReadOnly = readOnly || preview;
  const mainImage = p.images[0];
  return (
    <article className="product-card">
      <Link href={href} className="product-image">
        {mainImage ? <Image src={mainImage.url} alt={mainImage.alt || p.name} width={600} height={700} sizes="(max-width: 650px) 45vw, (max-width: 850px) 45vw, 23vw" loading="lazy" /> : <span className="preview-no-photo">صورة المنتج لم تُرفع بعد</span>}
        <span className={p.available ? 'availability' : 'availability unavailable'}>{p.available ? 'متوفر' : 'غير متوفر'}</span>
        <span className="product-image-arrow" aria-hidden="true"><ArrowUpLeft size={20} /></span>
      </Link>
      <div className="product-meta">
        <span className="eyebrow">{p.category.name}</span>
        <Link href={href}><h3>{p.name}</h3></Link>
        <div className="product-price"><span>{p.weightGrams} غرام</span><strong>{money(p.priceAgorot)}</strong></div>
        {displayReadOnly ? <Link className="text-link" href={href}>معاينة التفاصيل <ArrowUpLeft size={16} /></Link> : <ProductCardActions product={p} />}
      </div>
    </article>
  );
}
