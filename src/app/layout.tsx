import type { Metadata } from 'next';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import '@fontsource/amiri/400.css';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'ركن الحناء | عناية بالشعر من أصالة التراث', template: '%s | ركن الحناء' },
  description: 'ركن الحناء، علامة فلسطينية للعناية بالشعر والحناء والسدر والمشاط. نوصل إلى الضفة الغربية والداخل الفلسطيني. الدفع عند الاستلام.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: { locale: 'ar_PS', type: 'website', siteName: 'ركن الحناء | Rokn Alhenna', title: 'ركن الحناء | عناية من أصالة التراث', description: 'اكتشفي عالم الحناء والسدر والمشاط للعناية بالشعر.' },
  robots: process.env.ALLOW_INDEXING === 'true' ? { index: true, follow: true } : { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ar" dir="rtl"><body><a className="skip-link" href="#main-content">انتقلي إلى المحتوى</a>{children}</body></html>; }
