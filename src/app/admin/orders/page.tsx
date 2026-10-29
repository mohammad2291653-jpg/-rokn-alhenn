import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  AdminHeading,
  ensureAdminPage,
  money,
  orderStatuses,
  statusLabel,
} from "@/components/admin/shared";
export default async function OrdersAdmin({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await ensureAdminPage();
  const { q = "", status = "", page: pageRaw = "1" } = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(pageRaw) || 1));
  const validStatus = orderStatuses.find((item) => item.value === status);
  const where: Prisma.OrderWhereInput = {
    ...(validStatus
      ? { status: validStatus.value as Prisma.EnumOrderStatusFilter }
      : {}),
    ...(q.trim()
      ? {
          OR: [
            {
              number: { contains: q.trim().slice(0, 160), mode: "insensitive" },
            },
            {
              customerName: {
                contains: q.trim().slice(0, 160),
                mode: "insensitive",
              },
            },
            { phone: { contains: q.trim().slice(0, 160) } },
          ],
        }
      : {}),
  };
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
      select: {
        id: true,
        number: true,
        customerName: true,
        status: true,
        paymentStatus: true,
        totalAgorot: true,
        zoneName: true,
        createdAt: true,
      },
    }),
    db.order.count({ where }),
  ]);
  const query = new URLSearchParams({ q, status });
  return (
    <>
      <AdminHeading
        title="إدارة الطلبات"
        description="راجعي البيانات وتواصلي مع الزبونة قبل تأكيد الطلب. سجل الدفع مستقل عن حالة التجهيز والتوصيل."
      />
      <form className="admin-toolbar" method="GET">
        <input
          name="q"
          aria-label="بحث برقم الطلب أو اسم العميل أو الهاتف"
          placeholder="رقم الطلب، اسم الزبونة أو الهاتف"
          defaultValue={q}
          maxLength={160}
        />
        <select
          name="status"
          aria-label="تصفية حسب حالة الطلب"
          defaultValue={status}
        >
          <option value="">كل الحالات</option>
          {orderStatuses.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button type="submit">بحث وتصفية</button>
        <a
          className="admin-link-button"
          href={`/api/admin/orders/export?${query.toString()}`}
        >
          تصدير CSV
        </a>
      </form>
      <p>{total} طلب مطابق</p>
      <p>
        تصدير CSV يشمل أحدث 10,000 طلب مطابق كحد أقصى؛ استخدمي البحث والتصفية
        لتقليل النطاق عند الحاجة.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>الزبونة</th>
              <th>المنطقة</th>
              <th>الإجمالي</th>
              <th>حالة الطلب</th>
              <th>الدفع</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/admin/orders/${order.id}`}>{order.number}</Link>
                </td>
                <td>{order.customerName}</td>
                <td>{order.zoneName}</td>
                <td>{money(order.totalAgorot)}</td>
                <td>{statusLabel(order.status)}</td>
                <td>{statusLabel(order.paymentStatus)}</td>
                <td>{order.createdAt.toLocaleDateString("ar-PS")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && <p className="admin-empty">لا توجد طلبات مطابقة.</p>}
      </div>
      <nav className="admin-pagination" aria-label="صفحات الطلبات">
        {page > 1 && (
          <Link href={`/admin/orders?${query.toString()}&page=${page - 1}`}>
            الصفحة السابقة
          </Link>
        )}
        <span>صفحة {page}</span>
        {page * 30 < total && (
          <Link href={`/admin/orders?${query.toString()}&page=${page + 1}`}>
            الصفحة التالية
          </Link>
        )}
      </nav>
    </>
  );
}
