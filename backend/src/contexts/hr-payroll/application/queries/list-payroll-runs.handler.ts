import { Inject, Injectable } from "@nestjs/common";
import { PayrollRun } from "../../domain/payroll-run.aggregate";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";

@Injectable()
export class ListPayrollRunsHandler {
  constructor(@Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort) {}

  async execute(filter?: { status?: string }): Promise<PayrollRun[]> {
    return this.payrollRuns.list(filter);
  }
}
