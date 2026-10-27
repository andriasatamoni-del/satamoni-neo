import { randomUUID } from "node:crypto";
import {
  EmptyOrderError,
  InvalidKitchenStatusTransitionError,
  InvalidOrderItemError,
  OrderAlreadyFinalizedError,
  OrderCancelledError,
  UnknownKitchenStatusError,
  UnknownOrderStatusError,
  UnknownOrderTypeError,
} from "./errors";

export const ORDER_TYPES = ["dinein", "takeaway", "delivery"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = ["preparing", "out_for_delivery", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SOURCES = ["pos", "website", "whatsapp", "talabat"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const KITCHEN_STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY"] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

export interface OrderItemModifierLine {
  modifierId: string | null;
  nameAtSale: string;
  priceAtSale: number;
}

export interface OrderItemLine {
  id: string;
  menuItemId: string | null;
  variantId: string | null;
  comboId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: OrderItemModifierLine[];
}

export interface OrderProps {
  branchId: string;
  orderType: OrderType;
  tableNumber: string | null;
  customerName: string | null;
  customerId: string | null;
  customerPhone: string | null;
  addressDetails: string | null;
  items: OrderItemLine[];
  subtotal: number;
  discount: number;
  total: number;
  status: OrderStatus;
  kitchenStatus: KitchenStatus;
  kitchenAcceptedAt: Date | null;
  kitchenReadyAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  legacyOrderId: number | null;
  paymentMethodId: string | null;
  ratingToken: string;
  clientRequestId: string | null;
  source: OrderSource;
  customerNotes: string | null;
}

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
    customerId?: string | null;
    customerPhone?: string | null;
    addressDetails?: string | null;
    items: {
      menuItemId?: string | null;
      variantId?: string | null;
      comboId?: string | null;
      quantity: number;
      unitPrice: number;
      modifiers?: OrderItemModifierLine[];
    }[];
    discount?: number;
    createdBy?: string | null;
    legacyOrderId?: number | null;
    paymentMethodId?: string | null;
    clientRequestId?: string | null;
    source?: OrderSource;
    customerNotes?: string | null;
  }): Order {
    if (!ORDER_TYPES.includes(input.orderType as OrderType)) throw new UnknownOrderTypeError(input.orderType);
    if (input.items.length === 0) throw new EmptyOrderError();

    const items: OrderItemLine[] = input.items.map((i) => {
      const isCombo = !!i.comboId;
      if (isCombo ? i.menuItemId || i.variantId : !i.menuItemId || !i.variantId) throw new InvalidOrderItemError();
      return {
        id: randomUUID(),
        menuItemId: isCombo ? null : i.menuItemId!,
        variantId: isCombo ? null : i.variantId!,
        comboId: isCombo ? i.comboId! : null,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.quantity * i.unitPrice,
        modifiers: i.modifiers ?? [],
      };
    });
    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const discount = Math.min(Math.max(input.discount ?? 0, 0), subtotal);

    return new Order(randomUUID(), {
      branchId: input.branchId,
      orderType: input.orderType as OrderType,
      tableNumber: input.tableNumber ?? null,
      customerName: input.customerName ?? null,
      customerId: input.customerId ?? null,
      customerPhone: input.customerPhone ?? null,
      addressDetails: input.addressDetails ?? null,
      items,
      subtotal,
      discount,
      total: subtotal - discount,
      status: "preparing",
      kitchenStatus: "NEW",
      kitchenAcceptedAt: null,
      kitchenReadyAt: null,
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
      legacyOrderId: input.legacyOrderId ?? null,
      paymentMethodId: input.paymentMethodId ?? null,
      ratingToken: randomUUID(),
      clientRequestId: input.clientRequestId ?? null,
      source: input.source ?? "pos",
      customerNotes: input.customerNotes?.trim() || null,
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

  advanceKitchenStatus(status: string): void {
    if (!KITCHEN_STATUSES.includes(status as KitchenStatus)) throw new UnknownKitchenStatusError(status);
    if (this.props.status === "cancelled") throw new OrderCancelledError();

    const currentIdx = KITCHEN_STATUSES.indexOf(this.props.kitchenStatus);
    const nextIdx = KITCHEN_STATUSES.indexOf(status as KitchenStatus);
    if (nextIdx !== currentIdx + 1) throw new InvalidKitchenStatusTransitionError();

    this.props.kitchenStatus = status as KitchenStatus;
    if (status === "ACCEPTED") this.props.kitchenAcceptedAt = new Date();
    if (status === "READY") this.props.kitchenReadyAt = new Date();
  }

  get branchId(): string { return this.props.branchId; }
  get orderType(): OrderType { return this.props.orderType; }
  get tableNumber(): string | null { return this.props.tableNumber; }
  get customerName(): string | null { return this.props.customerName; }
  get customerId(): string | null { return this.props.customerId; }
  get customerPhone(): string | null { return this.props.customerPhone; }
  get addressDetails(): string | null { return this.props.addressDetails; }
  get items(): readonly OrderItemLine[] { return this.props.items; }
  get subtotal(): number { return this.props.subtotal; }
  get discount(): number { return this.props.discount; }
  get total(): number { return this.props.total; }
  get status(): OrderStatus { return this.props.status; }
  get kitchenStatus(): KitchenStatus { return this.props.kitchenStatus; }
  get kitchenAcceptedAt(): Date | null { return this.props.kitchenAcceptedAt; }
  get kitchenReadyAt(): Date | null { return this.props.kitchenReadyAt; }
  get createdBy(): string | null { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get legacyOrderId(): number | null { return this.props.legacyOrderId; }
  get paymentMethodId(): string | null { return this.props.paymentMethodId; }
  get ratingToken(): string { return this.props.ratingToken; }
  get clientRequestId(): string | null { return this.props.clientRequestId; }
  get source(): OrderSource { return this.props.source; }
  get customerNotes(): string | null { return this.props.customerNotes; }
}
