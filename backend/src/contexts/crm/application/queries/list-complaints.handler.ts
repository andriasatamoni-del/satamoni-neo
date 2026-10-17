import { Inject, Injectable } from "@nestjs/common";
import { Complaint, type ComplaintStatus } from "../../domain/complaint.aggregate";
import { COMPLAINT_REPOSITORY, type ComplaintListFilter, type ComplaintRepositoryPort } from "../../domain/ports/complaint-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { UnknownComplaintStatusError } from "../../domain/errors";

const STATUSES = ["open", "in_progress", "resolved"];

@Injectable()
export class ListComplaintsHandler {
  constructor(@Inject(COMPLAINT_REPOSITORY) private readonly complaints: ComplaintRepositoryPort) {}

  async execute(filter: Omit<ComplaintListFilter, "status"> & { status?: string } = {}, page?: PageRequest): Promise<{ complaints: Complaint[]; total: number }> {
    if (filter.status !== undefined && !STATUSES.includes(filter.status)) {
      throw new UnknownComplaintStatusError(filter.status);
    }
    return this.complaints.list({ ...filter, status: filter.status ? (filter.status as ComplaintStatus) : undefined }, page);
  }
}
