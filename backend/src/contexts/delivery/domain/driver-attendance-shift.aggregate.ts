import { randomUUID } from "node:crypto";
import { DriverAttendanceShiftNotActiveError } from "./errors";

export const DRIVER_ATTENDANCE_SHIFT_STATUSES = ["ACTIVE", "CLOSED"] as const;
export type DriverAttendanceShiftStatus = (typeof DRIVER_ATTENDANCE_SHIFT_STATUSES)[number];

export interface DriverAttendanceShiftProps {
  driverId: string;
  branchId: string;
  status: DriverAttendanceShiftStatus;
  checkedInBy: string | null;
  checkedInAt: Date;
  checkedOutBy: string | null;
  checkedOutAt: Date | null;
  hourlyRate: number;
  hoursWorked: number | null;
  wageAmount: number | null;
  bonusTotal: number | null;
  totalPay: number | null;
  notes: string | null;
}

// DriverAttendanceShift - نفس مفهوم driver_shifts في الريبو القديم بالظبط: حضور/أجر بالساعة للسائقين
// (عمالة خارجية)، مستقل تمامًا عن DriverSettlement (تسوية كاش التوصيل) - قرار تصميم متعمّد في الريبو
// القديم موثّق في docs/DRIVER-OPERATIONS.md، السائق ممكن يدخل/يخرج شيفت حضور كذا مرة في اليوم بينما
// تسويات الكاش بتحصل بمعدل مختلف تمامًا. مفيش مفهوم فرق/مراجعة هنا زي CashierShift - قفل مباشر وبس.
// hourly_rate بتتجمّد وقت الدخول (نفس فلسفة الريبو القديم بالظبط) - قيمة ثابتة هنا (مفيش جدول إعدادات
// لسه)، راجع HOURLY_RATE_EGP في check-in-driver.handler.ts
export class DriverAttendanceShift {
  private constructor(
    public readonly id: string,
    private props: DriverAttendanceShiftProps
  ) {}

  static register(input: {
    driverId: string;
    branchId: string;
    checkedInBy?: string | null;
    hourlyRate: number;
  }): DriverAttendanceShift {
    return new DriverAttendanceShift(randomUUID(), {
      driverId: input.driverId,
      branchId: input.branchId,
      status: "ACTIVE",
      checkedInBy: input.checkedInBy ?? null,
      checkedInAt: new Date(),
      checkedOutBy: null,
      checkedOutAt: null,
      hourlyRate: input.hourlyRate,
      hoursWorked: null,
      wageAmount: null,
      bonusTotal: null,
      totalPay: null,
      notes: null,
    });
  }

  static reconstitute(id: string, props: DriverAttendanceShiftProps): DriverAttendanceShift {
    return new DriverAttendanceShift(id, props);
  }

  checkOut(input: { checkedOutBy: string | null; bonusTotal: number; notes?: string | null }): void {
    if (this.props.status !== "ACTIVE") throw new DriverAttendanceShiftNotActiveError();

    const now = new Date();
    const hoursWorked = Math.round(((now.getTime() - this.props.checkedInAt.getTime()) / 3600000) * 100) / 100;
    const wageAmount = Math.round(hoursWorked * this.props.hourlyRate * 100) / 100;

    this.props.status = "CLOSED";
    this.props.checkedOutBy = input.checkedOutBy;
    this.props.checkedOutAt = now;
    this.props.hoursWorked = hoursWorked;
    this.props.wageAmount = wageAmount;
    this.props.bonusTotal = input.bonusTotal;
    this.props.totalPay = Math.round((wageAmount + input.bonusTotal) * 100) / 100;
    this.props.notes = input.notes ?? null;
  }

  get driverId(): string { return this.props.driverId; }
  get branchId(): string { return this.props.branchId; }
  get status(): DriverAttendanceShiftStatus { return this.props.status; }
  get checkedInBy(): string | null { return this.props.checkedInBy; }
  get checkedInAt(): Date { return this.props.checkedInAt; }
  get checkedOutBy(): string | null { return this.props.checkedOutBy; }
  get checkedOutAt(): Date | null { return this.props.checkedOutAt; }
  get hourlyRate(): number { return this.props.hourlyRate; }
  get hoursWorked(): number | null { return this.props.hoursWorked; }
  get wageAmount(): number | null { return this.props.wageAmount; }
  get bonusTotal(): number | null { return this.props.bonusTotal; }
  get totalPay(): number | null { return this.props.totalPay; }
  get notes(): string | null { return this.props.notes; }
}
