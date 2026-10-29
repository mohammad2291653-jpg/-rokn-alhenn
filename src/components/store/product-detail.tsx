'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { Maximize2, X, Minus, Plus, ShoppingBag, MessageCircle } from 'lucide-react';
import { useCart } from './cart-context';
import { money, type StoreProduct } from './types';
import Link from 'next/link';
import { WhatsAppLink, useStoreReadOnly } from './store-context';

function ProductPurchase({ product: p }: { product: StoreProduct }) {
  const [quantity, setQuantity] = useState(1);
  const { add, ready } = useCart();
  return <div className="detail-add"><div className="detail-buy-row"><Quantity value={quantity} onChange={setQuantity} /><button type="button" className="button" onClick={() => add(p, quantity)} disabled={!p.available || !ready}><ShoppingBag size={18} />أضيفي إلى السلة</button></div><WhatsAppLink message={`مرحبًا ركن الحناء، أود الاستفسار عن ${p.name} (${p.weightGrams} غرام).`} target="_blank" rel="noopener noreferrer" className="button button-outline"><MessageCircle size={19} />اطلبي عبر واتساب</WhatsAppLink><p className="detail-note">الدفع عند الاستلام. تُحسب رسوم التوصيل عند إتمام الطلب.</p></div>;
}

export function ProductDetail({ product: p, readOnly = false }: { product: StoreProduct; readOnly?: boolean }) {
  const preview = useStoreReadOnly();
  const displayReadOnly = readOnly || preview;
  const [image, setImage] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = p.images[image];
  return (
    <div className="detail-grid">
      <div className="product-gallery">
        {current ? <>
          <button type="button" className="main-product-photo" onClick={() => dialog.current?.showModal()} aria-label="تكبير صورة المنتج"><Image src={current.url} alt={current.alt || p.name} width={900} height={1000} sizes="(max-width: 650px) 92vw, 48vw" fetchPriority="high" /><span className="photo-zoom"><Maximize2 size={19} /></span></button>
          {p.images.length > 1 && <div className="gallery-thumbs" aria-label="صور المنتج">{p.images.map((im, index) => <button type="button" key={im.id} className={image === index ? 'selected' : ''} onClick={() => setImage(index)} aria-label={`عرض الصورة ${index + 1}`} aria-pressed={image === index}><Image src={im.url} alt={im.alt} width={100} height={120} sizes="80px" loading="lazy" /></button>)}</div>}
          <dialog ref={dialog} className="zoom-dialog" aria-label="صورة المنتج مكبّرة"><button type="button" className="icon-button" onClick={() => dialog.current?.close()} aria-label="إغلاق الصورة المكبّرة"><X /></button><Image src={current.url} alt={current.alt || p.name} width={1200} height={1400} sizes="(max-width: 900px) 95vw, 900px" /></dialog>
        </> : <div className="main-product-photo preview-no-photo">صورة المنتج لم تُرفع بعد</div>}
      </div>
      <div className="product-detail">
        <span className="eyebrow">{p.category.name}</span><h1>{p.name}</h1>
        <div className="detail-meta"><span>{p.weightGrams} غرام</span><span className={p.available ? 'status-dot' : 'status-dot unavailable'}>{p.available ? 'متوفر' : 'غير متوفر'}</span></div>
        <div className="detail-price">{money(p.priceAgorot)}</div>
        {p.description && <p className="detail-description">{p.description}</p>}
        {!displayReadOnly && <ProductPurchase product={p} />}
        <div className="detail-tabs">
          {[{ label: 'المكونات المؤكدة', text: p.ingredients }, { label: 'طريقة الاستخدام', text: p.usage }, { label: 'التحذيرات', text: p.warnings }].map(s => s.text && <details key={s.label}><summary>{s.label}</summary><p style={{ whiteSpace: 'pre-line' }}>{s.text}</p></details>)}
          {(!p.ingredients || !p.usage) && <p className="detail-note">{displayReadOnly ? 'بعض تفاصيل المنتج قيد الاستكمال والمراجعة قبل النشر.' : 'بعض تفاصيل المنتج قيد الاستكمال. تواصلي معنا للتأكد من المعلومات قبل الاستخدام.'}</p>}
        </div>
        {!displayReadOnly && <p className="detail-policy">راجعي <Link href="/returns">سياسة الاستبدال والاسترجاع</Link> قبل الطلب. المنتجات الطبيعية قد لا تناسب الجميع؛ التزمي بتعليمات العبوة وتوقّفي عند حدوث تهيّج.</p>}
      </div>
    </div>
  );
}
export function Quantity({ value, onChange }: { value: number; onChange: (n: number) => void }) { return <div className="quantity-control"><button onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="تقليل الكمية" type="button"><Minus size={15} /></button><input aria-label="الكمية" type="number" min={1} max={20} value={value} onChange={e => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1 && v <= 20) onChange(v); }} /><button onClick={() => onChange(Math.min(20, value + 1))} disabled={value >= 20} aria-label="زيادة الكمية" type="button"><Plus size={15} /></button></div>; }
