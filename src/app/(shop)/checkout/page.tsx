import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { PageIntro } from '@/components/store/page-intro';
import { Checkout } from '@/components/store/checkout';
import { getStoreSettings } from '@/components/store/data';
export const metadata: Metadata = { title: 'إتمام الطلب', robots: { index: false, follow: false } };
export default async function Page() { const [zones, settings] = await Promise.all([db.deliveryZone.findMany({ where: { enabled: true, code: { not: 'gaza' } }, select: { id: true, code: true, name: true, feeAgorot: true, approved: true, cities: { where: { enabled: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } } }, orderBy: { createdAt: 'asc' } }), getStoreSettings()]); const policiesApproved = ['returns', 'privacy', 'terms'].every(key => { const policy = settings.map[key]; return policy && typeof policy === 'object' && !Array.isArray(policy) && policy.approved === true; }); const launchApproved = process.env.NODE_ENV !== 'production' || process.env.COMMERCIAL_LAUNCH_APPROVED === 'true'; return <><PageIntro title="خطوة أخيرة، ويصلنا طلبكِ" description="أكملي بيانات التوصيل وراجعي المبلغ المستحق عند الاستلام." /><div className="shell page-content"><Checkout zones={zones} enabled={settings.checkoutEnabled && policiesApproved && launchApproved} /></div></>; }
