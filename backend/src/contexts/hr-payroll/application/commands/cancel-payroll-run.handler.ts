import { Inject, Injectable } from "@nestjs/common";
import { PayrollRun } from "../../domain/payroll-run.aggregate";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import {
  PAYROLL_ADJUSTMENT_REPOSITORY,
  type PayrollAdjustmentRepositoryPort,
} from "../../domain/ports/payroll-adjustment-repository.port";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { PayrollRunCancelledEvent } from "../../domain/events/payroll-run-cancelled.event";
import { PayrollRunNotFoundError } from "../../domain/errors";

export interface CancelPayrollRunCommand {
  payrollRunId: string;
  cancelledBy?: string | null;
  reason?: string | null;
}

@Injectable()
export class CancelPayrollRunHandler {
  constructor(
    @Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort,
    @Inject(PAYROLL_ADJUSTMENT_REPOSITORY) private readonly adjustments: PayrollAdjustmentRepositoryPort,
    private readonly eventBus: EventBusService,
    private readonly tx: TransactionService
  ) {}

  // BL-10: cancelling an APPROVED run reverses its payroll journal in the same transaction (critical accounting subscriber).
  async execute(command: CancelPayrollRunCommand): Promise<PayrollRun> {
    return this.tx.run(async () => {
      if (!(await this.tx.lockRow("payroll_runs", command.payrollRunId))) throw new PayrollRunNotFoundError();
      const run = await this.payrollRuns.findById(command.payrollRunId);
      if (!run) throw new PayrollRunNotFoundError();
      auditDetail({ before: { status: run.status, totalNetPay: run.totalNetPay } });
      run.cancel({ cancelledBy: command.cancelledBy, reason: command.reason });
      await this.payrollRuns.save(run);
      // adjustments consumed by a cancelled run become available to the next run again
      await this.adjustments.unlinkFromRun(run.id);
      auditDetail({ after: { status: run.status, reason: command.reason ?? null } });
      await this.eventBus.publish(
        new PayrollRunCancelledEvent(run.id, run.year, run.month, run.totalNetPay, command.cancelledBy ?? null, command.reason ?? null)
      );
      return run;
    });
  }
}
