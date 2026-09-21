import { Inject, Injectable } from "@nestjs/common";
import { PRINT_JOB_REPOSITORY, type PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import type { PrintJob } from "../../domain/print-job.aggregate";

export interface ListPrintJobsQuery {
  branchId: string;
  status?: string;
  orderId?: string;
  limit?: number;
}

@Injectable()
export class ListPrintJobsHandler {
  constructor(@Inject(PRINT_JOB_REPOSITORY) private readonly printJobs: PrintJobRepositoryPort) {}

  execute(query: ListPrintJobsQuery): Promise<PrintJob[]> {
    return this.printJobs.list(query);
  }
}
