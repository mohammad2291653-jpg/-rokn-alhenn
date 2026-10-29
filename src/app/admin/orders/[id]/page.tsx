import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Editor } from "@/components/admin/Editor";
import {
  AdminHeading,
  ensureAdminPage,
  money,
  orderStatuses,
  paymentStatuses,
  statusLabel,
} from "@/components/admin/shared";
export default async function OrderAdmin({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await ensureAdminPage();
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: { items: true, history: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) notFound();
  const rawPhone = order.phone.replace(/\D/g, "");
  const phone = rawPhone.startsWith("00") ? rawPhone.slice(2) : rawPhone;
  const whatsapp =
    phone.startsWith("970") || phone.startsWith("972")
      ? `https://wa.me/${phone}?text=${encodeURIComponent(`مرحبًا، بخصوص طلبك رقم ${order.number} من ركن الحناء.`)}`
      : null;
  return (
    <>
      <AdminHeading
        title={`الطلب ${order.number}`}
        description={`أُنشئ بتاريخ ${order.createdAt.toLocaleString("ar-PS")} · الدفع عند الاستلام`}
      />
      <div className="admin-grid">
        <section className="admin-card">
          <h2>بيانات الزبونة</h2>
          <div className="admin-order-address">
            <strong>{order.customerName}</strong>
            <br />
            <a dir="ltr" href={`tel:${order.phone}`}>
              {order.phone}
            </a>
            <br />
            {order.zoneName} · {order.city}
            <br />
            {order.address}
          </div>
          {order.notes && (
            <>
              <h3>ملاحظات الزبونة</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{order.notes}</p>
            </>
          )}
          {whatsapp ? (
            <a
              className="admin-link-button"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              التواصل عبر واتساب
            </a>
          ) : (
            <p>راجعي رمز الدولة قبل التواصل عبر واتساب: {order.phone}</p>
          )}
        </section>
        <Editor
          resource="order"
          title="حالة الطلب والدفع"
          initial={{
            id: order.id,
            status: order.status,
            paymentStatus: order.paymentStatus,
            internalNotes: order.internalNotes || "",
          }}
          fields={[
            {
              name: "status",
              label: "حالة الطلب",
              type: "select",
              options: orderStatuses,
            },
            {
              name: "paymentStatus",
              label: "حالة الدفع",
              type: "select",
              options: paymentStatuses,
              hint: "سجلي التحصيل فقط بعد التسليم وتحصيل المبلغ. الطلب الجديد غير مدفوع.",
            },
            {
              name: "internalNotes",
              label: "ملاحظات داخلية للإدارة",
              type: "textarea",
            },
          ]}
        />
      </div>
      <section className="admin-card">
        <h2>محتويات الطلب</h2>
        <p>
          الأسماء والأسعار والأوزان محفوظة وقت الطلب ولا تتغير عند تعديل
          الكتالوج.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الوزن</th>
                <th>السعر وقت الطلب</th>
                <th>الكمية</th>
                <th>المجموع</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.productName}</td>
                  <td>{item.weightGrams} غرام</td>
                  <td>{money(item.unitPriceAgorot)}</td>
                  <td>{item.quantity}</td>
                  <td>{money(item.totalAgorot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          مجموع المنتجات: <strong>{money(order.subtotalAgorot)}</strong>
        </p>
        <p>
          رسوم التوصيل وقت الطلب: <strong>{money(order.deliveryAgorot)}</strong>
        </p>
        <p>
          الإجمالي عند الاستلام: <strong>{money(order.totalAgorot)}</strong>
        </p>
        <p>حالة الدفع: {statusLabel(order.paymentStatus)}</p>
      </section>
      <section className="admin-card">
        <h2>سجل تغييرات الطلب</h2>
        <ol>
          {order.history.map((entry) => (
            <li key={entry.id} style={{ marginBottom: 18, lineHeight: 1.9 }}>
              <strong>
                {statusLabel(entry.status)} · {statusLabel(entry.paymentStatus)}
              </strong>
              <br />
              <time dateTime={entry.createdAt.toISOString()}>
                {entry.createdAt.toLocaleString("ar-PS")}
              </time>
              {entry.note && <p>{entry.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
