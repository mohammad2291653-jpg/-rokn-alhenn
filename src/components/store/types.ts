export type StoreProduct = {
  id: string; slug: string; name: string; weightGrams: number; priceAgorot: number;
  available: boolean; featured: boolean; description: string | null;
  ingredients: string | null; usage: string | null; warnings: string | null;
  category: { id: string; name: string; slug: string };
  images: { id: string; url: string; alt: string; position: number }[];
};
export type CartLine = { id: string; quantity: number; name: string; slug: string; weightGrams: number; priceAgorot: number; image: string | null };
export const money = (agorot: number) => `${new Intl.NumberFormat('ar-PS', { maximumFractionDigits: 2 }).format(agorot / 100)} ₪`;
export const safeWhatsApp = (text: string, phone = '970599373380') => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
export const ORDER_LABELS: Record<string, string> = { NEW: 'جديد', PENDING_CONFIRMATION: 'بانتظار التأكيد', CONFIRMED: 'تم التأكيد', PREPARING: 'قيد التجهيز', SHIPPED: 'تم الشحن', DELIVERED: 'تم التسليم', CANCELLED: 'ملغى' };
export const PAYMENT_LABELS: Record<string, string> = { UNPAID: 'غير مدفوع', COLLECTED: 'تم التحصيل', CANCELLED: 'ألغي', REFUNDED: 'أُعيد المبلغ' };
