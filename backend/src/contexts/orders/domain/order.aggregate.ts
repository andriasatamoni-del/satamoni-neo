import { randomUUID } from "node:crypto";
import {
  EmptyOrderError,
  OrderAlreadyFinalizedError,
  UnknownKitchenStatusError,
  UnknownOrderStatusError,
  UnknownOrderTypeError,
} from "./errors";

export const ORDER_TYPES = ["dinein", "takeaway", "delivery"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = ["preparing", "out_for_delivery", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const KITCHEN_STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY"] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

export interface OrderItemLine {
  id: string;
  menuItemId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderProps {
  branchId: string;
  orderType: OrderType;
  tableNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  addressDetails: string | null;
  items: OrderItemLine[];
  subtotal: number;
  discount: number;
  total: number;
  status: OrderStatus;
  kitchenStatus: KitchenStatus;
  createdBy: string | null;
  createdAt: Date;
  legacyOrderId: number | null;
}

// Order - نفس مفهوم orders+order_items في الريبو القديم، بس مبسّط للسلايس الأول (Phase 3): من غير
// نقاط الولاء، الضريبة المجمّدة، workflow الـvoid، تفاصيل التوصيل (driver/dispatch_status - دول
// context تاني، Delivery & Dispatch)، الشيفتات، أو order_status_log. status/kitchenStatus منفصلين
// تمامًا عن بعض - نفس فلسفة الريبو القديم بالظبط (status مستقل عن kitchen_status). استهلاك المخزون
// الفعلي (عن طريق الوصفة النشطة لكل حجم) بيحصل في الـapplication layer وقت التسجيل (RegisterOrderHandler)
// مش هنا - الدومين هنا مسؤول بس عن شكل/قواعد الطلب نفسه.
export class Order {
  private constructor(
    public readonly id: string,
    private props: OrderProps
  ) {}

  static register(input: {
    branchId: string;
    orderType: string;
    tableNumber?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    addressDetails?: string | null;
    items: { menuItemId: string; variantId: string; quantity: number; unitPrice: number }[];
    discount?: number;
    createdBy?: string | null;
    legacyOrderId?: number | null;
  }): Order {
    if (!ORDER_TYPES.includes(input.orderType as OrderType)) throw new UnknownOrderTypeError(input.orderType);
    if (input.items.length === 0) throw new EmptyOrderError();

    const items: OrderItemLine[] = input.items.map((i) => ({
      id: randomUUID(),
      menuItemId: i.menuItemId,
      variantId: i.variantId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.quantity * i.unitPrice,
    }));
    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const discount = input.discount ?? 0;

    return new Order(randomUUID(), {
      branchId: input.branchId,
      orderType: input.orderType as OrderType,
      tableNumber: input.tableNumber ?? null,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      addressDetails: input.addressDetails ?? null,
      items,
      subtotal,
      discount,
      total: subtotal - discount,
      status: "preparing",
      kitchenStatus: "NEW",
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
      legacyOrderId: input.legacyOrderId ?? null,
    });
  }

  static reconstitute(id: string, props: OrderProps): Order {
    return new Order(id, props);
  }

  setStatus(status: string): void {
    if (!ORDER_STATUSES.includes(status as OrderStatus)) throw new UnknownOrderStatusError(status);
    if (this.props.status === "completed" || this.props.status === "cancelled") {
      throw new OrderAlreadyFinalizedError();
    }
    this.props.status = status as OrderStatus;
  }

  setKitchenStatus(status: string): void {
    if (!KITCHEN_STATUSES.includes(status as KitchenStatus)) throw new UnknownKitchenStatusError(status);
    this.props.kitchenStatus = status as KitchenStatus;
  }

  get branchId(): string { return this.props.branchId; }
  get orderType(): OrderType { return this.props.orderType; }
  get tableNumber(): string | null { return this.props.tableNumber; }
  get customerName(): string | null { return this.props.customerName; }
  get customerPhone(): string | null { return this.props.customerPhone; }
  get addressDetails(): string | null { return this.props.addressDetails; }
  get items(): readonly OrderItemLine[] { return this.props.items; }
  get subtotal(): number { return this.props.subtotal; }
  get discount(): number { return this.props.discount; }
  get total(): number { return this.props.total; }
  get status(): OrderStatus { return this.props.status; }
  get kitchenStatus(): KitchenStatus { return this.props.kitchenStatus; }
  get createdBy(): string | null { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get legacyOrderId(): number | null { return this.props.legacyOrderId; }
}
