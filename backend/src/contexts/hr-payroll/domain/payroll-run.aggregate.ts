import { randomUUID } from "node:crypto";
import { PayrollRunNotDraftError, PayrollRunNotApprovedError, UnknownMonthError } from "./errors";

export const PAYROLL_RUN_STATUSES = ["DRAFT", "APPROVED", "CANCELLED"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export interface PayrollRunEmployeeLine {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string | null;
  grossPay: number;
  advances: number;
  penalties: number;
  bonuses: number;
  netPay: number;
}

export interface PayrollRunProps {
  year: number;
  month: number;
  status: PayrollRunStatus;
  employees: PayrollRunEmployeeLine[];
  totalNetPay: number;
  createdBy: string | null;
  createdAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  legacyPayrollRunId: number | null;
}

// PayrollRun - نفس مفهوم payroll_runs+payroll_run_employees في الريبو القديم: قائمة رواتب شهرية DRAFT
// قابلة للتعديل/الحذف، بعد الاعتماد (APPROVED) بتتقفل تمامًا (نفس فلسفة JournalEntry POSTED بالحرف -
// تصحيح لازم قائمة جديدة، مش تعديل مباشر)، وبعد كده ممكن تتلغي (CANCELLED) لو غلط فيها. سطور
// gross_pay/advances/penalties/bonuses جاهزة (already-computed) - محرك حساب صافي الراتب من الحضور
// مؤجّل بالكامل (راجع تعليق migration 012). netPay/totalNetPay محسوبة هنا دايمًا (مش بيتوثق فيها
// مدخلات الطالب) - نفس فلسفة Order.total.
export class PayrollRun {
  private constructor(
    public readonly id: string,
    private props: PayrollRunProps
  ) {}

  static register(input: {
    year: number;
    month: number;
    employees: { employeeId: string; employeeName: string; branchId?: string | null; grossPay: number; advances?: number; penalties?: number; bonuses?: number }[];
    createdBy?: string | null;
    legacyPayrollRunId?: number | null;
  }): PayrollRun {
    if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) throw new UnknownMonthError(input.month);

    const employees: PayrollRunEmployeeLine[] = input.employees.map((e) => {
      const advances = e.advances ?? 0;
      const penalties = e.penalties ?? 0;
      const bonuses = e.bonuses ?? 0;
      return {
        id: randomUUID(),
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        branchId: e.branchId ?? null,
        grossPay: e.grossPay,
        advances,
        penalties,
        bonuses,
        netPay: e.grossPay - advances - penalties + bonuses,
      };
    });
    const totalNetPay = employees.reduce((sum, e) => sum + e.netPay, 0);

    return new PayrollRun(randomUUID(), {
      year: input.year,
      month: input.month,
      status: "DRAFT",
      employees,
      totalNetPay,
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
      approvedBy: null,
      approvedAt: null,
      cancelledBy: null,
      cancelledAt: null,
      cancellationReason: null,
      legacyPayrollRunId: input.legacyPayrollRunId ?? null,
    });
  }

  static reconstitute(id: string, props: PayrollRunProps): PayrollRun {
    return new PayrollRun(id, props);
  }

  approve(approvedBy: string | null): void {
    if (this.props.status !== "DRAFT") throw new PayrollRunNotDraftError();
    this.props.status = "APPROVED";
    this.props.approvedBy = approvedBy;
    this.props.approvedAt = new Date();
  }

  cancel(input: { cancelledBy?: string | null; reason?: string | null }): void {
    if (this.props.status !== "APPROVED") throw new PayrollRunNotApprovedError();
    this.props.status = "CANCELLED";
    this.props.cancelledBy = input.cancelledBy ?? null;
    this.props.cancelledAt = new Date();
    this.props.cancellationReason = input.reason ?? null;
  }

  // بيتنفّذ قبل حذف قائمة DRAFT من الـrepository - نفس القاعدة اللي التريجر بيفرضها على مستوى القاعدة
  assertDraft(): void {
    if (this.props.status !== "DRAFT") throw new PayrollRunNotDraftError();
  }

  get year(): number { return this.props.year; }
  get month(): number { return this.props.month; }
  get status(): PayrollRunStatus { return this.props.status; }
  get employees(): readonly PayrollRunEmployeeLine[] { return this.props.employees; }
  get totalNetPay(): number { return this.props.totalNetPay; }
  get createdBy(): string | null { return this.props.createdBy; }
  get createdAt(): Date { return this.props.createdAt; }
  get approvedBy(): string | null { return this.props.approvedBy; }
  get approvedAt(): Date | null { return this.props.approvedAt; }
  get cancelledBy(): string | null { return this.props.cancelledBy; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get cancellationReason(): string | null { return this.props.cancellationReason; }
  get legacyPayrollRunId(): number | null { return this.props.legacyPayrollRunId; }
}
