import { Inject, Injectable } from "@nestjs/common";
import { PRINT_JOB_REPOSITORY, type PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import { PrintJobNotFoundError, PrintJobNotPendingError } from "../../domain/errors";
import type { PrintJob } from "../../domain/print-job.aggregate";

export interface ClaimPrintJobCommand {
  printJobId: string;
}

// وكيل الطباعة المحلي بيحجز الـjob لنفسه قبل ما يطبعها فعليًا (PENDING -> PRINTING) - UPDATE ذرّي بشرط
// status='PENDING' على مستوى الداتابيز (راجع KyselyPrintJobRepository.claim)، عشان لو أكتر من وكيل
// حاولوا ياخدوا نفس الـjob مش هيحصل تكرار طباعة أبدًا
@Injectable()
export class ClaimPrintJobHandler {
  constructor(@Inject(PRINT_JOB_REPOSITORY) private readonly printJobs: PrintJobRepositoryPort) {}

  async execute(command: ClaimPrintJobCommand): Promise<PrintJob> {
    const existing = await this.printJobs.findById(command.printJobId);
    if (!existing) throw new PrintJobNotFoundError();
    const claimed = await this.printJobs.claim(command.printJobId);
    if (!claimed) throw new PrintJobNotPendingError();
    return claimed;
  }
}
