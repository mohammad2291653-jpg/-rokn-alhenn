import { requirePreviewReadAccess } from '@/lib/free-preview';
import { FreePreviewNotice } from '@/components/store/free-preview-notice';
import { db } from '@/lib/db';
import { money } from '@/components/store/types';
import type { Metadata } from 'next';
import { PageIntro } from '@/components/store/page-intro';
import { CartPage } from '@/components/store/cart-page';
export const metadata: Metadata = { title: 'سلة التسوق', robots: { index: false, follow: false } };
export default async function Page() { if (await requirePreviewReadAccess()) return <FreePreviewNotice />; const zones = await db.deliveryZone.findMany({ where: { enabled: true, approved: true, feeAgorot: { not: null }, code: { not: 'gaza' } }, select: { name: true, feeAgorot: true }, orderBy: { createdAt: 'asc' } }); const deliverySummary = `يُضاف التوصيل مرة واحدة للطلب: ${zones.map(z => `${z.name} ${money(z.feeAgorot!)}`).join('، ')}.`; return <><PageIntro title="سلتكِ، بعناية" description="راجعي اختياراتكِ قبل الانتقال لإتمام الطلب." /><div className="shell page-content"><CartPage deliverySummary={deliverySummary} /></div></>; }
