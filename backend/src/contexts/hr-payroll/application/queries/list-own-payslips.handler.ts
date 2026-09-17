import { Inject, Injectable } from "@nestjs/common";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import { EmployeeProfileNotLinkedError } from "../../domain/errors";

export interface OwnPayslip {
  payrollRunId: string;
  year: number;
  month: number;
  approvedAt: Date | null;
  grossPay: number;
  advances: number;
  penalties: number;
  bonuses: number;
  netPay: number;
}

// قسائم راتب من تشغيلات معتمدة (APPROVED) بس - نفس فلسفة الريبو القديم بالحرف: تشغيلة لسه DRAFT
// مالهاش معنى تتعرض للموظف قبل الاعتماد. مفيش paid_amount هنا (مفهوم دفعات جزئية للراتب مش موجود في
// neo أصلًا - راجع تعليق migration 012)
@Injectable()
export class ListOwnPayslipsHandler {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort,
    @Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort
  ) {}

  async execute(userId: string): Promise<OwnPayslip[]> {
    const employee = await this.employees.findByUserId(userId);
    if (!employee) throw new EmployeeProfileNotLinkedError();

    const runs = await this.payrollRuns.list({ status: "APPROVED" });
    const payslips: OwnPayslip[] = [];
    for (const run of runs) {
      const line = run.employees.find((e) => e.employeeId === employee.id);
      if (!line) continue;
      payslips.push({
        payrollRunId: run.id,
        year: run.year,
        month: run.month,
        approvedAt: run.approvedAt,
        grossPay: line.grossPay,
        advances: line.advances,
        penalties: line.penalties,
        bonuses: line.bonuses,
        netPay: line.netPay,
      });
    }
    payslips.sort((a, b) => b.year - a.year || b.month - a.month);
    return payslips;
  }
}
