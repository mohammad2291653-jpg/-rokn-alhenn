'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, ShoppingBag, Search, ArrowUpLeft } from 'lucide-react';
import { useState } from 'react';
import { useCart } from './cart-context';
import { useStoreReadOnly } from './store-context';
const links = [{ href: '/', label: 'الرئيسية' }, { href: '/products', label: 'تسوّقي المنتجات' }, { href: '/about', label: 'حكاية ركن الحناء' }, { href: '/blog', label: 'دليل العناية' }, { href: '/contact', label: 'تواصلي معنا' }];
export function Header({ logoUrl = '' }: { logoUrl?: string }) {
  const readOnly = useStoreReadOnly(); const path = usePathname(); const [open, setOpen] = useState(false); const { count, notice, dismiss } = useCart();
  return <><div className="announcement"><span>من تراثنا، لعنايتكِ</span><span className="announcement-shipping">نوصل إلى الضفة الغربية والداخل الفلسطيني</span><Link href="/shipping">تفاصيل التوصيل <ArrowUpLeft size={13} /></Link></div><header className="site-header"><div className="shell header-inner"><button className="icon-button mobile-menu-toggle" aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button><Link href="/" className="brand" title="الصفحة الرئيسية">{logoUrl ? <Image unoptimized src={logoUrl} alt="شعار ركن الحناء الأصلي" width={1080} height={1080} className="original-logo" /> : <><span>ركن الحناء<span className="brand-dot">.</span></span><small>ROKN ALHENNA</small></>}</Link><nav id="main-nav" className={open ? 'main-nav is-open' : 'main-nav'} aria-label="القائمة الرئيسية">{links.map(l => <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined} onClick={() => setOpen(false)}>{l.label}</Link>)}</nav><div className="header-actions"><Link href="/products#catalog-search" className="icon-button search-link" aria-label="ابحثي عن منتج"><Search size={21} /></Link>{!readOnly && <Link href="/cart" className="cart-link icon-button" aria-label={`سلة التسوق، ${count} منتجات`}><ShoppingBag size={22} /><span className="cart-count" aria-hidden="true">{count}</span></Link>}</div></div></header>{!readOnly && notice && <div className="cart-toast" role="status"><span>{notice}</span><Link href="/cart" onClick={dismiss}>عرض السلة</Link><button onClick={dismiss} className="icon-button" aria-label="إغلاق الإشعار"><X size={16} /></button></div>}</>;
}
