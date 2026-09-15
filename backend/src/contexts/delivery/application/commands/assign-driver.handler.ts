import { Inject, Injectable } from "@nestjs/common";
import { DeliveryAssignment } from "../../domain/delivery-assignment.aggregate";
import {
  DELIVERY_ASSIGNMENT_REPOSITORY,
  type DeliveryAssignmentRepositoryPort,
} from "../../domain/ports/delivery-assignment-repository.port";
import { DRIVER_REPOSITORY, type DriverRepositoryPort } from "../../domain/ports/driver-repository.port";
import { DriverNotFoundError, OrderAlreadyAssignedError } from "../../domain/errors";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../../orders/domain/ports/order-repository.port";
import { OrderNotFoundError } from "../../../orders/domain/errors";

export interface AssignDriverCommand {
  orderId: string;
  driverId: string;
  assignedBy?: string | null;
}

@Injectable()
export class AssignDriverHandler {
  constructor(
    @Inject(DELIVERY_ASSIGNMENT_REPOSITORY) private readonly assignments: DeliveryAssignmentRepositoryPort,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepositoryPort,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort
  ) {}

  async execute(command: AssignDriverCommand): Promise<DeliveryAssignment> {
    const order = await this.orders.findById(command.orderId);
    if (!order) throw new OrderNotFoundError();

    const driver = await this.drivers.findById(command.driverId);
    if (!driver) throw new DriverNotFoundError();

    if (await this.assignments.findByOrderId(command.orderId)) throw new OrderAlreadyAssignedError();

    const assignment = DeliveryAssignment.register({
      orderId: command.orderId,
      driverId: command.driverId,
      branchId: order.branchId,
      assignedBy: command.assignedBy,
    });
    await this.assignments.save(assignment);
    return assignment;
  }
}
