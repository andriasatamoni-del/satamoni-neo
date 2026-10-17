import { Inject, Injectable } from "@nestjs/common";
import { PRINT_JOB_REPOSITORY, type PrintJobRepositoryPort } from "../../domain/ports/print-job-repository.port";
import type { PrintJob } from "../../domain/print-job.aggregate";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

export interface ListPrintJobsQuery {
  branchId: string;
  status?: string;
  orderId?: string;
}

@Injectable()
export class ListPrintJobsHandler {
  constructor(@Inject(PRINT_JOB_REPOSITORY) private readonly printJobs: PrintJobRepositoryPort) {}

  execute(query: ListPrintJobsQuery, page: PageRequest): Promise<{ jobs: PrintJob[]; total: number }> {
    return this.printJobs.list(query, page);
  }
}
