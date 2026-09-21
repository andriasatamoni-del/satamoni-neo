import { Inject, Injectable } from "@nestjs/common";
import { PRINT_JOB_REPOSITORY, type PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import { PrintJobNotFoundError, PrintJobNotFailedError } from "../../domain/errors";
import type { PrintJob } from "../../domain/print-job.aggregate";

export interface RetryPrintJobCommand {
  printJobId: string;
}

// إعادة أمر طباعة فاشل للطابور - إجراء يدوي بس (من شاشة الإدارة) عمدًا، مفيش إعادة محاولة تلقائية
// عشان منمنعش تكرار طباعة حقيقي لو المشكلة كانت "الورقة خرجت فعلاً بس الشبكة قطعت قبل ما الوكيل يبلّغ"
@Injectable()
export class RetryPrintJobHandler {
  constructor(@Inject(PRINT_JOB_REPOSITORY) private readonly printJobs: PrintJobRepositoryPort) {}

  async execute(command: RetryPrintJobCommand): Promise<PrintJob> {
    const existing = await this.printJobs.findById(command.printJobId);
    if (!existing) throw new PrintJobNotFoundError();
    const retried = await this.printJobs.retry(command.printJobId);
    if (!retried) throw new PrintJobNotFailedError();
    return retried;
  }
}
