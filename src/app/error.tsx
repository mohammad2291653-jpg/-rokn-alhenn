'use client';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main id="main-content" className="shell" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', paddingBlock: 70 }}><div className="empty-state" role="alert"><h1 style={{ color: 'var(--burgundy)', fontSize: 35 }}>تعذّر تحميل الصفحة الآن</h1><p>حدث خلل مؤقت. حاولي مجددًا، وإذا استمر تواصلي معنا عبر واتساب.</p><div className="hero-actions" style={{ justifyContent: 'center' }}><button className="button" onClick={reset}><RefreshCw size={17} />المحاولة مجددًا</button><Link href="https://wa.me/970599373380" className="text-link">تواصلي مع المتجر</Link></div></div></main>; }
