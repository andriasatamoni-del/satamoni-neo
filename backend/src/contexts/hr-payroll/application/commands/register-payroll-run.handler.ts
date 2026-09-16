import { Inject, Injectable } from "@nestjs/common";
import { PayrollRun } from "../../domain/payroll-run.aggregate";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import { EMPLOYEE_REPOSITORY, type EmployeeRepositoryPort } from "../../domain/ports/employee-repository.port";
import { DuplicatePayrollPeriodError, EmployeeNotFoundError } from "../../domain/errors";

export interface RegisterPayrollRunCommand {
  year: number;
  month: number;
  employees: { employeeId: string; branchId?: string | null; grossPay: number; advances?: number; penalties?: number; bonuses?: number }[];
  createdBy?: string | null;
}

@Injectable()
export class RegisterPayrollRunHandler {
  constructor(
    @Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepositoryPort
  ) {}

  async execute(command: RegisterPayrollRunCommand): Promise<PayrollRun> {
    if (await this.payrollRuns.findActiveByPeriod(command.year, command.month)) {
      throw new DuplicatePayrollPeriodError(command.year, command.month);
    }

    const lines = [];
    for (const line of command.employees) {
      const employee = await this.employees.findById(line.employeeId);
      if (!employee) throw new EmployeeNotFoundError();
      lines.push({ ...line, employeeName: employee.name });
    }

    const run = PayrollRun.register({ year: command.year, month: command.month, employees: lines, createdBy: command.createdBy });
    await this.payrollRuns.save(run);
    return run;
  }
}
