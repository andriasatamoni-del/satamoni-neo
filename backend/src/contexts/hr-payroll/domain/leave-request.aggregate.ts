import { randomUUID } from "node:crypto";
import { InvalidLeaveDateRangeError, LeaveRequestNotPendingError } from "./errors";

export const LEAVE_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export interface LeaveRequestProps {
  employeeId: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string | null;
  status: LeaveRequestStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
}

// LeaveRequest - نفس مفهوم employee_leave_requests في الريبو القديم، بس من غير التحويل لسجل "رسمي"
// منفصل (employee_leaves) بعد الاعتماد - مفيش حاجة في neo بتستهلك سجل الإجازات ده (لا حساب راتب من
// الحضور ولا تقرير حضور يومي)، فمجرد approve() بيكفي (نفس فلسفة تبسيط PayrollRun - راجع تعليقاتها)
export class LeaveRequest {
  private constructor(
    public readonly id: string,
    private props: LeaveRequestProps
  ) {}

  static register(input: { employeeId: string; leaveType: string; startDate: Date; endDate: Date; reason?: string | null }): LeaveRequest {
    if (input.endDate.getTime() < input.startDate.getTime()) throw new InvalidLeaveDateRangeError();
    const days = Math.round((input.endDate.getTime() - input.startDate.getTime()) / 86400000) + 1;

    return new LeaveRequest(randomUUID(), {
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      reason: input.reason ?? null,
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: LeaveRequestProps): LeaveRequest {
    return new LeaveRequest(id, props);
  }

  cancel(): void {
    if (this.props.status !== "PENDING") throw new LeaveRequestNotPendingError();
    this.props.status = "CANCELLED";
  }

  approve(input: { reviewedBy: string | null; notes?: string | null }): void {
    if (this.props.status !== "PENDING") throw new LeaveRequestNotPendingError();
    this.props.status = "APPROVED";
    this.props.reviewedBy = input.reviewedBy;
    this.props.reviewedAt = new Date();
    this.props.reviewNotes = input.notes ?? null;
  }

  reject(input: { reviewedBy: string | null; notes?: string | null }): void {
    if (this.props.status !== "PENDING") throw new LeaveRequestNotPendingError();
    this.props.status = "REJECTED";
    this.props.reviewedBy = input.reviewedBy;
    this.props.reviewedAt = new Date();
    this.props.reviewNotes = input.notes ?? null;
  }

  get employeeId(): string { return this.props.employeeId; }
  get leaveType(): string { return this.props.leaveType; }
  get startDate(): Date { return this.props.startDate; }
  get endDate(): Date { return this.props.endDate; }
  get days(): number { return this.props.days; }
  get reason(): string | null { return this.props.reason; }
  get status(): LeaveRequestStatus { return this.props.status; }
  get reviewedBy(): string | null { return this.props.reviewedBy; }
  get reviewedAt(): Date | null { return this.props.reviewedAt; }
  get reviewNotes(): string | null { return this.props.reviewNotes; }
  get createdAt(): Date { return this.props.createdAt; }
}
