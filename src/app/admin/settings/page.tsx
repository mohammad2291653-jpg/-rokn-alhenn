import { db } from "@/lib/db";
import {
  AdminHeading,
  ensureAdminPage,
  money,
} from "@/components/admin/shared";
import { Editor, type EditorField } from "@/components/admin/Editor";
import { SettingsForms } from "@/components/admin/SettingsForms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await ensureAdminPage();
  const [entries, zones] = await Promise.all([
    db.siteSetting.findMany(),
    db.deliveryZone.findMany({
      where: { code: { in: ["west-bank", "interior", "jerusalem"] } },
      include: { cities: { orderBy: { name: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const settings = Object.fromEntries(
    entries.map((entry) => [entry.key, entry.value]),
  );
  const cityFields: EditorField[] = [
    { name: "name", label: "اسم المدينة أو البلدة", required: true },
    {
      name: "zoneId",
      label: "منطقة التوصيل",
      type: "select",
      required: true,
      options: zones.map((zone) => ({ value: zone.id, label: zone.name })),
    },
    { name: "enabled", label: "متاحة للاختيار", type: "checkbox" },
  ];
  return (
    <>
      <AdminHeading
        title="إعدادات المتجر والتوصيل"
        description="الدفع عند الاستلام هو وسيلة الدفع الوحيدة. الرسوم تُحتسب على الخادم وتُضاف مرة واحدة إلى الطلب."
      />
      <nav className="admin-section-nav" aria-label="أقسام الإعدادات">
        <a href="#delivery">مناطق التوصيل</a>
        <a href="#cities">المدن والبلدات</a>
        <a href="#site-settings">الهوية والسياسات</a>
      </nav>
      <section id="delivery" className="admin-panel">
        <h2>مناطق التوصيل</h2>
        <p>
          التوصيل إلى قطاع غزة غير متاح حاليًا، ولا يمكن إنشاء منطقة غزة أو
          اعتمادها من هذه الواجهة. القدس مستقلة؛ اتركي رسومها فارغة وغير معتمدة
          إلى حين اتخاذ قرار تجاري واضح.
        </p>
        {zones.map((zone) => {
          const fields: EditorField[] = [
            {
              name: "code",
              label: "المنطقة",
              type: "select",
              options: [{ value: zone.code, label: zone.name }],
              required: true,
            },
            { name: "name", label: "الاسم المعروض", required: true },
            {
              name: "feeILS",
              label: "رسوم الطلب بالشيكل",
              type: "number",
              min: 0,
              step: "0.01",
              hint: "تضاف مرة واحدة للطلب. للقدس يمكن تركها فارغة دون تحديد رسوم تلقائية.",
            },
            { name: "enabled", label: "إتاحة المنطقة", type: "checkbox" },
            {
              name: "approved",
              label: "اعتماد الرسوم المحددة",
              type: "checkbox",
            },
          ];
          return (
            <details
              className="admin-disclosure"
              key={zone.id}
              open={zone.code === "jerusalem"}
            >
              <summary>
                {zone.name}{" "}
                <small>
                  ·{" "}
                  {zone.feeAgorot === null || !zone.approved
                    ? "بانتظار اعتماد التوصيل والتكلفة"
                    : money(zone.feeAgorot)}
                  {!zone.enabled ? " · معطلة" : ""}
                </small>
              </summary>
              <Editor
                resource="zone"
                initial={{
                  id: zone.id,
                  code: zone.code,
                  name: zone.name,
                  feeILS:
                    zone.feeAgorot === null
                      ? ""
                      : (zone.feeAgorot / 100).toFixed(2),
                  enabled: zone.enabled,
                  approved: zone.approved,
                }}
                fields={fields}
              />
            </details>
          );
        })}
      </section>
      <section id="cities" className="admin-panel">
        <h2>المدن والبلدات</h2>
        <p>
          القائمة إدارية اختيارية. عند إضافة مدن فعّالة لمنطقة، تصبح هي الخيارات
          المعتمدة لتلك المنطقة. لا تضيفي مدينة تابعة لغزة تحت منطقة أخرى؛ يتحقق
          الخادم من التعارضات المعروفة أيضًا.
        </p>
        {zones.map((zone) => (
          <details className="admin-disclosure" key={zone.id}>
            <summary>
              {zone.name} <small>· {zone.cities.length} مدن وبلدات</small>
            </summary>
            {zone.cities.length === 0 && (
              <p>لم تُضف قائمة مدن لهذه المنطقة بعد.</p>
            )}
            {zone.cities.map((city) => (
              <details className="admin-disclosure" key={city.id}>
                <summary>
                  {city.name}
                  {city.enabled ? "" : " · معطلة"}
                </summary>
                <Editor
                  resource="city"
                  initial={{
                    id: city.id,
                    name: city.name,
                    zoneId: city.zoneId,
                    enabled: city.enabled,
                  }}
                  fields={cityFields}
                  deletable
                />
              </details>
            ))}
            <Editor
              resource="city"
              title="إضافة مدينة أو بلدة"
              initial={{ zoneId: zone.id, enabled: true }}
              fields={cityFields}
            />
          </details>
        ))}
      </section>
      <section id="site-settings">
        <SettingsForms settings={settings} />
      </section>
    </>
  );
}
