import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignOut } from "@/components/admin/SessionControls";
import "./admin.css";
export const metadata = {
  title: "إدارة ركن الحناء",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const allowed =
    session && (session.user as { role?: string }).role === "ADMIN";
  if (!allowed) return <main id="main-content" className="admin-root">{children}</main>;
  return (
    <div className="admin-root">
      <a className="admin-skip" href="#main-content">
        انتقلي إلى المحتوى
      </a>
      <header className="admin-bar">
        <Link href="/admin" className="admin-brand">
          ركن الحناء <small>لوحة الإدارة</small>
        </Link>
        <nav aria-label="الإدارة">
          <Link href="/admin">نظرة عامة</Link>
          <Link href="/admin/products">المنتجات</Link>
          <Link href="/admin/catalog-review">مراجعة الصور</Link>
          <Link href="/admin/store-preview">معاينة المتجر</Link>
          <Link href="/admin/orders">الطلبات</Link>
          <Link href="/admin/content">المحتوى</Link>
          <Link href="/admin/settings">الإعدادات والتوصيل</Link>
          <Link href="/">المتجر ↗</Link>
        </nav>
        <SignOut />
      </header>
      <main id="main-content" className="admin-main">
        {children}
      </main>
    </div>
  );
}
