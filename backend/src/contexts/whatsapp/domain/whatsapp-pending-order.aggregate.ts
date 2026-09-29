import { randomUUID } from "node:crypto";
import {
  EmptyPendingOrderItemsError,
  IncompletePendingOrderDraftError,
  WhatsappPendingOrderNotDraftError,
  WhatsappPendingOrderNotPendingError,
} from "./errors";

export const WHATSAPP_PENDING_ORDER_STATUSES = ["DRAFT", "PENDING", "CONFIRMED", "REJECTED"] as const;
export type WhatsappPendingOrderStatus = (typeof WHATSAPP_PENDING_ORDER_STATUSES)[number];

export interface WhatsappPendingOrderLine {
  id: string;
  variantId: string;
  // اسم الصنف + الحجم + الإضافات جاهز للعرض (السعر والاسم مجمّدين وقت الطلب)
  itemName: string;
  quantity: number;
  // سعر الحجم + الإضافات
  unitPrice: number;
  modifierIds: string[];
}

export interface PendingOrderLineInput {
  variantId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  modifierIds?: string[];
}

export interface WhatsappPendingOrderProps {
  conversationId: string;
  customerPhone: string;
  customerName: string | null;
  orderType: string;
  branchId: string | null;
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

function toLines(input: PendingOrderLineInput[]): WhatsappPendingOrderLine[] {
  return input.map((l) => ({
    id: randomUUID(),
    variantId: l.variantId,
    itemName: l.itemName,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    modifierIds: l.modifierIds ?? [],
  }));
}

function sumLines(lines: WhatsappPendingOrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

// WhatsappPendingOrder - نفس مفهوم whatsapp_pending_orders في الريبو القديم. طريقين للإنشاء:
// 1. register(): موظف كول سنتر بيدخل الأصناف مباشرة بعد ما يقرا المحادثة -> PENDING على طول.
// 2. startDraft()/updateDraft()/submit(): البوت بيجمّع الطلب تدريجيًا من كلام العميل (DRAFT)، ولما العميل
//    يأكد بيتحول PENDING للمراجعة البشرية. البوت عمره ما بيسجّل أوردر حقيقي بنفسه.
// confirm() بس هو اللي بيعمل أوردر حقيقي (عن طريق RegisterOrderHandler) - مفيش منطق مخزون/محاسبة هنا.
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
    lines: PendingOrderLineInput[];
  }): WhatsappPendingOrder {
    if (input.lines.length === 0) throw new EmptyPendingOrderItemsError();
    const lines = toLines(input.lines);
    return new WhatsappPendingOrder(randomUUID(), {
      conversationId: input.conversationId,
      customerPhone: input.customerPhone,
      customerName: input.customerName ?? null,
      orderType: input.orderType,
      branchId: input.branchId,
      addressDetails: input.addressDetails ?? null,
      lines,
      total: sumLines(lines),
      status: "PENDING",
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      confirmedOrderId: null,
      createdAt: new Date(),
    });
  }

  static startDraft(input: { conversationId: string; customerPhone: string; customerName?: string | null }): WhatsappPendingOrder {
    return new WhatsappPendingOrder(randomUUID(), {
      conversationId: input.conversationId,
      customerPhone: input.customerPhone,
      customerName: input.customerName ?? null,
      orderType: "delivery",
      branchId: null,
      addressDetails: null,
      lines: [],
      total: 0,
      status: "DRAFT",
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

  // كل حقل undefined بيفضل زي ما هو - lines لو اتبعتت بتستبدل القايمة كلها (البوت بيبعت القايمة الكاملة)
  updateDraft(input: {
    orderType?: string;
    branchId?: string | null;
    customerName?: string | null;
    addressDetails?: string | null;
    lines?: PendingOrderLineInput[];
  }): void {
    if (this.props.status !== "DRAFT") throw new WhatsappPendingOrderNotDraftError();
    if (input.orderType !== undefined) this.props.orderType = input.orderType;
    if (input.branchId !== undefined) this.props.branchId = input.branchId;
    if (input.customerName !== undefined && input.customerName !== null) this.props.customerName = input.customerName;
    if (input.addressDetails !== undefined && input.addressDetails !== null) this.props.addressDetails = input.addressDetails;
    if (input.lines !== undefined) {
      this.props.lines = toLines(input.lines);
      this.props.total = sumLines(this.props.lines);
    }
  }

  missingForSubmission(): string[] {
    const missing: string[] = [];
    if (this.props.lines.length === 0) missing.push("الأصناف");
    if (!this.props.customerName) missing.push("اسم العميل");
    if (!this.props.branchId) missing.push("الفرع");
    if (this.props.orderType === "delivery" && !this.props.addressDetails) missing.push("عنوان التوصيل");
    return missing;
  }

  submit(): void {
    if (this.props.status !== "DRAFT") throw new WhatsappPendingOrderNotDraftError();
    const missing = this.missingForSubmission();
    if (missing.length > 0) throw new IncompletePendingOrderDraftError(missing);
    this.props.status = "PENDING";
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
  get branchId(): string | null { return this.props.branchId; }
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
