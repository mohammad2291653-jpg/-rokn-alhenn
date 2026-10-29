import Link from "next/link";
import { db } from "@/lib/db";
import {
  AdminHeading,
  ensureAdminPage,
  money,
} from "@/components/admin/shared";
export default async function ProductsAdmin() {
  await ensureAdminPage();
  const products = await db.product.findMany({
    include: { category: true, _count: { select: { images: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <AdminHeading
        title="المنتجات والأسعار"
        description="راجعي الأسماء والأوزان والأسعار والصور قبل نشر كل منتج. المنتجات دون صور أصلية تبقى مسودات."
      />
      <Link className="admin-link-button" href="/admin/products/new">
        إضافة منتج
      </Link>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>الفئة</th>
              <th>السعر</th>
              <th>الحالة</th>
              <th>الصور</th>
              <th>المراجعة</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <Link href={`/admin/products/${product.id}`}>
                    {product.name}
                  </Link>
                  <small>{product.weightGrams} غرام</small>
                </td>
                <td>{product.category.name}</td>
                <td>{money(product.priceAgorot)}</td>
                <td>
                  {product.status === "PUBLISHED"
                    ? "منشور"
                    : product.status === "HIDDEN"
                      ? "مخفي"
                      : "مسودة"}
                  <small>{product.available ? "متوفر" : "غير متوفر"}</small>
                </td>
                <td>{product._count.images}</td>
                <td>
                  {product.nameNeedsConfirmation
                    ? "بحاجة لتأكيد الاسم"
                    : "تمت مراجعة الاسم"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!products.length && <p className="admin-empty">لا توجد منتجات بعد.</p>}
      </div>
    </>
  );
}
