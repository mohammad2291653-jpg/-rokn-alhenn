import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { AdminHeading, ensureAdminPage } from "@/components/admin/shared";
import { getCatalogMediaReview } from "@/lib/catalog-media-review";
export default async function ProductAdmin({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await ensureAdminPage();
  const { id } = await params;
  const [product, categories, mediaReview] = await Promise.all([
    db.product.findUnique({
      where: { id },
      include: { images: { orderBy: { position: "asc" } } },
    }),
    db.category.findMany({
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    }),
    getCatalogMediaReview(),
  ]);
  if (!product) notFound();
  const importedReview = mediaReview?.products.find((item) => item.slug === product.slug);
  return (
    <>
      <AdminHeading title={`تعديل ${product.name}`} />
      {importedReview && (
        <aside className="admin-notice">
          <h2>ملاحظات الصور والنصوص المستلمة</h2>
          {importedReview.printedName && <p>الاسم المقروء على العبوة: <strong>{importedReview.printedName}</strong></p>}
          {!!importedReview.notes.length && <ul>{importedReview.notes.map((note, index) => <li key={index} style={{ whiteSpace: "pre-line" }}>{note}</li>)}</ul>}
          {importedReview.usageConflict?.status === "PENDING" && <><p><strong>تعليمات الاستخدام متعارضة وتحتاج اعتماد المالك قبل النشر.</strong></p><ul>{importedReview.usageConflict.sources.map((source, index) => <li key={`${source.page}:${index}`} style={{ whiteSpace: "pre-line" }}>صفحة {source.page}: {source.text}</li>)}</ul></>}
          {importedReview.usageConflict?.status === "RESOLVED" && <><p><strong>حُسمت تعليمات الاستخدام بتأكيد المالك.</strong></p>{(importedReview.usageConflict.ownerResolution || importedReview.ownerResolution) && <p style={{ whiteSpace: "pre-line" }}>{importedReview.usageConflict.ownerResolution || importedReview.ownerResolution}</p>}<p>تحتفظ صفحة مراجعة الصور بنصوص المصدر المختلفة للتوثيق.</p></>}
          <p>مراجعة الصور هنا لا تعني اعتمادها تلقائيًا. احتفظي بحالة المسودة وبعلامة تأكيد الاسم إلى حين اكتمال المراجعة.</p>
          <Link href={`/admin/catalog-review#${product.slug}`}>عرض الصور وملاحظات المصدر</Link>
        </aside>
      )}
      <ProductEditor
        initial={{
          ...product,
          images: product.images.map(
            ({ id, url, originalKey, alt, position }) => ({
              id,
              url,
              originalKey,
              alt,
              position,
            }),
          ),
        }}
        categories={categories}
      />
    </>
  );
}
