import { Inject, Injectable } from "@nestjs/common";
import { Complaint, type ComplaintStatus } from "../../domain/complaint.aggregate";
import { COMPLAINT_REPOSITORY, type ComplaintRepositoryPort } from "../../domain/ports/complaint-repository.port";
import { UnknownComplaintStatusError } from "../../domain/errors";

const STATUSES = ["open", "in_progress", "resolved"];

@Injectable()
export class ListComplaintsHandler {
  constructor(@Inject(COMPLAINT_REPOSITORY) private readonly complaints: ComplaintRepositoryPort) {}

  async execute(filter?: { status?: string }): Promise<Complaint[]> {
    if (filter?.status !== undefined && !STATUSES.includes(filter.status)) {
      throw new UnknownComplaintStatusError(filter.status);
    }
    return this.complaints.list(filter?.status ? { status: filter.status as ComplaintStatus } : undefined);
  }
}
