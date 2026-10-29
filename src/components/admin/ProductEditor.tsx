"use client";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
type ImageItem = {
  id?: string;
  url: string;
  originalKey: string | null;
  proof?: string;
  alt: string;
  position: number;
};
type ProductInitial = {
  id?: string;
  name?: string;
  slug?: string;
  weightGrams?: number;
  priceAgorot?: number;
  categoryId?: string;
  description?: string | null;
  ingredients?: string | null;
  usage?: string | null;
  warnings?: string | null;
  status?: string;
  available?: boolean;
  featured?: boolean;
  nameNeedsConfirmation?: boolean;
  stockTracked?: boolean;
  stockQuantity?: number | null;
  images?: ImageItem[];
};
export function ProductEditor({
  initial = {},
  categories,
}: {
  initial?: ProductInitial;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [images, setImages] = useState<ImageItem[]>(initial.images || []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const data: Record<string, unknown> = {
      id: initial.id,
      operation: "save",
      images,
    };
    for (const key of [
      "name",
      "slug",
      "weightGrams",
      "priceILS",
      "categoryId",
      "description",
      "ingredients",
      "usage",
      "warnings",
      "status",
      "stockQuantity",
    ])
      data[key] = String(form.get(key) ?? "");
    for (const key of [
      "available",
      "featured",
      "nameNeedsConfirmation",
      "stockTracked",
    ])
      data[key] = form.has(key);
    try {
      const response = await fetch("/api/admin/product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حفظ المنتج.");
      if (result.images) setImages(result.images);
      setMessage("تم الحفظ بنجاح.");
      if (!initial.id) router.push(`/admin/products/${result.id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر الاتصال.");
    } finally {
      setBusy(false);
    }
  }
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
      if (!response.ok) throw new Error(result.error || "تعذر رفع الصورة.");
      setImages((items) => [
        ...items,
        {
          url: result.url,
          originalKey: result.originalKey,
          proof: result.proof,
          alt: initial.name || "صورة المنتج الأصلية",
          position: items.length,
        },
      ]);
      setMessage("رُفعت الصورة. احفظي المنتج لربطها به.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر رفع الصورة.");
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, step: number) {
    setImages((items) => {
      const next = [...items];
      const target = index + step;
      if (target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, position) => ({ ...item, position }));
    });
  }
  return (
    <form method="post" onSubmit={save} className="admin-editor">
      <div className="admin-grid">
        <div>
          <label className="admin-field">
            <span>اسم المنتج</span>
            <input
              name="name"
              defaultValue={initial.name}
              required
              maxLength={180}
            />
          </label>
          <label className="admin-field">
            <span>الرابط المختصر</span>
            <input
              name="slug"
              dir="ltr"
              defaultValue={initial.slug}
              required
              maxLength={160}
              pattern="[a-z0-9\-]+"
            />
            <small>حروف إنجليزية صغيرة وأرقام وشرطات.</small>
          </label>
          <label className="admin-field">
            <span>الوزن بالغرام</span>
            <input
              name="weightGrams"
              type="number"
              min="1"
              max="100000"
              step="1"
              defaultValue={initial.weightGrams}
              required
            />
          </label>
          <label className="admin-field">
            <span>سعر البيع بالشيكل</span>
            <input
              name="priceILS"
              type="number"
              min="0.01"
              max="100000"
              step="0.01"
              defaultValue={
                initial.priceAgorot !== undefined
                  ? (initial.priceAgorot / 100).toFixed(2)
                  : ""
              }
              required
            />
          </label>
          <label className="admin-field">
            <span>الفئة</span>
            <select
              name="categoryId"
              defaultValue={initial.categoryId || categories[0]?.id}
              required
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>حالة النشر</span>
            <select name="status" defaultValue={initial.status || "DRAFT"}>
              <option value="DRAFT">مسودة</option>
              <option value="PUBLISHED">منشور</option>
              <option value="HIDDEN">مخفي</option>
            </select>
          </label>
          <label className="admin-check">
            <span>متوفر</span>
            <input
              name="available"
              type="checkbox"
              defaultChecked={initial.available ?? true}
            />
          </label>
          <label className="admin-check">
            <span>منتج مميز</span>
            <input
              name="featured"
              type="checkbox"
              defaultChecked={initial.featured}
            />
          </label>
          <label className="admin-check">
            <span>بحاجة لتأكيد الاسم</span>
            <input
              name="nameNeedsConfirmation"
              type="checkbox"
              defaultChecked={initial.nameNeedsConfirmation ?? true}
            />
          </label>
          <p>
            أزيلي علامة تأكيد الاسم فقط بعد مطابقة الاسم والصورة مع العبوة
            الأصلية.
          </p>
          <label className="admin-check">
            <span>تتبع مخزون فعلي داخلي</span>
            <input
              name="stockTracked"
              type="checkbox"
              defaultChecked={initial.stockTracked}
            />
          </label>
          <label className="admin-field">
            <span>الكمية الداخلية عند تفعيل التتبع</span>
            <input
              name="stockQuantity"
              type="number"
              min="0"
              max="1000000"
              step="1"
              defaultValue={initial.stockQuantity ?? ""}
            />
            <small>
              تُترك فارغة عند عدم وجود عدد دقيق. لا تظهر هذه القيمة للزبائن.
            </small>
          </label>
        </div>
        <div>
          {[
            { name: "description", label: "وصف مختصر معتمد" },
            { name: "ingredients", label: "المكونات المؤكدة" },
            { name: "usage", label: "طريقة الاستخدام المؤكدة" },
            { name: "warnings", label: "التحذيرات المؤكدة" },
          ].map((field) => (
            <label className="admin-field" key={field.name}>
              <span>{field.label}</span>
              <textarea
                name={field.name}
                rows={5}
                maxLength={10000}
                defaultValue={
                  (initial[field.name as keyof ProductInitial] as string) || ""
                }
              />
            </label>
          ))}
          <aside className="admin-notice">
            اتركي البيانات غير المتوفرة فارغة. لا تضيفي مكونات أو ادعاءات علاجية
            غير مؤكدة.
          </aside>
        </div>
      </div>
      <h2>صور العبوة الأصلية</h2>
      <p>
        JPEG أو PNG أو WebP، حتى 5 ميغابايت للصورة. احتفظي بنسب العبوة وتحققي من
        مطابقة المنتج.
      </p>
      <div className="admin-image-grid">
        {images.map((image, index) => (
          <figure key={image.id || image.originalKey || index}>
            <Image
              unoptimized
              src={image.url}
              alt={image.alt}
              width={150}
              height={150}
            />
            <figcaption>
              <label>
                وصف بديل
                <input
                  aria-label={`الوصف البديل للصورة ${index + 1}`}
                  value={image.alt}
                  maxLength={240}
                  onChange={(event) =>
                    setImages((items) =>
                      items.map((item, i) =>
                        i === index
                          ? { ...item, alt: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <div className="admin-actions">
                <button
                  type="button"
                  disabled={index === 0 || busy}
                  onClick={() => move(index, -1)}
                  aria-label="تقديم الصورة"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === images.length - 1 || busy}
                  onClick={() => move(index, 1)}
                  aria-label="تأخير الصورة"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="admin-danger"
                  disabled={busy}
                  onClick={() =>
                    setImages((items) => items.filter((_, i) => i !== index))
                  }
                >
                  إزالة
                </button>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
      <label className="admin-field" style={{ marginTop: 24 }}>
        <span>رفع صورة أصلية</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "جارٍ العمل…" : "حفظ المنتج"}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
