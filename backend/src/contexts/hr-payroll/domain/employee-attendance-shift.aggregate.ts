import { randomUUID } from "node:crypto";
import { EmployeeAttendanceShiftNotActiveError } from "./errors";

export const EMPLOYEE_ATTENDANCE_SHIFT_STATUSES = ["ACTIVE", "CLOSED"] as const;
export type EmployeeAttendanceShiftStatus = (typeof EMPLOYEE_ATTENDANCE_SHIFT_STATUSES)[number];

export interface EmployeeAttendanceShiftProps {
  employeeId: string;
  branchId: string;
  status: EmployeeAttendanceShiftStatus;
  checkedInAt: Date;
  checkedOutAt: Date | null;
  hoursWorked: number | null;
  notes: string | null;
}

// EmployeeAttendanceShift - سجل حضور/انصراف بسيط بيسجّله الموظف نفسه من بوابة الخدمة الذاتية، معلوماتي
// بحت (للعرض في تاريخ الحضور بس) - عكس DriverAttendanceShift، مفيش أجر بالساعة/بونص هنا لأن PayrollRun
// مدخلاته يدوية بالكامل ومفيش محرك بيحسب صافي الراتب من الحضور (مؤجّل بالكامل - راجع تعليق migration
// 012_create_hr_payroll_tables.ts). مفيش مزامنة بصمة (ZK) هنا برضو - الموظف بيدخل/يخرج بنفسه بس
export class EmployeeAttendanceShift {
  private constructor(
    public readonly id: string,
    private props: EmployeeAttendanceShiftProps
  ) {}

  static register(input: { employeeId: string; branchId: string }): EmployeeAttendanceShift {
    return new EmployeeAttendanceShift(randomUUID(), {
      employeeId: input.employeeId,
      branchId: input.branchId,
      status: "ACTIVE",
      checkedInAt: new Date(),
      checkedOutAt: null,
      hoursWorked: null,
      notes: null,
    });
  }

  static reconstitute(id: string, props: EmployeeAttendanceShiftProps): EmployeeAttendanceShift {
    return new EmployeeAttendanceShift(id, props);
  }

  checkOut(input?: { notes?: string | null }): void {
    if (this.props.status !== "ACTIVE") throw new EmployeeAttendanceShiftNotActiveError();

    const now = new Date();
    const hoursWorked = Math.round(((now.getTime() - this.props.checkedInAt.getTime()) / 3600000) * 100) / 100;

    this.props.status = "CLOSED";
    this.props.checkedOutAt = now;
    this.props.hoursWorked = hoursWorked;
    this.props.notes = input?.notes ?? null;
  }

  get employeeId(): string { return this.props.employeeId; }
  get branchId(): string { return this.props.branchId; }
  get status(): EmployeeAttendanceShiftStatus { return this.props.status; }
  get checkedInAt(): Date { return this.props.checkedInAt; }
  get checkedOutAt(): Date | null { return this.props.checkedOutAt; }
  get hoursWorked(): number | null { return this.props.hoursWorked; }
  get notes(): string | null { return this.props.notes; }
}
