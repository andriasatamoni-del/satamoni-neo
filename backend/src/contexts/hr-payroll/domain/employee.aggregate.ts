import { randomUUID } from "node:crypto";
import { EmployeeNameRequiredError, UnknownWageTypeError, UnknownEmployeeStatusError } from "./errors";

export const WAGE_TYPES = ["fixed_monthly", "hourly"] as const;
export type WageType = (typeof WAGE_TYPES)[number];

export const EMPLOYEE_STATUSES = ["active", "suspended", "terminated"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface EmployeeProps {
  userId: string | null;
  name: string;
  departmentId: string | null;
  positionId: string | null;
  hireDate: Date | null;
  baseSalary: number;
  wageType: WageType;
  hourlyRate: number | null;
  workingDaysPerMonth: number | null;
  shift: string | null;
  restrictedBranchId: string | null;
  employeeCode: string | null;
  phone: string | null;
  notes: string | null;
  status: EmployeeStatus;
  terminationDate: Date | null;
  terminationReason: string | null;
  legacyEmployeeId: number | null;
  createdAt: Date;
}

// Employee - الكيان الوحيد للموارد البشرية (نفس مفهوم employees في الريبو القديم)، userId اختياري
// عمدًا - مش كل موظف له حساب دخول في Identity & Access (نفس فلسفة الريبو القديم بالحرف). محرك حساب
// صافي الراتب من الحضور (تأخير/أوفر تايم/استثناءات) مؤجّل بالكامل - راجع تعليق migration
// 012_create_hr_payroll_tables.ts - القيم هنا (base_salary/wage_type) بيانات مرجعية بس لسطور
// PayrollRun اللي بتتسجل يدوي.
export class Employee {
  private constructor(
    public readonly id: string,
    private props: EmployeeProps
  ) {}

  static register(input: {
    userId?: string | null;
    name: string;
    departmentId?: string | null;
    positionId?: string | null;
    hireDate?: Date | null;
    baseSalary?: number;
    wageType?: string;
    hourlyRate?: number | null;
    workingDaysPerMonth?: number | null;
    shift?: string | null;
    restrictedBranchId?: string | null;
    employeeCode?: string | null;
    phone?: string | null;
    notes?: string | null;
    legacyEmployeeId?: number | null;
  }): Employee {
    const name = input.name.trim();
    if (!name) throw new EmployeeNameRequiredError();
    const wageType = input.wageType ?? "fixed_monthly";
    if (!WAGE_TYPES.includes(wageType as WageType)) throw new UnknownWageTypeError(wageType);

    return new Employee(randomUUID(), {
      userId: input.userId ?? null,
      name,
      departmentId: input.departmentId ?? null,
      positionId: input.positionId ?? null,
      hireDate: input.hireDate ?? null,
      baseSalary: input.baseSalary ?? 0,
      wageType: wageType as WageType,
      hourlyRate: input.hourlyRate ?? null,
      workingDaysPerMonth: input.workingDaysPerMonth ?? null,
      shift: input.shift ?? null,
      restrictedBranchId: input.restrictedBranchId ?? null,
      employeeCode: input.employeeCode ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      status: "active",
      terminationDate: null,
      terminationReason: null,
      legacyEmployeeId: input.legacyEmployeeId ?? null,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: EmployeeProps): Employee {
    return new Employee(id, props);
  }

  // بيتنفّذ وقت إعادة استيراد بيانات الموظفين (idempotent) - مايلمسش الحالة (status) نفسها، دي بتتغيّر
  // بس عن طريق suspend()/activate()/terminate()
  updateDetails(input: {
    name: string;
    departmentId?: string | null;
    positionId?: string | null;
    hireDate?: Date | null;
    baseSalary?: number;
    wageType?: string;
    hourlyRate?: number | null;
    workingDaysPerMonth?: number | null;
    shift?: string | null;
    restrictedBranchId?: string | null;
    employeeCode?: string | null;
    phone?: string | null;
    notes?: string | null;
  }): void {
    const name = input.name.trim();
    if (!name) throw new EmployeeNameRequiredError();
    if (input.wageType && !WAGE_TYPES.includes(input.wageType as WageType)) throw new UnknownWageTypeError(input.wageType);

    this.props.name = name;
    if (input.departmentId !== undefined) this.props.departmentId = input.departmentId;
    if (input.positionId !== undefined) this.props.positionId = input.positionId;
    if (input.hireDate !== undefined) this.props.hireDate = input.hireDate;
    if (input.baseSalary !== undefined) this.props.baseSalary = input.baseSalary;
    if (input.wageType) this.props.wageType = input.wageType as WageType;
    if (input.hourlyRate !== undefined) this.props.hourlyRate = input.hourlyRate;
    if (input.workingDaysPerMonth !== undefined) this.props.workingDaysPerMonth = input.workingDaysPerMonth;
    if (input.shift !== undefined) this.props.shift = input.shift;
    if (input.restrictedBranchId !== undefined) this.props.restrictedBranchId = input.restrictedBranchId;
    if (input.employeeCode !== undefined) this.props.employeeCode = input.employeeCode;
    if (input.phone !== undefined) this.props.phone = input.phone;
    if (input.notes !== undefined) this.props.notes = input.notes;
  }

  setStatus(status: string): void {
    if (!EMPLOYEE_STATUSES.includes(status as EmployeeStatus)) throw new UnknownEmployeeStatusError(status);
    this.props.status = status as EmployeeStatus;
    if (status !== "terminated") {
      this.props.terminationDate = null;
      this.props.terminationReason = null;
    }
  }

  terminate(input: { date: Date; reason?: string | null }): void {
    this.props.status = "terminated";
    this.props.terminationDate = input.date;
    this.props.terminationReason = input.reason ?? null;
  }

  get userId(): string | null { return this.props.userId; }
  get name(): string { return this.props.name; }
  get departmentId(): string | null { return this.props.departmentId; }
  get positionId(): string | null { return this.props.positionId; }
  get hireDate(): Date | null { return this.props.hireDate; }
  get baseSalary(): number { return this.props.baseSalary; }
  get wageType(): WageType { return this.props.wageType; }
  get hourlyRate(): number | null { return this.props.hourlyRate; }
  get workingDaysPerMonth(): number | null { return this.props.workingDaysPerMonth; }
  get shift(): string | null { return this.props.shift; }
  get restrictedBranchId(): string | null { return this.props.restrictedBranchId; }
  get employeeCode(): string | null { return this.props.employeeCode; }
  get phone(): string | null { return this.props.phone; }
  get notes(): string | null { return this.props.notes; }
  get status(): EmployeeStatus { return this.props.status; }
  get terminationDate(): Date | null { return this.props.terminationDate; }
  get terminationReason(): string | null { return this.props.terminationReason; }
  get legacyEmployeeId(): number | null { return this.props.legacyEmployeeId; }
  get createdAt(): Date { return this.props.createdAt; }
}
