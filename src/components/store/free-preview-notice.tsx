import Link from 'next/link';

export function FreePreviewBanner() {
  return <aside className="free-preview-banner" aria-label="حالة المعاينة"><strong>معاينة خاصة للمراجعة</strong><span>الشراء واستقبال الطلبات معطّلان. تشمل المعاينة منتجات وبيانات لم تُعتمد للنشر بعد.</span></aside>;
}

export function FreePreviewNotice() {
  return <div className="shell page-content"><section className="content-card"><h1>الطلبات غير متاحة في المعاينة</h1><p>هذه نسخة خاصة لمراجعة المتجر وصور المنتجات. لا نجمع بيانات توصيل أو نحفظ طلبات تجارية فيها.</p><Link className="button" href="/products">تصفّحي المنتجات</Link></section></div>;
}
