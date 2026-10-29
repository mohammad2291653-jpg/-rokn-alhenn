import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createShopFixture } from "./fixtures";

test.describe("authorized delivery and order operations", () => {
  test.skip(
    !process.env.TEST_DATABASE_URL,
    "Requires isolated test_rokn database and matching QA web server.",
  );
  let fixture: Awaited<ReturnType<typeof createShopFixture>>;
  test.beforeAll(async () => {
    fixture = await createShopFixture();
  });
  test.afterAll(async () => {
    await fixture?.cleanup();
  });
  async function login(page: import("@playwright/test").Page) {
    await page.goto("/admin");
    await page
      .getByLabel("البريد الإداري", { exact: true })
      .fill(fixture.email);
    await page
      .getByLabel("كلمة المرور", { exact: true })
      .fill(fixture.password);
    await page
      .getByRole("button", { name: "تسجيل الدخول", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "تسجيل الخروج", exact: true }),
    ).toBeVisible();
  }

  test("changes shipping price and preserves pending Jerusalem fee", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/admin/settings");
    const westDetails = page
      .locator("details")
      .filter({
        has: page.locator('select[name="code"] option[value="west-bank"]'),
      })
      .first();
    await westDetails.locator("summary").first().click();
    const form = westDetails.locator("form");
    await form.getByLabel("رسوم الطلب بالشيكل", { exact: true }).fill("23");
    await form.getByRole("button", { name: "حفظ التعديلات" }).click();
    await expect(form.getByRole("status")).toContainText("تم الحفظ");
    expect(
      (
        await fixture.db.deliveryZone.findUniqueOrThrow({
          where: { code: "west-bank" },
        })
      ).feeAgorot,
    ).toBe(2300);
    const jerusalem = await fixture.db.deliveryZone.findUniqueOrThrow({
      where: { code: "jerusalem" },
    });
    expect(jerusalem.feeAgorot).toBeNull();
    expect(jerusalem.approved).toBe(false);
    await fixture.db.deliveryZone.update({
      where: { code: "west-bank" },
      data: { feeAgorot: 2000 },
    });
  });

  test("updates order and payment states, rejects cross-origin writes and audits history", async ({
    page,
    baseURL,
  }) => {
    await login(page);
    const zone = await fixture.db.deliveryZone.findUniqueOrThrow({
      where: { code: "west-bank" },
    });
    const created = await page.request.post("/api/orders", {
      headers: { origin: baseURL! },
      data: {
        items: [{ productId: fixture.product.id, quantity: 1 }],
        zoneId: zone.id,
        customerName: "زبونة اختبار الإدارة",
        phone: "0599123456",
        city: "رام الله",
        address: "رام الله شارع الاختبار بناية ١",
        acceptPolicies: true,
        idempotencyKey: randomUUID(),
      },
    });
    expect(created.status()).toBe(201);
    const order = await fixture.db.order.findFirstOrThrow({
      where: { items: { some: { productId: fixture.product.id } } },
      orderBy: { createdAt: "desc" },
    });
    const crossOrigin = await page.request.post("/api/admin/order", {
      headers: { origin: "https://foreign.example" },
      data: {
        id: order.id,
        status: "DELIVERED",
        paymentStatus: "COLLECTED",
        internalNotes: "",
      },
    });
    expect(crossOrigin.status()).toBe(403);
    await page.goto(`/admin/orders/${order.id}`);
    await page
      .getByLabel("حالة الطلب", { exact: true })
      .selectOption("DELIVERED");
    await page
      .getByLabel("حالة الدفع", { exact: true })
      .selectOption("COLLECTED");
    await page
      .getByLabel("ملاحظات داخلية للإدارة", { exact: true })
      .fill("تم التسليم والتحصيل في اختبار معزول.");
    await page
      .getByRole("button", { name: "حفظ التعديلات", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("تم الحفظ");
    const saved = await fixture.db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { history: true },
    });
    expect(saved.status).toBe("DELIVERED");
    expect(saved.paymentStatus).toBe("COLLECTED");
    expect(
      saved.history.some(
        (entry) =>
          entry.status === "DELIVERED" && entry.actorId === fixture.userId,
      ),
    ).toBe(true);
    const erasePayment = await page.request.post("/api/admin/order", {
      headers: { origin: baseURL! },
      data: {
        id: order.id,
        status: "DELIVERED",
        paymentStatus: "UNPAID",
        internalNotes: "",
      },
    });
    expect(erasePayment.status()).toBe(400);
  });

  test("cancellation restores reserved stock exactly once and cannot reopen", async ({
    page,
    baseURL,
  }) => {
    await login(page);
    await fixture.db.product.update({
      where: { id: fixture.product.id },
      data: { stockTracked: true, stockQuantity: 3 },
    });
    const zone = await fixture.db.deliveryZone.findUniqueOrThrow({
      where: { code: "west-bank" },
    });
    const created = await page.request.post("/api/orders", {
      headers: { origin: baseURL! },
      data: {
        items: [{ productId: fixture.product.id, quantity: 2 }],
        zoneId: zone.id,
        customerName: "زبونة اختبار إلغاء",
        phone: "0599123456",
        city: "رام الله",
        address: "رام الله شارع الاختبار بناية ١",
        acceptPolicies: true,
        idempotencyKey: randomUUID(),
      },
    });
    expect(created.status()).toBe(201);
    const order = await fixture.db.order.findFirstOrThrow({
      where: {
        customerName: "زبونة اختبار إلغاء",
        items: { some: { productId: fixture.product.id } },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(
      (
        await fixture.db.product.findUniqueOrThrow({
          where: { id: fixture.product.id },
        })
      ).stockQuantity,
    ).toBe(1);
    for (let n = 0; n < 2; n++) {
      const cancellation = await page.request.post("/api/admin/order", {
        headers: { origin: baseURL! },
        data: {
          id: order.id,
          status: "CANCELLED",
          paymentStatus: "CANCELLED",
          internalNotes: "اختبار الإلغاء",
        },
      });
      expect(cancellation.status()).toBe(200);
    }
    expect(
      (
        await fixture.db.product.findUniqueOrThrow({
          where: { id: fixture.product.id },
        })
      ).stockQuantity,
    ).toBe(3);
    const reopen = await page.request.post("/api/admin/order", {
      headers: { origin: baseURL! },
      data: {
        id: order.id,
        status: "NEW",
        paymentStatus: "UNPAID",
        internalNotes: "",
      },
    });
    expect(reopen.status()).toBe(400);
  });
});
