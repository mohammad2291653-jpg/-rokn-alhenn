import { db } from "@/lib/db";
import { AdminHeading, ensureAdminPage } from "@/components/admin/shared";
import { Editor, type EditorField } from "@/components/admin/Editor";

export const dynamic = "force-dynamic";

const sectionFields: EditorField[] = [
  {
    name: "key",
    label: "مفتاح القسم",
    required: true,
    hint: "الأقسام الرئيسية: hero وheritage وwhy. تغيير المفتاح يفصل القسم عن مكانه في الصفحة.",
  },
  { name: "title", label: "العنوان", required: true },
  { name: "body", label: "النص", type: "textarea", required: true },
  { name: "imageUrl", label: "صورة أصلية للقسم", type: "image" },
  {
    name: "position",
    label: "ترتيب الظهور",
    type: "number",
    min: 0,
    required: true,
  },
  { name: "enabled", label: "إظهار القسم", type: "checkbox" },
];
const articleFields: EditorField[] = [
  { name: "title", label: "عنوان المقال", required: true },
  {
    name: "slug",
    label: "الرابط المختصر",
    required: true,
    hint: "استخدمي حروفًا وأرقامًا وشرطات، دون مسافات.",
  },
  {
    name: "excerpt",
    label: "المقدمة المختصرة",
    type: "textarea",
    required: true,
  },
  {
    name: "body",
    label: "نص المقال",
    type: "textarea",
    required: true,
    hint: "نص عادي. ميّزي الاستخدام التراثي عن الأدلة العلمية، ولا تضيفي ادعاءات علاجية غير مثبتة.",
  },
  { name: "imageUrl", label: "صورة المقال", type: "image" },
  {
    name: "reviewed",
    label: "راجعتُ المعلومات وأعتمد المحتوى",
    type: "checkbox",
  },
  { name: "published", label: "نشر المقال بعد المراجعة", type: "checkbox" },
];
const faqFields: EditorField[] = [
  { name: "question", label: "السؤال", required: true },
  { name: "answer", label: "الإجابة", type: "textarea", required: true },
  {
    name: "position",
    label: "ترتيب الظهور",
    type: "number",
    min: 0,
    required: true,
  },
  { name: "published", label: "نشر السؤال والإجابة", type: "checkbox" },
];
const categoryFields: EditorField[] = [
  { name: "name", label: "اسم الفئة", required: true },
  { name: "slug", label: "الرابط المختصر", required: true },
  {
    name: "position",
    label: "ترتيب الظهور",
    type: "number",
    min: 0,
    required: true,
  },
];
const discountFields: EditorField[] = [
  { name: "title", label: "اسم العرض المقترح", required: true },
  { name: "code", label: "رمز العرض", required: true },
  {
    name: "percent",
    label: "النسبة المقترحة %",
    type: "number",
    min: 1,
    required: true,
  },
];

export default async function ContentPage() {
  await ensureAdminPage();
  const [sections, articles, faqs, categories, discounts] = await Promise.all([
    db.contentSection.findMany({ orderBy: { position: "asc" } }),
    db.article.findMany({ orderBy: { updatedAt: "desc" } }),
    db.fAQ.findMany({ orderBy: { position: "asc" } }),
    db.category.findMany({
      orderBy: { position: "asc" },
      include: { _count: { select: { products: true } } },
    }),
    db.discount.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <>
      <AdminHeading
        title="المحتوى والفئات"
        description="عدّلي نصوص المتجر ومقالاته وأسئلته الشائعة. المقالات لا تظهر للزبائن قبل المراجعة والنشر."
      />
      <nav className="admin-section-nav" aria-label="أقسام إدارة المحتوى">
        <a href="#sections">الصفحة الرئيسية</a>
        <a href="#articles">المقالات</a>
        <a href="#faqs">الأسئلة الشائعة</a>
        <a href="#categories">الفئات</a>
        <a href="#discounts">مسودات العروض</a>
      </nav>
      <section id="sections" className="admin-panel">
        <h2>الصفحة الرئيسية</h2>
        <p>
          ارفعي صور المنتجات الأصلية فقط. تُحفظ الصور في التخزين المهيأ للمتجر
          دون تعديل التغليف أو الشعار.
        </p>
        {sections.map((section) => (
          <details className="admin-disclosure" key={section.id}>
            <summary>
              {section.title}{" "}
              <small>({section.enabled ? "ظاهر" : "مخفي"})</small>
            </summary>
            <Editor
              resource="section"
              initial={{
                id: section.id,
                key: section.key,
                title: section.title,
                body: section.body,
                imageUrl: section.imageUrl || "",
                position: section.position,
                enabled: section.enabled,
              }}
              fields={sectionFields}
              deletable
            />
          </details>
        ))}
        <details className="admin-disclosure">
          <summary>إضافة قسم</summary>
          <Editor
            resource="section"
            initial={{ position: sections.length, enabled: false }}
            fields={sectionFields}
          />
        </details>
      </section>
      <section id="articles" className="admin-panel">
        <h2>دليل العناية بالشعر</h2>
        <p>
          احتفظي بالمحتوى غير المعتمد كمسودة. لا يُنشر المقال عند غياب علامة
          المراجعة.
        </p>
        {articles.map((article) => (
          <details className="admin-disclosure" key={article.id}>
            <summary>
              {article.title}{" "}
              <small>
                ({article.published && article.reviewed ? "منشور" : "مسودة"})
              </small>
            </summary>
            <Editor
              resource="article"
              initial={{
                id: article.id,
                title: article.title,
                slug: article.slug,
                excerpt: article.excerpt,
                body: article.body,
                imageUrl: article.imageUrl || "",
                reviewed: article.reviewed,
                published: article.published,
              }}
              fields={articleFields}
              deletable
            />
          </details>
        ))}
        <details className="admin-disclosure">
          <summary>كتابة مقال جديد</summary>
          <Editor
            resource="article"
            initial={{ reviewed: false, published: false }}
            fields={articleFields}
          />
        </details>
      </section>
      <section id="faqs" className="admin-panel">
        <h2>الأسئلة الشائعة</h2>
        {faqs.map((faq) => (
          <details className="admin-disclosure" key={faq.id}>
            <summary>
              {faq.question}{" "}
              <small>({faq.published ? "منشور" : "مسودة"})</small>
            </summary>
            <Editor
              resource="faq"
              initial={{
                id: faq.id,
                question: faq.question,
                answer: faq.answer,
                position: faq.position,
                published: faq.published,
              }}
              fields={faqFields}
              deletable
            />
          </details>
        ))}
        <details className="admin-disclosure">
          <summary>إضافة سؤال وإجابة</summary>
          <Editor
            resource="faq"
            initial={{ position: faqs.length, published: false }}
            fields={faqFields}
          />
        </details>
      </section>
      <section id="categories" className="admin-panel">
        <h2>فئات المنتجات</h2>
        <p>
          لا يمكن حذف فئة مرتبطة بمنتجات. انقلي منتجاتها إلى فئة أخرى أولًا.
        </p>
        {categories.map((category) => (
          <details className="admin-disclosure" key={category.id}>
            <summary>
              {category.name} <small>· {category._count.products} منتجات</small>
            </summary>
            <Editor
              resource="category"
              initial={{
                id: category.id,
                name: category.name,
                slug: category.slug,
                position: category.position,
              }}
              fields={categoryFields}
              deletable={category._count.products === 0}
            />
          </details>
        ))}
        <details className="admin-disclosure">
          <summary>إضافة فئة</summary>
          <Editor
            resource="category"
            initial={{ position: categories.length }}
            fields={categoryFields}
          />
        </details>
      </section>
      <section id="discounts" className="admin-panel">
        <h2>مسودات العروض</h2>
        <p>
          تُحفظ العروض هنا للمراجعة فقط. الخصومات غير مفعّلة في حساب الطلبات،
          ولا يظهر عرض أو تخفيض للزبائن بمجرد حفظ هذه المسودة.
        </p>
        {discounts.map((discount) => (
          <details className="admin-disclosure" key={discount.id}>
            <summary>
              {discount.title} <small>· مسودة غير فعّالة</small>
            </summary>
            <Editor
              resource="discount"
              initial={{
                id: discount.id,
                title: discount.title,
                code: discount.code,
                percent: discount.percent,
              }}
              fields={discountFields}
              deletable
            />
          </details>
        ))}
        <details className="admin-disclosure">
          <summary>إضافة مسودة عرض</summary>
          <Editor
            resource="discount"
            initial={{ percent: 5 }}
            fields={discountFields}
          />
        </details>
      </section>
    </>
  );
}
