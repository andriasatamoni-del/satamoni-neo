import { Inject, Injectable } from "@nestjs/common";
import { PayrollRun } from "../../domain/payroll-run.aggregate";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import { PayrollRunNotFoundError, UnappliedPayrollAdjustmentsError } from "../../domain/errors";
import {
  PAYROLL_ADJUSTMENT_REPOSITORY,
  type PayrollAdjustmentRepositoryPort,
} from "../../domain/ports/payroll-adjustment-repository.port";
import { auditDetail } from "../../../../shared/audit/audit-context";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { PayrollRunApprovedEvent } from "../../domain/events/payroll-run-approved.event";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { SegregationOfDutiesError } from "../../../../shared/domain/domain-error";

export interface ApprovePayrollRunCommand {
  payrollRunId: string;
  approvedBy?: string | null;
}

// Phase 3.1:
//  * BL-04 - one transaction + row lock on the run: concurrent approvals queue, the first approves and posts the payroll
//    journal inside the same transaction, the others see status APPROVED and are rejected without any write.
//  * BL-05 - segregation of duties: the user who registered the run may never approve it (no admin bypass - there is no
//    documented emergency-administration policy in the approved requirements).
@Injectable()
export class ApprovePayrollRunHandler {
  constructor(
    @Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort,
    @Inject(PAYROLL_ADJUSTMENT_REPOSITORY) private readonly adjustments: PayrollAdjustmentRepositoryPort,
    private readonly eventBus: EventBusService,
    private readonly tx: TransactionService
  ) {}

  async execute(command: ApprovePayrollRunCommand): Promise<PayrollRun> {
    return this.tx.run(async () => {
      if (!(await this.tx.lockRow("payroll_runs", command.payrollRunId))) throw new PayrollRunNotFoundError();
      const run = await this.payrollRuns.findById(command.payrollRunId);
      if (!run) throw new PayrollRunNotFoundError();

      if (run.createdBy && command.approvedBy && run.createdBy === command.approvedBy) {
        throw new SegregationOfDutiesError("اعتماد قائمة الرواتب");
      }

      // BL-10: an adjustment registered after the draft was built (so neither applied nor linked) must not be silently skipped
      const unapplied = await this.adjustments.listUnlinkedActiveForMonth(run.year, run.month, run.employees.map((l) => l.employeeId));
      if (unapplied.length > 0) throw new UnappliedPayrollAdjustmentsError(unapplied.length);

      auditDetail({ before: { status: run.status, totalNetPay: run.totalNetPay } });
      run.approve(command.approvedBy ?? null);
      await this.payrollRuns.save(run);
      auditDetail({ after: { status: run.status, totalNetPay: run.totalNetPay } });

      await this.eventBus.publish(new PayrollRunApprovedEvent(run.id, run.year, run.month, run.totalNetPay, command.approvedBy ?? null));
      return run;
    });
  }
}
