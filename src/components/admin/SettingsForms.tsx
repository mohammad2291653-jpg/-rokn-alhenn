"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Settings = Record<string, unknown>;
type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}
function str(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function SettingsForm({
  title,
  description,
  settingKey,
  children,
  serialize,
}: {
  title: string;
  description?: string;
  settingKey: string;
  children: React.ReactNode;
  serialize: (data: FormData) => unknown;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: settingKey,
          value: JSON.stringify(serialize(data)),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          result.error ||
            result.message ||
            "تعذّر الحفظ. راجعي البيانات وحاولي مجددًا.",
        );
      setMessage("حُفظت الإعدادات.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" onSubmit={submit} className="admin-panel admin-editor">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      <div className="admin-fields">{children}</div>
      <div className="admin-form-footer">
        <button type="submit" disabled={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
        </button>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </div>
    </form>
  );
}

export function SettingsForms({ settings }: { settings: Settings }) {
  const store = record(settings.store);
  const analytics = record(settings.analytics);
  return (
    <div className="admin-stack">
      <LogoForm store={store} />
      <SettingsForm
        title="بيانات العلامة وروابط التواصل"
        settingKey="store"
        description="اتركي رابط فيسبوك فارغًا إلى حين تأكيد الرابط الرسمي. لا حاجة لإضافة عنوان أو بريد عام غير معتمد."
        serialize={(data) => ({
          ...store,
          name: data.get("name"),
          instagram: data.get("instagram"),
          whatsapp: data.get("whatsapp"),
          facebook: data.get("facebook") || null,
        })}
      >
        <label>
          اسم العلامة
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={str(store.name, "ركن الحناء")}
          />
        </label>
        <label>
          رابط إنستغرام
          <input
            type="url"
            name="instagram"
            dir="ltr"
            required
            defaultValue={str(
              store.instagram,
              "https://www.instagram.com/rokn_alhenna/",
            )}
          />
        </label>
        <label>
          رابط واتساب الدولي
          <input
            type="url"
            name="whatsapp"
            dir="ltr"
            required
            maxLength={300}
            defaultValue={str(store.whatsapp, "https://wa.me/970599373380")}
          />
        </label>
        <label>
          رابط فيسبوك الرسمي — اختياري
          <input
            type="url"
            name="facebook"
            dir="ltr"
            defaultValue={str(store.facebook)}
            placeholder="https://www.facebook.com/…"
          />
        </label>
      </SettingsForm>
      {(["returns", "privacy", "terms"] as const).map((key) => {
        const policy = record(settings[key]);
        const titles = {
          returns: "سياسة الاستبدال والاسترجاع",
          privacy: "سياسة الخصوصية",
          terms: "الشروط والأحكام",
        };
        return (
          <SettingsForm
            key={key}
            title={titles[key]}
            settingKey={key}
            description={
              key === "returns"
                ? "لا يوجد تبديل أو استرجاع اختياري. احفظي الحقوق القانونية الإلزامية المتعلقة بالمنتج التالف أو الخاطئ أو غير المطابق دون اختراع مهل قانونية."
                : "راجعي النص وفق طريقة تشغيل المتجر والخدمات المستخدمة قبل اعتماده."
            }
            serialize={(data) => ({
              body: data.get("body"),
              approved: data.has("approved"),
            })}
          >
            <label className="admin-field-wide">
              النص
              <textarea
                name="body"
                required
                rows={10}
                maxLength={30000}
                defaultValue={str(policy.body)}
              />
            </label>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                name="approved"
                defaultChecked={policy.approved === true}
              />
              راجعتُ النص وأعتمد نشره للزبائن
            </label>
          </SettingsForm>
        );
      })}
      <SettingsForm
        title="استقبال الطلبات"
        settingKey="checkoutEnabled"
        description="لا تفعّلي استقبال الطلبات قبل مراجعة المنتجات وصورها والسياسات وإعداد قاعدة البيانات الدائمة والتخزين. هذا الإعداد لا ينشر الموقع تجاريًا أو يشتري خدمة."
        serialize={(data) => data.has("enabled")}
      >
        <label className="admin-checkbox">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.checkoutEnabled === true}
          />
          تفعيل استقبال طلبات الدفع عند الاستلام بعد اكتمال الاعتمادات
        </label>
      </SettingsForm>
      <SettingsForm
        title="إعدادات التحليلات الاختيارية"
        settingKey="analytics"
        description="تُحفظ المعرفات للتحضير فقط. التتبع معطل، ولا تُحمّل أدوات خارجية قبل تنفيذ آلية الموافقات واعتمادها. لا تسجّلي طلب الدفع عند الاستلام كبيع محصل."
        serialize={(data) => ({
          ...analytics,
          enabled: false,
          ga4Id: data.get("ga4Id") || null,
          metaPixelId: data.get("metaPixelId") || null,
          searchConsoleVerification:
            data.get("searchConsoleVerification") || null,
        })}
      >
        <label>
          معرّف Google Analytics 4
          <input
            name="ga4Id"
            dir="ltr"
            maxLength={50}
            defaultValue={str(analytics.ga4Id)}
            placeholder="G-…"
          />
        </label>
        <label>
          معرّف Meta Pixel
          <input
            name="metaPixelId"
            dir="ltr"
            maxLength={50}
            defaultValue={str(analytics.metaPixelId)}
          />
        </label>
        <label>
          رمز تحقق Search Console
          <input
            name="searchConsoleVerification"
            dir="ltr"
            maxLength={250}
            defaultValue={str(analytics.searchConsoleVerification)}
          />
        </label>
        <p className="admin-field-wide">الحالة: التتبع معطّل بأمان.</p>
      </SettingsForm>
    </div>
  );
}

export function LogoForm({ store }: { store: JsonRecord }) {
  const router = useRouter();
  const [logo, setLogo] = useState({
    url: str(store.logoUrl),
    originalKey: str(store.logoOriginalKey),
    proof: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر رفع الشعار.");
      setLogo(result);
      setMessage("تم رفع الشعار؛ احفظيه لتطبيقه.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر الاتصال.");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "store",
          value: JSON.stringify({
            ...store,
            logoUrl: logo.url || null,
            logoOriginalKey: logo.originalKey || null,
            ...(logo.proof ? { logoProof: logo.proof } : {}),
          }),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حفظ الشعار.");
      setMessage("تم حفظ الشعار الأصلي.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر الاتصال.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" className="admin-editor" onSubmit={save}>
      <h2>الشعار الأصلي</h2>
      <p>
        ارفعي ملف الشعار المعتمد فقط. تُحفظ نسبه وألوانه، ولا يعاد رسمه. عند
        غيابه يعرض الموقع اسم العلامة كنص.
      </p>
      {logo.url && (
        <Image
          unoptimized
          src={logo.url}
          alt="الشعار الأصلي الحالي"
          width={240}
          height={140}
          style={{ objectFit: "contain", marginBottom: 20 }}
        />
      )}
      <label className="admin-field">
        <span>ملف الشعار الأصلي</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </label>
      <div className="admin-actions">
        <button type="submit" disabled={busy}>
          حفظ الشعار
        </button>
        {logo.url && (
          <button
            type="button"
            className="admin-danger"
            disabled={busy}
            onClick={() => setLogo({ url: "", originalKey: "", proof: "" })}
          >
            إزالة الشعار
          </button>
        )}
      </div>
      <p role="status">{busy ? "جارٍ العمل…" : message}</p>
    </form>
  );
}
