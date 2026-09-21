import { Inject, Injectable } from "@nestjs/common";
import { PRINT_JOB_REPOSITORY, type PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import { PrintJobNotFoundError, PrintJobNotPrintingError } from "../../domain/errors";
import type { PrintJob } from "../../domain/print-job.aggregate";

export interface MarkPrintJobPrintedCommand {
  printJobId: string;
}

@Injectable()
export class MarkPrintJobPrintedHandler {
  constructor(@Inject(PRINT_JOB_REPOSITORY) private readonly printJobs: PrintJobRepositoryPort) {}

  async execute(command: MarkPrintJobPrintedCommand): Promise<PrintJob> {
    const existing = await this.printJobs.findById(command.printJobId);
    if (!existing) throw new PrintJobNotFoundError();
    const printed = await this.printJobs.markPrinted(command.printJobId);
    if (!printed) throw new PrintJobNotPrintingError();
    return printed;
  }
}
