import { Inject, Injectable } from "@nestjs/common";
import { DriverSettlement, type DriverSettlementCandidateOrder } from "../../domain/driver-settlement.aggregate";
import {
  DRIVER_SETTLEMENT_REPOSITORY,
  type DriverSettlementRepositoryPort,
} from "../../domain/ports/driver-settlement-repository.port";
import {
  DELIVERY_ASSIGNMENT_REPOSITORY,
  type DeliveryAssignmentRepositoryPort,
} from "../../domain/ports/delivery-assignment-repository.port";
import { NothingToSettleError, DriverNotFoundError } from "../../domain/errors";
import { DRIVER_REPOSITORY, type DriverRepositoryPort } from "../../domain/ports/driver-repository.port";
import { ORDER_REPOSITORY, type OrderRepositoryPort } from "../../../orders/domain/ports/order-repository.port";
import {
  PAYMENT_METHOD_REPOSITORY,
  type PaymentMethodRepositoryPort,
} from "../../../payment-control/domain/ports/payment-method-repository.port";
import { DriverSettlementCreatedEvent } from "../../domain/events/driver-settlement-created.event";
import { EventBusService } from "../../../../shared/events/event-bus.service";
import { DRIVER_ORDER_BONUS_EGP } from "../../domain/driver-bonus-policy";

export interface RegisterDriverSettlementCommand {
  driverId: string;
  branchId: string;
  actualHandover: number;
  notes?: string | null;
  settledBy?: string | null;
}

// نفس فلسفة الريبو القديم بالظبط: candidate set = طلبات توصيل DELIVERED ولسه مش متسوّاة (settlement_id
// IS NULL) لنفس السائق، بتتحسب حيّة وقت التسجيل - مفيش ledger متراكم منفصل. expected_handover =
// cod_collected مش cod_expected (راجع تعليق DriverSettlement.register)
@Injectable()
export class RegisterDriverSettlementHandler {
  constructor(
    @Inject(DRIVER_SETTLEMENT_REPOSITORY) private readonly settlements: DriverSettlementRepositoryPort,
    @Inject(DELIVERY_ASSIGNMENT_REPOSITORY) private readonly assignments: DeliveryAssignmentRepositoryPort,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepositoryPort,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Inject(PAYMENT_METHOD_REPOSITORY) private readonly paymentMethods: PaymentMethodRepositoryPort,
    private readonly eventBus: EventBusService
  ) {}

  async execute(command: RegisterDriverSettlementCommand): Promise<DriverSettlement> {
    if (!(await this.drivers.findById(command.driverId))) throw new DriverNotFoundError();

    const driverAssignments = (await this.assignments.list({ driverId: command.driverId })).filter(
      (a) => a.status === "DELIVERED" && !a.settlementId
    );
    if (driverAssignments.length === 0) throw new NothingToSettleError();

    const candidates: (DriverSettlementCandidateOrder & { assignmentId: string })[] = [];
    for (const assignment of driverAssignments) {
      const order = await this.orders.findById(assignment.orderId);
      if (!order) continue;
      const paymentMethod = order.paymentMethodId ? await this.paymentMethods.findById(order.paymentMethodId) : null;
      const isCash = paymentMethod?.kind === "cash";
      candidates.push({
        assignmentId: assignment.id,
        isCash,
        orderTotal: order.total,
        collectedAmount: assignment.collectedAmount ?? order.total,
        bonus: DRIVER_ORDER_BONUS_EGP,
      });
    }
    if (candidates.length === 0) throw new NothingToSettleError();

    const settlement = DriverSettlement.register({
      driverId: command.driverId,
      branchId: command.branchId,
      settledBy: command.settledBy,
      actualHandover: command.actualHandover,
      notes: command.notes,
      candidates,
    });
    await this.settlements.save(settlement);

    for (const candidate of candidates) {
      const assignment = driverAssignments.find((a) => a.id === candidate.assignmentId)!;
      assignment.assignToSettlement(settlement.id);
      await this.assignments.save(assignment);
    }

    if (settlement.handoverVariance !== 0) {
      await this.eventBus.publish(
        new DriverSettlementCreatedEvent(settlement.id, settlement.branchId, settlement.handoverVariance, command.settledBy ?? null)
      );
    }

    return settlement;
  }
}
