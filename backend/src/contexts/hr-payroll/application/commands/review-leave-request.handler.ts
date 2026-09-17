import { Inject, Injectable } from "@nestjs/common";
import { LeaveRequest } from "../../domain/leave-request.aggregate";
import { LEAVE_REQUEST_REPOSITORY, type LeaveRequestRepositoryPort } from "../../domain/ports/leave-request-repository.port";
import { LeaveRequestNotFoundError } from "../../domain/errors";

export interface ReviewLeaveRequestCommand {
  leaveRequestId: string;
  decision: "approve" | "reject";
  notes?: string | null;
  reviewerId: string | null;
}

@Injectable()
export class ReviewLeaveRequestHandler {
  constructor(@Inject(LEAVE_REQUEST_REPOSITORY) private readonly leaveRequests: LeaveRequestRepositoryPort) {}

  async execute(command: ReviewLeaveRequestCommand): Promise<LeaveRequest> {
    const request = await this.leaveRequests.findById(command.leaveRequestId);
    if (!request) throw new LeaveRequestNotFoundError();

    if (command.decision === "approve") {
      request.approve({ reviewedBy: command.reviewerId, notes: command.notes });
    } else {
      request.reject({ reviewedBy: command.reviewerId, notes: command.notes });
    }
    await this.leaveRequests.save(request);
    return request;
  }
}
