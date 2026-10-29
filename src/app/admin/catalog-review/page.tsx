import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { AdminHeading, ensureAdminPage } from "@/components/admin/shared";
import { getCatalogMediaReview, type CatalogReviewImage } from "@/lib/catalog-media-review";

export const dynamic = "force-dynamic";

function ReviewPhotos({ pages, images, label }: { pages: number[]; images: CatalogReviewImage[]; label: string }) {
  const requested = new Set(pages);
  const selected = images.filter((image) => requested.has(image.page));
  if (!selected.length) return <p>لا توجد صور صالحة للعرض مرتبطة بهذه المجموعة بعد.</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 16, marginBlock: 20 }}>
      {selected.map((image) => (
        <figure key={`${image.page}:${image.url}`} style={{ margin: 0, padding: 12, border: "1px solid #e8dce0", borderRadius: 8, background: "#fff", minWidth: 0 }}>
          <a href={image.url} target="_blank" rel="noopener noreferrer" aria-label={`فتح صورة ${label} بحجم أكبر، صفحة ${image.page}`}>
            <Image unoptimized src={image.url} alt={`${label} — الصورة المستلمة في صفحة ${image.page}`} width={image.width} height={image.height} loading="lazy" style={{ width: "100%", height: 260, objectFit: "contain", background: "#fbf8f3" }} />
          </a>
          <figcaption style={{ fontSize: 14, marginTop: 10 }}>صفحة {image.page} من الملف المستلم</figcaption>
        </figure>
      ))}
    </div>
  );
}

export default async function CatalogReviewPage() {
  await ensureAdminPage();
  const review = await getCatalogMediaReview();
  const products = review?.products.length ? await db.product.findMany({
    where: { slug: { in: review.products.map((item) => item.slug) } },
    select: { id: true, slug: true, name: true, status: true, nameNeedsConfirmation: true },
  }) : [];
  return (
    <>
      <AdminHeading title="مراجعة صور المنتجات" description="راجعي الصور والنصوص المطبوعة وربطها بالمنتج الصحيح قبل اعتمادها. هذه الصفحة للمراجعة فقط ولا تنشر منتجًا أو تفعّل الطلبات." />
      {!review ? (
        <section className="admin-card"><h2>لم تُسجّل دفعة صور للمراجعة بعد</h2><p>تظهر هنا الصور وملاحظات المصدر بعد استيراد ملف صور المنتجات.</p><Link href="/admin/products">العودة إلى المنتجات</Link></section>
      ) : (
        <>
          <section className="admin-card">
            <h2>الدفعة المستلمة</h2>
            <p>{review.sourceName}</p>
            {review.receivedAt && <p>وقت الاستلام: <bdi>{review.receivedAt}</bdi></p>}
            {review.summary && <p style={{ whiteSpace: "pre-line" }}>{review.summary}</p>}
            <p>{review.images.length} صورة مقروءة، و{review.products.length} مجموعات مرتبطة بمنتجات للمراجعة.</p>
            <p>وجود صورة لا يعني اعتماد اسم المنتج أو تعليماته. لا يُحدد المشاط الأحمر أو الأخضر اعتمادًا على لون العبوة أو المسحوق وحده.</p>
          </section>
          {review.invalidRecords && <aside className="admin-notice" role="status">بعض سجلات الاستيراد غير صالحة للعرض؛ أُخفيت السجلات غير المقروءة. راجعي مصدر الاستيراد قبل اعتماد الدفعة.</aside>}
          {review.products.map((item) => {
            const product = products.find((product) => product.slug === item.slug);
            const pendingConflict = item.usageConflict?.status === "PENDING";
            const resolvedConflict = item.usageConflict?.status === "RESOLVED";
            const ownerResolution = item.usageConflict?.ownerResolution || item.ownerResolution;
            const confirmedAt = item.usageConflict?.confirmedAt || item.confirmedAt;
            return (
              <section className="admin-card" key={item.slug} id={item.slug}>
                <h2>{product?.name || item.catalogName}</h2>
                <p>الاسم في الكتالوج: {item.catalogName}</p>
                {item.printedName && <p>النص المقروء على العبوة: <strong>{item.printedName}</strong></p>}
                <p>حالة المنتج: {product ? product.status === "DRAFT" ? "مسودة" : product.status === "HIDDEN" ? "مخفي" : "منشور" : "بحاجة إلى ربط بسجل منتج"}. {product?.nameNeedsConfirmation ? "بحاجة لتأكيد الاسم." : "راجعي الاسم المطبوع قبل أي اعتماد نهائي."}</p>
                {!!item.notes.length && <ul>{item.notes.map((note, index) => <li key={index} style={{ whiteSpace: "pre-line" }}>{note}</li>)}</ul>}
                {pendingConflict && <aside className="admin-notice"><h3>اختلاف في تعليمات الاستخدام يحتاج قرار المالك</h3><p>تُترك التعليمات المتعارضة معلّقة إلى حين اعتماد النص الصحيح.</p><ul>{item.usageConflict?.sources.map((source, index) => <li key={`${source.page}:${index}`} style={{ whiteSpace: "pre-line" }}>صفحة {source.page}: {source.text}</li>)}</ul></aside>}
                {resolvedConflict && <aside className="admin-notice" style={{ borderColor: "#6a7f5e" }}><h3>حُسمت تعليمات الاستخدام بتأكيد المالك</h3>{ownerResolution && <p style={{ whiteSpace: "pre-line" }}>{ownerResolution}</p>}{confirmedAt && <p>وقت التأكيد: <bdi style={{ overflowWrap: "anywhere" }}>{confirmedAt}</bdi></p>}<details><summary>عرض النصوص الأصلية للتوثيق</summary><p>هذه نصوص المصدر قبل حسم الاختلاف؛ يُرجع إلى النص الذي اعتمده المالك أعلاه.</p><ul>{item.usageConflict?.sources.map((source, index) => <li key={`${source.page}:${index}`} style={{ whiteSpace: "pre-line" }}>صفحة {source.page}: {source.text}</li>)}</ul></details></aside>}
                <ReviewPhotos pages={item.pages} images={review.images} label={item.catalogName} />
                {product && <Link href={`/admin/products/${product.id}`} className="admin-link-button">مراجعة بيانات المنتج وتحريرها</Link>}
              </section>
            );
          })}
          {!!review.unassigned.length && <section className="admin-card"><h2>صور لم يُحسم ارتباطها بمنتج</h2><p>تبقى هذه الصور دون إسناد تلقائي، حتى يؤكد المالك النوع أو اللون أو العبوة المقصودة.</p>{review.unassigned.map((group, index) => <section key={index} style={{ borderTop: "1px solid #e8dce0", paddingTop: 20, marginTop: 24 }}><h3>{group.label}</h3><p style={{ whiteSpace: "pre-line" }}>{group.reason}</p><ReviewPhotos pages={group.pages} images={review.images} label={group.label} /></section>)}</section>}
        </>
      )}
    </>
  );
}
