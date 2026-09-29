import { InvalidOnlineOrderError } from "./errors";
import { normalizePhone } from "../../customers/domain/customer.aggregate";

export const ONLINE_ORDER_TYPES = ["delivery", "takeaway", "dinein"] as const;
export type OnlineOrderType = (typeof ONLINE_ORDER_TYPES)[number];

const PHONE_RE = /^\d{8,15}$/;
export const MAX_ONLINE_ORDER_LINES = 30;
export const MAX_ONLINE_LINE_QUANTITY = 50;

export interface OnlineOrderInput {
  branch: { id: string; supportsDineIn: boolean };
  orderType: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerPhone2?: string | null;
  addressDetails?: string | null;
  distinguishingMark?: string | null;
  tableNumber?: string | null;
  notes?: string | null;
  items: { variantId?: string; comboId?: string; quantity: number; modifierIds?: string[] }[];
}

export interface NormalizedOnlineOrder {
  branchId: string;
  orderType: OnlineOrderType;
  customerName: string;
  customerPhone: string;
  addressDetails: string | null;
  tableNumber: string | null;
  customerNotes: string | null;
  items: { variantId?: string; comboId?: string; quantity: number; modifierIds?: string[] }[];
}

// قواعد طلب الموقع (نفس تحقق public/order.html + POST /api/orders source=website في الريبو القديم) -
// دالة نقية من غير DB: الأسعار نفسها مش هنا خالص، بتتحسب على السيرفر من المنيو الحقيقي في
// RegisterOrderHandler (العميل مابيبعتش أي سعر). neo مفيهوش أعمدة منفصلة لـ"علامة مميزة" و"تليفون تاني"
// على الطلب - بيتضافوا لنص العنوان نفسه عشان يوصلوا للطيار في بون التوصيل زي ما هم.
export function normalizeOnlineOrder(input: OnlineOrderInput): NormalizedOnlineOrder {
  if (!ONLINE_ORDER_TYPES.includes(input.orderType as OnlineOrderType)) {
    throw new InvalidOnlineOrderError("نوع الطلب لازم يكون توصيل أو استلام من الفرع أو في الصالة");
  }
  const orderType = input.orderType as OnlineOrderType;

  const customerName = (input.customerName ?? "").trim();
  if (!customerName) throw new InvalidOnlineOrderError("اكتب اسمك");
  if (customerName.length > 80) throw new InvalidOnlineOrderError("الاسم طويل زيادة");

  const customerPhone = normalizePhone(input.customerPhone ?? "");
  if (!PHONE_RE.test(customerPhone)) throw new InvalidOnlineOrderError("رقم التليفون غير صالح");
  const phone2 = normalizePhone(input.customerPhone2 ?? "");
  if (phone2 && !PHONE_RE.test(phone2)) throw new InvalidOnlineOrderError("رقم التليفون التاني غير صالح");

  if (input.items.length === 0) throw new InvalidOnlineOrderError("السلة فاضية");
  if (input.items.length > MAX_ONLINE_ORDER_LINES) throw new InvalidOnlineOrderError("عدد الأصناف كبير زيادة - كلّمنا للطلبات الكبيرة");
  for (const item of input.items) {
    if (!!item.variantId === !!item.comboId) throw new InvalidOnlineOrderError("صنف غير صالح في السلة");
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ONLINE_LINE_QUANTITY) {
      throw new InvalidOnlineOrderError("الكمية غير صالحة");
    }
    if (item.comboId && item.modifierIds?.length) throw new InvalidOnlineOrderError("العروض مالهاش إضافات");
  }

  let addressDetails: string | null = null;
  let tableNumber: string | null = null;
  if (orderType === "delivery") {
    const address = (input.addressDetails ?? "").trim();
    if (!address) throw new InvalidOnlineOrderError("اكتب العنوان بالتفصيل");
    const parts = [address];
    const mark = (input.distinguishingMark ?? "").trim();
    if (mark) parts.push(`علامة مميزة: ${mark}`);
    if (phone2) parts.push(`تليفون تاني: ${phone2}`);
    addressDetails = parts.join(" - ");
  } else if (orderType === "dinein") {
    if (!input.branch.supportsDineIn) throw new InvalidOnlineOrderError("الفرع ده مفيهوش صالة");
    tableNumber = (input.tableNumber ?? "").trim();
    if (!tableNumber) throw new InvalidOnlineOrderError("اكتب رقم الترابيزة");
  }

  const notes = (input.notes ?? "").trim();
  if (notes.length > 500) throw new InvalidOnlineOrderError("الملاحظات طويلة زيادة");

  return {
    branchId: input.branch.id,
    orderType,
    customerName,
    customerPhone,
    addressDetails,
    tableNumber,
    customerNotes: notes || null,
    items: input.items.map((i) => ({ variantId: i.variantId, comboId: i.comboId, quantity: i.quantity, modifierIds: i.modifierIds ?? [] })),
  };
}
