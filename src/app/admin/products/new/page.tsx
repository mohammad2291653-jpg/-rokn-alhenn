import { db } from "@/lib/db";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { AdminHeading, ensureAdminPage } from "@/components/admin/shared";
export default async function NewProduct() {
  await ensureAdminPage();
  const categories = await db.category.findMany({
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
  return (
    <>
      <AdminHeading
        title="إضافة منتج جديد"
        description="ابدئي بمسودة ثم ارفعي الصور الأصلية وأكملي المراجعة قبل النشر."
      />
      <ProductEditor categories={categories} />
    </>
  );
}
