import { requirePreviewReadAccess } from '@/lib/free-preview';
import { FreePreviewNotice } from '@/components/store/free-preview-notice';
import type { Metadata } from 'next';
import { PageIntro } from '@/components/store/page-intro';
import { OrderStatus } from '@/components/store/order-status';
export const metadata: Metadata = { title: 'متابعة الطلب بأمان', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page() { if (await requirePreviewReadAccess()) return <FreePreviewNotice />; return <><PageIntro title="اطمئنّي على طلبكِ" description="تابعي حالة طلبكِ باستخدام رمز المتابعة الخاص بكِ، دون عرض بياناتكِ الشخصية." /><div className="shell page-content"><OrderStatus /></div></>; }
