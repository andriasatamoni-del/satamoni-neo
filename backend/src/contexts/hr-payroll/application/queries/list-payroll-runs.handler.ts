import { Inject, Injectable } from "@nestjs/common";
import { PayrollRun } from "../../domain/payroll-run.aggregate";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListPayrollRunsHandler {
  constructor(@Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort) {}

  async execute(filter: { status?: string; year?: number } = {}, page?: PageRequest): Promise<{ runs: PayrollRun[]; total: number }> {
    return this.payrollRuns.list(filter, page);
  }
}
