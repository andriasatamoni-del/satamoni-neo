import { Inject, Injectable } from "@nestjs/common";
import { PayrollRun } from "../../domain/payroll-run.aggregate";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import { PayrollRunNotFoundError } from "../../domain/errors";

export interface CancelPayrollRunCommand {
  payrollRunId: string;
  cancelledBy?: string | null;
  reason?: string | null;
}

@Injectable()
export class CancelPayrollRunHandler {
  constructor(@Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort) {}

  async execute(command: CancelPayrollRunCommand): Promise<PayrollRun> {
    const run = await this.payrollRuns.findById(command.payrollRunId);
    if (!run) throw new PayrollRunNotFoundError();
    run.cancel({ cancelledBy: command.cancelledBy, reason: command.reason });
    await this.payrollRuns.save(run);
    return run;
  }
}
