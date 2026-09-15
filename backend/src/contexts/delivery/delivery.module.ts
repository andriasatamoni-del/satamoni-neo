import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { OrdersModule } from "../orders/orders.module";
import { DRIVER_REPOSITORY } from "./domain/ports/driver-repository.port";
import { DELIVERY_ASSIGNMENT_REPOSITORY } from "./domain/ports/delivery-assignment-repository.port";
import { KyselyDriverRepository } from "./infrastructure/persistence/kysely-driver.repository";
import { KyselyDeliveryAssignmentRepository } from "./infrastructure/persistence/kysely-delivery-assignment.repository";
import { RegisterDriverHandler } from "./application/commands/register-driver.handler";
import { AssignDriverHandler } from "./application/commands/assign-driver.handler";
import { UpdateDeliveryStatusHandler } from "./application/commands/update-delivery-status.handler";
import { ListDriversHandler } from "./application/queries/list-drivers.handler";
import { ListDeliveryAssignmentsHandler } from "./application/queries/list-delivery-assignments.handler";
import { DeliveryController } from "./api/delivery.controller";

// Delivery & Dispatch context - راجع تعليق delivery-assignment.aggregate.ts للسلايس المؤجّل
// (driver_settlements/driver_shifts - معتمدين على Payroll اللي لسه مش موجود، Phase 4)
@Module({
  imports: [IdentityAccessModule, OrdersModule],
  controllers: [DeliveryController],
  providers: [
    { provide: DRIVER_REPOSITORY, useClass: KyselyDriverRepository },
    { provide: DELIVERY_ASSIGNMENT_REPOSITORY, useClass: KyselyDeliveryAssignmentRepository },
    RegisterDriverHandler,
    AssignDriverHandler,
    UpdateDeliveryStatusHandler,
    ListDriversHandler,
    ListDeliveryAssignmentsHandler,
  ],
  exports: [DRIVER_REPOSITORY, DELIVERY_ASSIGNMENT_REPOSITORY],
})
export class DeliveryModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "delivery",
      groupLabel: "التوصيل والسائقين",
      permissions: [
        { key: "delivery.drivers.view", label: "رؤية السائقين" },
        { key: "delivery.drivers.manage", label: "إدارة السائقين" },
        { key: "delivery.assignments.view", label: "رؤية طلبات التوصيل" },
        { key: "delivery.assignments.manage", label: "إدارة توزيع/حالة التوصيل" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", [
      "delivery.drivers.view", "delivery.drivers.manage", "delivery.assignments.view", "delivery.assignments.manage",
    ]);
    this.permissions.setRoleDefaults("driver", ["delivery.assignments.view", "delivery.assignments.manage"]);
  }
}
