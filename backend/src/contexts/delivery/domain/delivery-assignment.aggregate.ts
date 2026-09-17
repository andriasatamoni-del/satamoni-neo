import { randomUUID } from "node:crypto";
import {
  DeliveryAssignmentAlreadyFinalizedError,
  DeliveryAssignmentAlreadySettledError,
  UnknownDispatchStatusError,
} from "./errors";

// نفس قيم dispatch_status في الريبو القديم بالظبط (عمود على orders هناك، هنا aggregate مستقل بيشاور
// على الطلب بـid بس - راجع تعليق docs/ARCHITECTURE-REFERENCE.md، bounded context #7)
export const DISPATCH_STATUSES = ["UNASSIGNED", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED"] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

const FINAL_STATUSES: readonly DispatchStatus[] = ["DELIVERED", "FAILED", "RETURNED"];

export interface DeliveryAssignmentProps {
  orderId: string;
  driverId: string;
  branchId: string;
  status: DispatchStatus;
  assignedBy: string | null;
  assignedAt: Date;
  deliveredAt: Date | null;
  failureReason: string | null;
  collectedAmount: number | null;
  settlementId: string | null;
}

// DeliveryAssignment - نفس مفهوم dispatch_status/driver_id/delivered_at في الريبو القديم (كانوا أعمدة
// على orders نفسها) بس هنا aggregate مستقل يشاور على الطلب والسائق بـid بس - يفصل "مين بيوصّل الطلب
// وحالة التوصيل" (concern بتاع Delivery & Dispatch) عن "الطلب نفسه" (Orders context). مؤجّل: تسوية كاش
// السائق (driver_settlements) وحضور/بونص السائق (driver_shifts) - معتمدين على Payroll اللي لسه مش
// موجود (Phase 4).
export class DeliveryAssignment {
  private constructor(
    public readonly id: string,
    private props: DeliveryAssignmentProps
  ) {}

  static register(input: { orderId: string; driverId: string; branchId: string; assignedBy?: string | null }): DeliveryAssignment {
    return new DeliveryAssignment(randomUUID(), {
      orderId: input.orderId,
      driverId: input.driverId,
      branchId: input.branchId,
      status: "ASSIGNED",
      assignedBy: input.assignedBy ?? null,
      assignedAt: new Date(),
      deliveredAt: null,
      failureReason: null,
      collectedAmount: null,
      settlementId: null,
    });
  }

  static reconstitute(id: string, props: DeliveryAssignmentProps): DeliveryAssignment {
    return new DeliveryAssignment(id, props);
  }

  updateStatus(status: string, input?: { failureReason?: string | null; collectedAmount?: number | null }): void {
    if (!DISPATCH_STATUSES.includes(status as DispatchStatus)) throw new UnknownDispatchStatusError(status);
    if (FINAL_STATUSES.includes(this.props.status)) throw new DeliveryAssignmentAlreadyFinalizedError();

    this.props.status = status as DispatchStatus;
    if (status === "DELIVERED") {
      this.props.deliveredAt = new Date();
      this.props.collectedAmount = input?.collectedAmount ?? null;
    }
    if (status === "FAILED") this.props.failureReason = input?.failureReason ?? null;
  }

  // بيتنادى وقت تسوية كاش السائق (DriverSettlement.register) عشان الطلب ده منيتحسبش مرتين في تسوية
  // تانية - نفس فلسفة supplier_invoices.goods_receipt_id بس بالعكس (هنا نعلّم الطلب إنه اتحسب، مش
  // العكس). لازم يكون DELIVERED الأول (نفس شرط الريبو القديم: dispatch_status='DELIVERED')
  assignToSettlement(settlementId: string): void {
    if (this.props.status !== "DELIVERED") throw new DeliveryAssignmentAlreadyFinalizedError();
    if (this.props.settlementId) throw new DeliveryAssignmentAlreadySettledError();
    this.props.settlementId = settlementId;
  }

  get orderId(): string { return this.props.orderId; }
  get driverId(): string { return this.props.driverId; }
  get branchId(): string { return this.props.branchId; }
  get status(): DispatchStatus { return this.props.status; }
  get assignedBy(): string | null { return this.props.assignedBy; }
  get assignedAt(): Date { return this.props.assignedAt; }
  get deliveredAt(): Date | null { return this.props.deliveredAt; }
  get failureReason(): string | null { return this.props.failureReason; }
  get collectedAmount(): number | null { return this.props.collectedAmount; }
  get settlementId(): string | null { return this.props.settlementId; }
}
