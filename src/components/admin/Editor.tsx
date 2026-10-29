"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type EditorField = {
  name: string;
  label: string;
  type?:
    "text" | "textarea" | "number" | "checkbox" | "select" | "url" | "image";
  options?: { value: string; label: string }[];
  required?: boolean;
  step?: string;
  min?: number;
  hint?: string;
};
export function Editor({
  resource,
  initial = {},
  fields,
  title,
  deletable = false,
}: {
  resource: string;
  initial?: Record<string, unknown>;
  fields: EditorField[];
  title?: string;
  deletable?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data: Record<string, unknown> = { id: initial.id, operation: "save" };
    for (const field of fields) {
      data[field.name] =
        field.type === "checkbox"
          ? form.has(field.name)
          : String(form.get(field.name) ?? "");
      if (field.type === "image") {
        data[`${field.name}OriginalKey`] = String(
          form.get(`${field.name}OriginalKey`) ?? "",
        );
        data[`${field.name}Proof`] = String(
          form.get(`${field.name}Proof`) ?? "",
        );
      }
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حفظ التعديلات.");
      setMessage("تم الحفظ بنجاح.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر الاتصال.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("هل تريدين حذف هذا السجل؟ لا يمكن التراجع عن الحذف.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: initial.id, operation: "delete" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر الحذف.");
      setMessage("تم الحذف.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر الاتصال.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" onSubmit={submit} className="admin-editor">
      {title && <h3>{title}</h3>}
      {fields.map((field) => (
        <label
          key={field.name}
          className={field.type === "checkbox" ? "admin-check" : "admin-field"}
        >
          <span>{field.label}</span>
          {field.type === "image" ? (
            <ImageField
              name={field.name}
              initial={String(initial[field.name] ?? "")}
            />
          ) : field.type === "textarea" ? (
            <textarea
              aria-label={field.label}
              name={field.name}
              defaultValue={String(initial[field.name] ?? "")}
              rows={5}
              required={field.required}
              maxLength={60000}
            />
          ) : field.type === "select" ? (
            <select
              aria-label={field.label}
              name={field.name}
              defaultValue={String(initial[field.name] ?? "")}
              required={field.required}
            >
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.type === "checkbox" ? (
            <input
              aria-label={field.label}
              type="checkbox"
              name={field.name}
              defaultChecked={Boolean(initial[field.name])}
            />
          ) : (
            <input
              aria-label={field.label}
              name={field.name}
              type={field.type || "text"}
              defaultValue={String(initial[field.name] ?? "")}
              required={field.required}
              step={field.step}
              min={field.min}
              maxLength={1000}
            />
          )}
          {field.hint && <small>{field.hint}</small>}
        </label>
      ))}
      <div className="admin-actions">
        <button disabled={busy} type="submit">
          {busy ? "جارٍ الحفظ…" : "حفظ التعديلات"}
        </button>
        {deletable && initial.id ? (
          <button
            type="button"
            className="admin-danger"
            disabled={busy}
            onClick={remove}
          >
            حذف
          </button>
        ) : null}
      </div>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

function ImageField({ name, initial }: { name: string; initial: string }) {
  const [image, setImage] = useState({
    url: initial,
    originalKey: "",
    proof: "",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    const data = new FormData();
    data.append("file", file);
    try {
      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: data,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر رفع الصورة");
      setImage(result);
      setMessage("تم رفع الصورة. احفظي التعديلات لتطبيقها.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر الاتصال");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <input type="hidden" name={name} value={image.url} />
      <input
        type="hidden"
        name={`${name}OriginalKey`}
        value={image.originalKey}
      />
      <input type="hidden" name={`${name}Proof`} value={image.proof} />
      {image.url && (
        <Image
          unoptimized
          src={image.url}
          alt="الصورة الحالية"
          width={160}
          height={120}
          style={{ objectFit: "contain" }}
        />
      )}
      <input
        aria-label="رفع صورة أصلية"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      {image.url && (
        <button
          type="button"
          onClick={() => setImage({ url: "", originalKey: "", proof: "" })}
        >
          إزالة الصورة
        </button>
      )}
      <small role="status">{busy ? "جارٍ الرفع…" : message}</small>
    </span>
  );
}
