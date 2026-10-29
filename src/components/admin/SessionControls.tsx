"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/react";
const client = createAuthClient();
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await client.signIn.email({
        email: String(data.get("email")),
        password: String(data.get("password")),
        rememberMe: false,
      });
      if (result.error)
        setError("تعذر تسجيل الدخول. تحققي من البيانات أو حاولي لاحقًا.");
      else {
        router.replace("/admin");
        router.refresh();
      }
    } catch {
      setError("تعذر الاتصال. حاولي مجددًا.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-login">
      <p>مساحة إدارة ركن الحناء</p>
      <h1>أهلًا بعودتك</h1>
      <p>الدخول مخصص لحساب الإدارة المصرح له.</p>
      <form method="post" onSubmit={submit}>
        <label>
          البريد الإداري
          <input
            name="email"
            type="email"
            autoComplete="username"
            dir="ltr"
            required
          />
        </label>
        <label>
          كلمة المرور
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "جارٍ التحقق…" : "تسجيل الدخول"}
        </button>
        <p role="alert">{error}</p>
      </form>
      <Link href="/">العودة إلى المتجر</Link>
    </section>
  );
}
export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="admin-signout"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await client.signOut();
          router.replace("/admin");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      تسجيل الخروج
    </button>
  );
}
