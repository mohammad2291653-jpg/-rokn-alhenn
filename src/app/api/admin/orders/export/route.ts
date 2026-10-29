import { escapeCsvCell } from "@/lib/csv";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit, jsonError } from "@/lib/security";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    await consumeRateLimit(request, `csv-export:${admin.id}`, 10, 60000);
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 160);
    const status = url.searchParams.get("status") || "";
    const statuses = [
      "NEW",
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "PREPARING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
    ];
    const where: Prisma.OrderWhereInput = {
      ...(statuses.includes(status)
        ? { status: status as Prisma.EnumOrderStatusFilter }
        : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { customerName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const orders = await db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
      select: {
        number: true,
        customerName: true,
        phone: true,
        zoneName: true,
        city: true,
        address: true,
        status: true,
        paymentStatus: true,
        subtotalAgorot: true,
        deliveryAgorot: true,
        totalAgorot: true,
        createdAt: true,
      },
    });
    const lines = [
      "رقم الطلب,الاسم,الهاتف,المنطقة,المدينة,العنوان,حالة الطلب,حالة الدفع,مجموع المنتجات ILS,التوصيل ILS,الإجمالي ILS,التاريخ",
      ...orders.map((order) =>
        [
          order.number,
          order.customerName,
          order.phone,
          order.zoneName,
          order.city,
          order.address,
          order.status,
          order.paymentStatus,
          (order.subtotalAgorot / 100).toFixed(2),
          (order.deliveryAgorot / 100).toFixed(2),
          (order.totalAgorot / 100).toFixed(2),
          order.createdAt.toISOString(),
        ]
          .map(escapeCsvCell)
          .join(","),
      ),
    ];
    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "EXPORT_CSV",
        entityType: "Order",
        details: { count: orders.length },
      },
    });
    return new Response("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="rokn-orders.csv"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
