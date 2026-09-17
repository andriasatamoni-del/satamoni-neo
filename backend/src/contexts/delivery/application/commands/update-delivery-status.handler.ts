import { Inject, Injectable } from "@nestjs/common";
import { DeliveryAssignment } from "../../domain/delivery-assignment.aggregate";
import {
  DELIVERY_ASSIGNMENT_REPOSITORY,
  type DeliveryAssignmentRepositoryPort,
} from "../../domain/ports/delivery-assignment-repository.port";
import { DeliveryAssignmentNotFoundError } from "../../domain/errors";

export interface UpdateDeliveryStatusCommand {
  assignmentId: string;
  status: string;
  failureReason?: string | null;
  collectedAmount?: number | null;
}

@Injectable()
export class UpdateDeliveryStatusHandler {
  constructor(@Inject(DELIVERY_ASSIGNMENT_REPOSITORY) private readonly assignments: DeliveryAssignmentRepositoryPort) {}

  async execute(command: UpdateDeliveryStatusCommand): Promise<DeliveryAssignment> {
    const assignment = await this.assignments.findById(command.assignmentId);
    if (!assignment) throw new DeliveryAssignmentNotFoundError();

    assignment.updateStatus(command.status, { failureReason: command.failureReason, collectedAmount: command.collectedAmount });
    await this.assignments.save(assignment);
    return assignment;
  }
}
