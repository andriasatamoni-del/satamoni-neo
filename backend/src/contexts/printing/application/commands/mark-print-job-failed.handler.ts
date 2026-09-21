import { Inject, Injectable } from "@nestjs/common";
import { PRINT_JOB_REPOSITORY, type PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import { PrintJobNotFoundError, PrintJobNotPrintingError } from "../../domain/errors";
import type { PrintJob } from "../../domain/print-job.aggregate";

export interface MarkPrintJobFailedCommand {
  printJobId: string;
  error?: string | null;
}

@Injectable()
export class MarkPrintJobFailedHandler {
  constructor(@Inject(PRINT_JOB_REPOSITORY) private readonly printJobs: PrintJobRepositoryPort) {}

  async execute(command: MarkPrintJobFailedCommand): Promise<PrintJob> {
    const existing = await this.printJobs.findById(command.printJobId);
    if (!existing) throw new PrintJobNotFoundError();
    const failed = await this.printJobs.markFailed(command.printJobId, command.error ?? null);
    if (!failed) throw new PrintJobNotPrintingError();
    return failed;
  }
}
