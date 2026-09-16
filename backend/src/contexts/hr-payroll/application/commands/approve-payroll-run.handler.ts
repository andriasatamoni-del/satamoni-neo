import { Inject, Injectable } from "@nestjs/common";
import { PayrollRun } from "../../domain/payroll-run.aggregate";
import { PAYROLL_RUN_REPOSITORY, type PayrollRunRepositoryPort } from "../../domain/ports/payroll-run-repository.port";
import { PayrollRunNotFoundError } from "../../domain/errors";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { PayrollRunApprovedEvent } from "../../domain/events/payroll-run-approved.event";

export interface ApprovePayrollRunCommand {
  payrollRunId: string;
  approvedBy?: string | null;
}

@Injectable()
export class ApprovePayrollRunHandler {
  constructor(
    @Inject(PAYROLL_RUN_REPOSITORY) private readonly payrollRuns: PayrollRunRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: ApprovePayrollRunCommand): Promise<PayrollRun> {
    const run = await this.payrollRuns.findById(command.payrollRunId);
    if (!run) throw new PayrollRunNotFoundError();

    run.approve(command.approvedBy ?? null);
    await this.payrollRuns.save(run);

    // بعد ما الاعتماد ينجح خالص - مش قبل كده. فشل subscriber (زي ترحيل القيد المحاسبي) مبيرجّعش
    // الاعتماد نفسه فاشل (راجع تعليق EventBusService.publish)
    await this.eventBus.publish(new PayrollRunApprovedEvent(run.id, run.year, run.month, run.totalNetPay, command.approvedBy ?? null));

    return run;
  }
}
