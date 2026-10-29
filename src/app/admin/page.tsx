import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { LoginForm } from "@/components/admin/SessionControls";
import { AdminHeading, money } from "@/components/admin/shared";
export default async function AdminHome() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as { role?: string }).role !== "ADMIN")
    return <LoginForm />;
  const [
    fresh,
    pending,
    preparing,
    delivered,
    cancelled,
    unavailable,
    sales,
    best,
    checkout,
    products,
  ] = await Promise.all([
    db.order.count({ where: { status: "NEW" } }),
    db.order.count({ where: { status: "PENDING_CONFIRMATION" } }),
    db.order.count({ where: { status: "PREPARING" } }),
    db.order.count({ where: { status: "DELIVERED" } }),
    db.order.count({ where: { status: "CANCELLED" } }),
    db.product.count({ where: { available: false } }),
    db.order.aggregate({
      where: { paymentStatus: "COLLECTED" },
      _sum: { totalAgorot: true },
    }),
    db.orderItem.groupBy({
      by: ["productName"],
      where: { order: { status: { not: "CANCELLED" } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    db.siteSetting.findUnique({ where: { key: "checkoutEnabled" } }),
    db.product.count({ where: { status: "DRAFT" } }),
  ]);
  const stats = [
    ["الطلبات الجديدة", fresh],
    ["بانتظار التأكيد", pending],
    ["قيد التجهيز", preparing],
    ["تم تسليمها", delivered],
    ["المبيعات المحصلة", money(sales._sum.totalAgorot ?? 0)],
    ["الطلبات الملغاة", cancelled],
    ["منتجات غير متوفرة", unavailable],
    ["منتجات قيد المراجعة", products],
  ];
  return (
    <>
      <AdminHeading
        title="نظرة على متجرك"
        description="أرقام فعلية من قاعدة البيانات. لا تُحتسب طلبات الدفع عند الاستلام ضمن المبيعات المحصلة قبل تسجيل التحصيل."
      />
      {checkout?.value !== true && (
        <aside className="admin-notice">
          استقبال الطلبات متوقف لحين استكمال مراجعة المنتجات والصور والسياسات
          وتفعيل الطلبات من الإعدادات. هذه بيئة للمراجعة، وليست موافقة على
          الإطلاق التجاري.
        </aside>
      )}
      <div className="admin-stats">
        {stats.map(([title, value]) => (
          <article className="admin-stat" key={title}>
            <span>{title}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="admin-grid" style={{ marginTop: 24 }}>
        <section className="admin-card">
          <h2>الأكثر طلبًا</h2>
          {best.length ? (
            <ol>
              {best.map((item) => (
                <li key={item.productName}>
                  {item.productName} — {item._sum.quantity} قطعة مطلوبة
                </li>
              ))}
            </ol>
          ) : (
            <p>ستظهر المنتجات الأكثر طلبًا بعد استقبال الطلبات.</p>
          )}
        </section>
        <section className="admin-card">
          <h2>العمل اليومي</h2>
          <p>
            راجعي الطلبات الجديدة، أكدي التفاصيل مع الزبونة، ثم حدّثي حالة الطلب
            والدفع كلًا على حدة.
          </p>
          <div className="admin-actions">
            <Link className="admin-link-button" href="/admin/orders">
              إدارة الطلبات
            </Link>
            <Link className="admin-link-button" href="/admin/products">
              مراجعة الكتالوج
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
