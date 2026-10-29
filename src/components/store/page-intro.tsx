import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
export function PageIntro({ title, description, parent }: { title: string; description?: string; parent?: { label: string; href: string } }) { return <section className="page-intro"><div className="shell"><div className="breadcrumbs" aria-label="مسار التنقل"><Link href="/">الرئيسية</Link><ChevronLeft size={12} />{parent && <><Link href={parent.href}>{parent.label}</Link><ChevronLeft size={12} /></>}<span>{title}</span></div><h1>{title}</h1>{description && <p>{description}</p>}</div></section>; }
