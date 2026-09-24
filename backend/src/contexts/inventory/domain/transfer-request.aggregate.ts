import { randomUUID } from "node:crypto";
import {
  EmptyTransferRequestError,
  InvalidTransferRequestLineError,
  SameBranchTransferError,
  TransferRequestNotDecidableError,
  TransferRequestNotCancellableError,
  TransferRequestNotDispatchableError,
  TransferRequestNotReceivableError,
  TransferRequestCancellationReasonRequiredError,
  TransferRequestRejectionReasonRequiredError,
} from "./errors";

export const TRANSFER_REQUEST_STATUSES = ["SUBMITTED", "APPROVED", "REJECTED", "DISPATCHED", "RECEIVED", "CANCELLED"] as const;
export type TransferRequestStatus = (typeof TRANSFER_REQUEST_STATUSES)[number];

const CANCELLABLE_STATUSES: TransferRequestStatus[] = ["SUBMITTED", "APPROVED"];

export interface TransferRequestLine {
  id: string;
  inventoryItemId: string;
  requestedQuantity: number;
  approvedQuantity: number | null;
  dispatchedQuantity: number | null;
  receivedQuantity: number | null;
  dispatchMovementId: string | null;
  receiveMovementId: string | null;
}

export interface TransferRequestProps {
  fromBranchId: string;
  toBranchId: string;
  requestedBy: string | null;
  requiredDate: Date | null;
  notes: string | null;
  lines: TransferRequestLine[];
  status: TransferRequestStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  dispatchedBy: string | null;
  dispatchedAt: Date | null;
  receivedBy: string | null;
  receivedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
}

function assertLines(lines: { inventoryItemId: string; requestedQuantity: number }[]): void {
  if (lines.length === 0) throw new EmptyTransferRequestError();
  for (const l of lines) {
    if (!l.inventoryItemId || !(l.requestedQuantity > 0)) throw new InvalidTransferRequestLineError();
  }
}

// TransferRequest - نفس مفهوم kitchen_orders في الريبو القديم بس معمّم لأي فرع لأي فرع (مش السنتر كيتشن
// بس) - طلب فرع (toBranchId) لأصناف من فرع تاني (fromBranchId، غالبًا السنتر كيتشن). الأثر الحقيقي على
// المخزون (TRANSFER_OUT/TRANSFER_IN) بيحصل في الـhandler وقت dispatch/receive، مش هنا - الأجريجيت هنا بس
// بيتحكّم في state machine الطلب نفسه (نفس فلسفة ConversionOrder.start/complete اللي بتاخد movementId
// جاهز من الـhandler، مش بتنشئه). الاستلام ممكن يكون جزئي (receivedQuantity < dispatchedQuantity) عشان
// فرق الفقد أثناء النقل يفضل واضح، مش متجاهل - رقم receivedQuantity هو اللي بيتحسب عليه TRANSFER_IN
export class TransferRequest {
  private constructor(
    public readonly id: string,
    private props: TransferRequestProps
  ) {}

  static register(input: {
    fromBranchId: string;
    toBranchId: string;
    requestedBy?: string | null;
    requiredDate?: Date | null;
    notes?: string | null;
    lines: { inventoryItemId: string; requestedQuantity: number }[];
  }): TransferRequest {
    if (input.fromBranchId === input.toBranchId) throw new SameBranchTransferError();
    assertLines(input.lines);

    return new TransferRequest(randomUUID(), {
      fromBranchId: input.fromBranchId,
      toBranchId: input.toBranchId,
      requestedBy: input.requestedBy ?? null,
      requiredDate: input.requiredDate ?? null,
      notes: input.notes ?? null,
      lines: input.lines.map((l) => ({
        id: randomUUID(),
        inventoryItemId: l.inventoryItemId,
        requestedQuantity: l.requestedQuantity,
        approvedQuantity: null,
        dispatchedQuantity: null,
        receivedQuantity: null,
        dispatchMovementId: null,
        receiveMovementId: null,
      })),
      status: "SUBMITTED",
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      dispatchedBy: null,
      dispatchedAt: null,
      receivedBy: null,
      receivedAt: null,
      cancelledBy: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: TransferRequestProps): TransferRequest {
    return new TransferRequest(id, props);
  }

  // اعتماد الطلب - ممكن تعديل الكمية المعتمدة لكل بند (أقل من المطلوبة لو المتاح عند فرع المصدر مش كفاية)،
  // نفس فلسفة quantity_to_prepare في kitchen_order_items بالريبو القديم. لو مفيش تعديل محدد، بتتساوى
  // بالمطلوبة تلقائيًا
  approve(input: { approvedBy: string | null; approvedQuantities?: Record<string, number> }): void {
    if (this.props.status !== "SUBMITTED") throw new TransferRequestNotDecidableError();
    for (const line of this.props.lines) {
      const override = input.approvedQuantities?.[line.id];
      line.approvedQuantity = override !== undefined && override >= 0 ? override : line.requestedQuantity;
    }
    this.props.status = "APPROVED";
    this.props.approvedBy = input.approvedBy;
    this.props.approvedAt = new Date();
  }

  reject(input: { rejectedBy: string | null; reason: string | null }): void {
    if (this.props.status !== "SUBMITTED") throw new TransferRequestNotDecidableError();
    if (!input.reason || !input.reason.trim()) throw new TransferRequestRejectionReasonRequiredError();
    this.props.status = "REJECTED";
    this.props.rejectedBy = input.rejectedBy;
    this.props.rejectionReason = input.reason;
  }

  // بيتنادى بعد ما الـhandler يسجّل حركات TRANSFER_OUT حقيقية عند fromBranchId لكل بند (movementId جاهز)
  dispatch(input: { dispatchedBy: string | null; movements: { lineId: string; quantity: number; movementId: string }[] }): void {
    if (this.props.status !== "APPROVED") throw new TransferRequestNotDispatchableError();
    for (const m of input.movements) {
      const line = this.props.lines.find((l) => l.id === m.lineId);
      if (!line) continue;
      line.dispatchedQuantity = m.quantity;
      line.dispatchMovementId = m.movementId;
    }
    this.props.status = "DISPATCHED";
    this.props.dispatchedBy = input.dispatchedBy;
    this.props.dispatchedAt = new Date();
  }

  // بيتنادى بعد ما الـhandler يسجّل حركات TRANSFER_IN حقيقية عند toBranchId - استلام جزئي مسموح (فرق
  // الفقد أثناء النقل بيفضل واضح في الفرق بين dispatchedQuantity وreceivedQuantity، مش متجاهل)
  receive(input: { receivedBy: string | null; movements: { lineId: string; quantity: number; movementId: string }[] }): void {
    if (this.props.status !== "DISPATCHED") throw new TransferRequestNotReceivableError();
    for (const m of input.movements) {
      const line = this.props.lines.find((l) => l.id === m.lineId);
      if (!line) continue;
      line.receivedQuantity = m.quantity;
      line.receiveMovementId = m.movementId;
    }
    this.props.status = "RECEIVED";
    this.props.receivedBy = input.receivedBy;
    this.props.receivedAt = new Date();
  }

  cancel(input: { cancelledBy: string | null; reason: string }): void {
    if (!CANCELLABLE_STATUSES.includes(this.props.status)) throw new TransferRequestNotCancellableError();
    if (!input.reason || !input.reason.trim()) throw new TransferRequestCancellationReasonRequiredError();
    this.props.status = "CANCELLED";
    this.props.cancelledBy = input.cancelledBy;
    this.props.cancelledAt = new Date();
    this.props.cancellationReason = input.reason;
  }

  get fromBranchId(): string { return this.props.fromBranchId; }
  get toBranchId(): string { return this.props.toBranchId; }
  get requestedBy(): string | null { return this.props.requestedBy; }
  get requiredDate(): Date | null { return this.props.requiredDate; }
  get notes(): string | null { return this.props.notes; }
  get lines(): readonly TransferRequestLine[] { return this.props.lines; }
  get status(): TransferRequestStatus { return this.props.status; }
  get approvedBy(): string | null { return this.props.approvedBy; }
  get approvedAt(): Date | null { return this.props.approvedAt; }
  get rejectedBy(): string | null { return this.props.rejectedBy; }
  get rejectionReason(): string | null { return this.props.rejectionReason; }
  get dispatchedBy(): string | null { return this.props.dispatchedBy; }
  get dispatchedAt(): Date | null { return this.props.dispatchedAt; }
  get receivedBy(): string | null { return this.props.receivedBy; }
  get receivedAt(): Date | null { return this.props.receivedAt; }
  get cancelledBy(): string | null { return this.props.cancelledBy; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get cancellationReason(): string | null { return this.props.cancellationReason; }
  get createdAt(): Date { return this.props.createdAt; }
}
