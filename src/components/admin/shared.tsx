import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
export async function ensureAdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as { role?: string }).role !== "ADMIN")
    redirect("/admin");
  return session.user;
}
export function AdminHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="admin-heading">
      <p>ركن الحناء · الإدارة</p>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
export function money(value: number) {
  return new Intl.NumberFormat("ar-PS", {
    style: "currency",
    currency: "ILS",
  }).format(value / 100);
}
export const orderStatuses = [
  { value: "NEW", label: "جديد" },
  { value: "PENDING_CONFIRMATION", label: "بانتظار التأكيد" },
  { value: "CONFIRMED", label: "تم التأكيد" },
  { value: "PREPARING", label: "قيد التجهيز" },
  { value: "SHIPPED", label: "تم الشحن" },
  { value: "DELIVERED", label: "تم التسليم" },
  { value: "CANCELLED", label: "ملغى" },
];
export const paymentStatuses = [
  { value: "UNPAID", label: "غير مدفوع" },
  { value: "COLLECTED", label: "تم التحصيل" },
  { value: "CANCELLED", label: "ألغي" },
  { value: "REFUNDED", label: "أُعيد المبلغ" },
];
export function statusLabel(value: string) {
  return (
    [...orderStatuses, ...paymentStatuses].find((x) => x.value === value)
      ?.label || value
  );
}
