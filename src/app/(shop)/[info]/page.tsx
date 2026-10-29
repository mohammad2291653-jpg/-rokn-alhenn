import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Truck, MessageCircle, Camera, ArrowUpLeft, Leaf } from 'lucide-react';
import { db } from '@/lib/db';
import { PageIntro } from '@/components/store/page-intro';
import { getStoreSettings } from '@/components/store/data';
import { money } from '@/components/store/types';
const pages: Record<string, { title: string; description: string }> = {
  about: { title: 'حكاية ركن الحناء', description: 'عناية بالشعر تحمل أصالة التراث الفلسطيني، وتقترب من روتينكِ اليومي.' },
  contact: { title: 'نسعد بالتواصل معكِ', description: 'للاستفسار عن المنتجات أو الطلبات، تواصلي معنا عبر القنوات الرسمية.' },
  faq: { title: 'الأسئلة الشائعة', description: 'إجابات واضحة تساعدكِ قبل الطلب وبعده.' },
  shipping: { title: 'التوصيل، بكل وضوح', description: 'نوصل إلى الضفة الغربية والداخل الفلسطيني. تظهر رسوم التوصيل منفصلة قبل تأكيد الطلب.' },
  returns: { title: 'سياسة الاستبدال والاسترجاع', description: 'راجعي سياسة المتجر قبل إتمام طلبكِ، وتواصلي معنا إذا وصلتكِ عبوة تالفة أو منتج خاطئ.' },
  privacy: { title: 'سياسة الخصوصية', description: 'كيف نتعامل مع بيانات الطلب والتواصل داخل متجر ركن الحناء.' },
  terms: { title: 'الشروط والأحكام', description: 'شروط استخدام المتجر والطلب والتوصيل والدفع عند الاستلام.' },
};
export async function generateMetadata({ params }: { params: Promise<{ info: string }> }): Promise<Metadata> { const { info } = await params; const page = pages[info]; return page ? { title: page.title, description: page.description, alternates: { canonical: `/${info}` } } : { title: 'الصفحة غير موجودة', robots: { index: false } }; }
export default async function InfoPage({ params }: { params: Promise<{ info: string }> }) {
  const { info } = await params; const page = pages[info]; if (!page) notFound(); const settings = await getStoreSettings(); const whatsappPhone = `+${new URL(settings.whatsapp).pathname.replace(/[^0-9]/g, '')}`; const instagramHandle = `@${new URL(settings.instagram).pathname.split('/').filter(Boolean)[0] || 'rokn_alhenna'}`;
  let content: React.ReactNode;
  if (info === 'about') {
    const section = await db.contentSection.findUnique({ where: { key: 'about' } });
    content = <div className="prose">{section?.enabled ? <><h2>{section.title}</h2><p>{section.body}</p></> : <><span className="eyebrow">من فلسطين، بكل عناية</span><h2>من أصالة التراث إلى روتينكِ</h2><p>ركن الحناء علامة فلسطينية متخصصة في منتجات العناية بالشعر، خصوصًا الحناء والسدر والمشاط والمنتجات الطبيعية والتراثية.</p><p>نهتم بتقديم تفاصيل واضحة عن كل منتج، من اسمه ووزنه وسعره، إلى المكونات وطريقة الاستخدام عند اعتمادها. ونؤمن أن الاختيار المناسب يبدأ بمعرفة ما تستخدمينه.</p><h2>تراث نعتزّ به، ومعلومة نراجعها</h2><p>نميّز بين الاستخدامات التراثية والمعلومات العلمية المدعومة. لا نقدّم وعودًا علاجية، ولا نصف المنتجات الطبيعية بأنها مناسبة للجميع.</p><h2>متخصصون في العناية بالشعر</h2><p>تخصّص ركن الحناء هو منتجات العناية بالشعر. لا نقدّم خدمات نقش الحناء على اليدين.</p><p>نسعد بأسئلتكِ عبر <a href={settings.whatsapp} target="_blank" rel="noopener noreferrer">واتساب</a> أو <a href={settings.instagram} target="_blank" rel="noopener noreferrer">إنستغرام</a>.</p></>}</div>;
  } else if (info === 'contact') {
    content = <div className="contact-grid"><div className="contact-options"><a href={settings.whatsapp} target="_blank" rel="noopener noreferrer" className="contact-option"><MessageCircle size={27} /><div><h2>تحدّثي معنا عبر واتساب</h2><p dir="ltr">{whatsappPhone}</p></div><ArrowUpLeft size={20} /></a><a href={settings.instagram} target="_blank" rel="noopener noreferrer" className="contact-option"><Camera size={27} /><div><h2>تابعينا على إنستغرام</h2><p dir="ltr">{instagramHandle}</p></div><ArrowUpLeft size={20} /></a>{settings.facebook && <a href={settings.facebook} target="_blank" rel="noopener noreferrer" className="contact-option"><Leaf size={27} /><div><h2>ركن الحناء على فيسبوك</h2></div><ArrowUpLeft size={20} /></a>}</div><aside className="contact-aside"><span className="eyebrow">قريبون منكِ</span><h2>تفاصيل تساعدنا على مساعدتكِ</h2><p>للاستفسار عن منتج، أرسلي اسمه كما يظهر في المتجر. ولمتابعة طلب، يكفي إرسال رقم الطلب عبر واتساب.</p><p>تجنّبي مشاركة رابط المتابعة الخاص بكِ علنًا أو إرسال معلومات شخصية لا يحتاجها الاستفسار.</p><Link className="text-link" href="/order-status">متابعة الطلب بأمان <ArrowUpLeft size={17} /></Link></aside></div>;
  } else if (info === 'shipping') {
    const zones = await db.deliveryZone.findMany({ where: { enabled: true, code: { not: 'gaza' } }, orderBy: { createdAt: 'asc' } });
    content = <><div className="info-grid">{zones.map(z => <article className="info-card" key={z.id}><Truck size={30} strokeWidth={1.3} /><h2>{z.name}</h2>{z.approved && z.feeAgorot !== null ? <><div className="fee">{money(z.feeAgorot)}</div><p>رسوم للطلب كاملًا، تُضاف مرة واحدة إلى مجموع المنتجات.</p></> : <><div className="fee" style={{ fontSize: 22 }}>بانتظار التأكيد</div><p>تحتاج المنطقة والتكلفة إلى اعتماد قبل إتمام طلب بسعر نهائي. لا نضع رسومًا تلقائية غير معتمدة.</p></>}</article>)}</div><div className="prose" style={{ marginTop: 35 }}><h2>عنوان واضح، وطلب أدق</h2><p>اختاري منطقة التوصيل الصحيحة ثم المدينة أو البلدة والعنوان التفصيلي. إذا تعارض العنوان مع المنطقة، ستحتاجين إلى تصحيحه قبل إرسال الطلب.</p><p>يحسب الخادم مجموع المنتجات ورسوم التوصيل، ويظهر المبلغ المستحق عند الاستلام في ملخص طلبكِ. لا تتضاعف رسوم التوصيل عند إضافة أكثر من منتج.</p><h2>قطاع غزة</h2><p>التوصيل غير متاح حاليًا إلى قطاع غزة. لا يمكن إتمام طلب بعنوان في غزة عبر اختيار منطقة أخرى.</p><h2>مواعيد التوصيل</h2><p>تُؤكّد تفاصيل وموعد التوصيل مع المتجر بعد مراجعة الطلب. لا نعرض مدة توصيل غير معتمدة.</p><a href={settings.whatsapp} className="text-link" target="_blank" rel="noopener noreferrer">استفسري عن التوصيل <ArrowUpLeft size={17} /></a></div></>;
  } else if (info === 'faq') {
    const faqs = await db.fAQ.findMany({ where: { published: true }, orderBy: { position: 'asc' } });
    content = <div className="faq-list">{faqs.length ? faqs.map(f => <details key={f.id}><summary>{f.question}</summary><p>{f.answer}</p></details>) : <div className="empty-state"><h3>نراجع إجابات أسئلتكِ</h3><p>تُضاف الأسئلة والإجابات بعد اعتمادها من إدارة المتجر. تواصلي معنا لأي استفسار.</p><a className="text-link" href={settings.whatsapp} target="_blank" rel="noopener noreferrer">اسألينا عبر واتساب <ArrowUpLeft size={16} /></a></div>}</div>;
  } else {
    const value = settings.map[info]; const policy = value && typeof value === 'object' && !Array.isArray(value) ? value : null; const approved = policy?.approved === true; const body = typeof policy?.body === 'string' ? policy.body : '';
    content = <div className="prose">{!approved && <div className="policy-status" role="status"><strong>هذه السياسة قيد المراجعة الإدارية.</strong>النص مسودة ولم يُعتمد للنشر النهائي. لا يُفعّل استقبال الطلبات التجارية قبل مراجعة السياسات المطلوبة.</div>}{body ? <p>{body}</p> : <p>يجري إعداد هذه السياسة ومراجعتها. تواصلي مع إدارة المتجر لأي استفسار قبل الطلب.</p>}{info === 'returns' && !body && <><h2>قرار المتجر</h2><p>لا يوجد تبديل أو استرجاع اختياري للمنتجات.</p><p>لا ينتقص ذلك من أي حقوق قانونية إلزامية لا يجوز استبعادها، بما فيها الحالات التي يصل فيها المنتج تالفًا أو خاطئًا أو غير مطابق للطلب، وفق القانون الواجب التطبيق.</p></>}<p>للاستفسار، <a href={settings.whatsapp} target="_blank" rel="noopener noreferrer">تواصلي مع ركن الحناء عبر واتساب</a>.</p></div>;
  }
  return <><PageIntro title={page.title} description={page.description} /><div className="shell page-content">{content}</div></>;
}
