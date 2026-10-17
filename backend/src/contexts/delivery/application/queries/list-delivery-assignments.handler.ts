import { Inject, Injectable } from "@nestjs/common";
import { DeliveryAssignment } from "../../domain/delivery-assignment.aggregate";
import {
  DELIVERY_ASSIGNMENT_REPOSITORY,
  type DeliveryAssignmentListFilter,
  type DeliveryAssignmentRepositoryPort,
} from "../../domain/ports/delivery-assignment-repository.port";
import type { PageRequest } from "../../../../shared/http/list-query.dto";

@Injectable()
export class ListDeliveryAssignmentsHandler {
  constructor(@Inject(DELIVERY_ASSIGNMENT_REPOSITORY) private readonly assignments: DeliveryAssignmentRepositoryPort) {}

  async execute(filter: DeliveryAssignmentListFilter = {}, page?: PageRequest): Promise<{ assignments: DeliveryAssignment[]; total: number }> {
    return this.assignments.search(filter, page);
  }
}
