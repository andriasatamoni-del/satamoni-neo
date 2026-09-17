import { randomUUID } from "node:crypto";
import { EmptyPendingOrderItemsError, WhatsappPendingOrderNotPendingError } from "./errors";

export const WHATSAPP_PENDING_ORDER_STATUSES = ["PENDING", "CONFIRMED", "REJECTED"] as const;
export type WhatsappPendingOrderStatus = (typeof WHATSAPP_PENDING_ORDER_STATUSES)[number];

export interface WhatsappPendingOrderLine {
  id: string;
  variantId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
}

export interface WhatsappPendingOrderProps {
  conversationId: string;
  customerPhone: string;
  customerName: string | null;
  orderType: string;
  branchId: string;
  addressDetails: string | null;
  lines: WhatsappPendingOrderLine[];
  total: number;
  status: WhatsappPendingOrderStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  confirmedOrderId: string | null;
  createdAt: Date;
}

// WhatsappPendingOrder - نفس مفهوم whatsapp_pending_orders في الريبو القديم، بس مبسّط: بدل ما يبقى
// "مسودة" بيجمّعها بوت ذكاء اصطناعي تدريجيًا (DRAFT -> PENDING)، هنا موظف كول سنتر/أدمن بيدخل الأصناف
// مباشرة (بالرجوع الحقيقي لقائمة الطعام - variantId حقيقي مش نص حر) بعد ما يقرا طلب العميل في المحادثة،
// فبيتسجل PENDING على طول - مفيش حالة DRAFT هنا أصلًا (تجميع تدريجي محتاج البوت نفسه، مؤجّل لحد ما
// بيانات اعتماد Meta/Anthropic تتوفر). confirm() بينده على RegisterOrderHandler بالظبط زي POST
// /orders العادي - مفيش منطق مخزون/محاسبة مكرر هنا خالص
export class WhatsappPendingOrder {
  private constructor(
    public readonly id: string,
    private props: WhatsappPendingOrderProps
  ) {}

  static register(input: {
    conversationId: string;
    customerPhone: string;
    customerName?: string | null;
    orderType: string;
    branchId: string;
    addressDetails?: string | null;
    lines: { variantId: string; itemName: string; quantity: number; unitPrice: number }[];
  }): WhatsappPendingOrder {
    if (input.lines.length === 0) throw new EmptyPendingOrderItemsError();

    const lines: WhatsappPendingOrderLine[] = input.lines.map((l) => ({
      id: randomUUID(),
      variantId: l.variantId,
      itemName: l.itemName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    }));
    const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

    return new WhatsappPendingOrder(randomUUID(), {
      conversationId: input.conversationId,
      customerPhone: input.customerPhone,
      customerName: input.customerName ?? null,
      orderType: input.orderType,
      branchId: input.branchId,
      addressDetails: input.addressDetails ?? null,
      lines,
      total,
      status: "PENDING",
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      confirmedOrderId: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: WhatsappPendingOrderProps): WhatsappPendingOrder {
    return new WhatsappPendingOrder(id, props);
  }

  confirm(input: { confirmedOrderId: string; reviewedBy: string | null }): void {
    if (this.props.status !== "PENDING") throw new WhatsappPendingOrderNotPendingError();
    this.props.status = "CONFIRMED";
    this.props.confirmedOrderId = input.confirmedOrderId;
    this.props.reviewedBy = input.reviewedBy;
    this.props.reviewedAt = new Date();
  }

  reject(input: { reason?: string | null; reviewedBy: string | null }): void {
    if (this.props.status !== "PENDING") throw new WhatsappPendingOrderNotPendingError();
    this.props.status = "REJECTED";
    this.props.rejectionReason = input.reason ?? null;
    this.props.reviewedBy = input.reviewedBy;
    this.props.reviewedAt = new Date();
  }

  get conversationId(): string { return this.props.conversationId; }
  get customerPhone(): string { return this.props.customerPhone; }
  get customerName(): string | null { return this.props.customerName; }
  get orderType(): string { return this.props.orderType; }
  get branchId(): string { return this.props.branchId; }
  get addressDetails(): string | null { return this.props.addressDetails; }
  get lines(): readonly WhatsappPendingOrderLine[] { return this.props.lines; }
  get total(): number { return this.props.total; }
  get status(): WhatsappPendingOrderStatus { return this.props.status; }
  get rejectionReason(): string | null { return this.props.rejectionReason; }
  get reviewedBy(): string | null { return this.props.reviewedBy; }
  get reviewedAt(): Date | null { return this.props.reviewedAt; }
  get confirmedOrderId(): string | null { return this.props.confirmedOrderId; }
  get createdAt(): Date { return this.props.createdAt; }
}
