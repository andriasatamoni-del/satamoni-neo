import { randomUUID } from "node:crypto";
import {
  EmptyPurchaseRequestError,
  InvalidPurchaseRequestLineError,
  PurchaseRequestNotEditableError,
  PurchaseRequestNotSubmittableError,
  PurchaseRequestNotDecidableError,
  PurchaseRequestRejectionReasonRequiredError,
  PurchaseRequestNotCancellableError,
  PurchaseRequestNotConvertibleError,
} from "./errors";

export const PURCHASE_REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CONVERTED_TO_PO",
  "CANCELLED",
] as const;
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];

const CANCELLABLE_STATUSES: PurchaseRequestStatus[] = ["DRAFT", "SUBMITTED", "APPROVED"];

export interface PurchaseRequestLine {
  id: string;
  inventoryItemId: string;
  requestedQuantity: number;
  unit: string | null;
  notes: string | null;
}

export interface PurchaseRequestProps {
  branchId: string;
  requestedBy: string | null;
  requiredDate: Date | null;
  reason: string | null;
  lines: PurchaseRequestLine[];
  status: PurchaseRequestStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  convertedToPurchaseOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function assertLines(lines: { inventoryItemId: string; requestedQuantity: number }[]): void {
  if (lines.length === 0) throw new EmptyPurchaseRequestError();
  for (const l of lines) {
    if (!l.inventoryItemId || !(l.requestedQuantity > 0)) throw new InvalidPurchaseRequestLineError();
  }
}

// PurchaseRequest - نفس مفهوم purchase_requests في الريبو القديم: طلب داخلي محض (مفيش أي أثر مخزون/
// محاسبة)، شغله الوحيد إنه يحجب إنشاء PurchaseOrder وراه اعتماد على مستوى الطلب كله (مش بند بند)، ومش
// عن طريق نظام الاعتماد العام (approval-engine) - state machine مستقلة زي الريبو القديم بالظبط
export class PurchaseRequest {
  private constructor(
    public readonly id: string,
    private props: PurchaseRequestProps
  ) {}

  static register(input: {
    branchId: string;
    requestedBy?: string | null;
    requiredDate?: Date | null;
    reason?: string | null;
    lines: { inventoryItemId: string; requestedQuantity: number; unit?: string | null; notes?: string | null }[];
  }): PurchaseRequest {
    assertLines(input.lines);
    const now = new Date();
    return new PurchaseRequest(randomUUID(), {
      branchId: input.branchId,
      requestedBy: input.requestedBy ?? null,
      requiredDate: input.requiredDate ?? null,
      reason: input.reason ?? null,
      lines: input.lines.map((l) => ({
        id: randomUUID(),
        inventoryItemId: l.inventoryItemId,
        requestedQuantity: l.requestedQuantity,
        unit: l.unit ?? null,
        notes: l.notes ?? null,
      })),
      status: "DRAFT",
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      cancelledBy: null,
      cancelledAt: null,
      convertedToPurchaseOrderId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(id: string, props: PurchaseRequestProps): PurchaseRequest {
    return new PurchaseRequest(id, props);
  }

  edit(input: {
    requiredDate?: Date | null;
    reason?: string | null;
    lines?: { inventoryItemId: string; requestedQuantity: number; unit?: string | null; notes?: string | null }[];
  }): void {
    if (this.props.status !== "DRAFT") throw new PurchaseRequestNotEditableError();
    if (input.lines) {
      assertLines(input.lines);
      this.props.lines = input.lines.map((l) => ({
        id: randomUUID(),
        inventoryItemId: l.inventoryItemId,
        requestedQuantity: l.requestedQuantity,
        unit: l.unit ?? null,
        notes: l.notes ?? null,
      }));
    }
    if (input.requiredDate !== undefined) this.props.requiredDate = input.requiredDate;
    if (input.reason !== undefined) this.props.reason = input.reason;
    this.props.updatedAt = new Date();
  }

  submit(): void {
    if (this.props.status !== "DRAFT") throw new PurchaseRequestNotSubmittableError();
    this.props.status = "SUBMITTED";
    this.props.updatedAt = new Date();
  }

  approve(input: { approvedBy: string | null }): void {
    if (this.props.status !== "SUBMITTED") throw new PurchaseRequestNotDecidableError();
    this.props.status = "APPROVED";
    this.props.approvedBy = input.approvedBy;
    this.props.approvedAt = new Date();
    this.props.updatedAt = new Date();
  }

  reject(input: { rejectedBy: string | null; reason: string | null }): void {
    if (this.props.status !== "SUBMITTED") throw new PurchaseRequestNotDecidableError();
    if (!input.reason || !input.reason.trim()) throw new PurchaseRequestRejectionReasonRequiredError();
    this.props.status = "REJECTED";
    this.props.rejectedBy = input.rejectedBy;
    this.props.rejectionReason = input.reason;
    this.props.updatedAt = new Date();
  }

  cancel(input: { cancelledBy: string | null }): void {
    if (!CANCELLABLE_STATUSES.includes(this.props.status)) throw new PurchaseRequestNotCancellableError();
    this.props.status = "CANCELLED";
    this.props.cancelledBy = input.cancelledBy;
    this.props.cancelledAt = new Date();
    this.props.updatedAt = new Date();
  }

  // بيتنادى بعد ما PurchaseOrder جديد يتنشئ من الطلب ده - لازم يكون معتمد الأول (نفس فلسفة الريبو
  // القديم: تحويل لأمر شراء بيحصل من أمر شراء APPROVED بس)
  markConvertedToPurchaseOrder(purchaseOrderId: string): void {
    if (this.props.status !== "APPROVED") throw new PurchaseRequestNotConvertibleError();
    this.props.status = "CONVERTED_TO_PO";
    this.props.convertedToPurchaseOrderId = purchaseOrderId;
    this.props.updatedAt = new Date();
  }

  get branchId(): string { return this.props.branchId; }
  get requestedBy(): string | null { return this.props.requestedBy; }
  get requiredDate(): Date | null { return this.props.requiredDate; }
  get reason(): string | null { return this.props.reason; }
  get lines(): readonly PurchaseRequestLine[] { return this.props.lines; }
  get status(): PurchaseRequestStatus { return this.props.status; }
  get approvedBy(): string | null { return this.props.approvedBy; }
  get approvedAt(): Date | null { return this.props.approvedAt; }
  get rejectedBy(): string | null { return this.props.rejectedBy; }
  get rejectionReason(): string | null { return this.props.rejectionReason; }
  get cancelledBy(): string | null { return this.props.cancelledBy; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get convertedToPurchaseOrderId(): string | null { return this.props.convertedToPurchaseOrderId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
