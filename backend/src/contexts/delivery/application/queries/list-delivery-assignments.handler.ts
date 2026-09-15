import { Inject, Injectable } from "@nestjs/common";
import { DeliveryAssignment } from "../../domain/delivery-assignment.aggregate";
import {
  DELIVERY_ASSIGNMENT_REPOSITORY,
  type DeliveryAssignmentRepositoryPort,
} from "../../domain/ports/delivery-assignment-repository.port";

@Injectable()
export class ListDeliveryAssignmentsHandler {
  constructor(@Inject(DELIVERY_ASSIGNMENT_REPOSITORY) private readonly assignments: DeliveryAssignmentRepositoryPort) {}

  async execute(filter?: { branchId?: string; driverId?: string }): Promise<DeliveryAssignment[]> {
    return this.assignments.list(filter);
  }
}
