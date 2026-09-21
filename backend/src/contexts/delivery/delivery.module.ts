import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { OrdersModule } from "../orders/orders.module";
import { PaymentControlModule } from "../payment-control/payment-control.module";
import { SettingsModule } from "../settings/settings.module";
import { DRIVER_REPOSITORY } from "./domain/ports/driver-repository.port";
import { DELIVERY_ASSIGNMENT_REPOSITORY } from "./domain/ports/delivery-assignment-repository.port";
import { DRIVER_SETTLEMENT_REPOSITORY } from "./domain/ports/driver-settlement-repository.port";
import { DRIVER_ATTENDANCE_SHIFT_REPOSITORY } from "./domain/ports/driver-attendance-shift-repository.port";
import { DRIVER_SETTLEMENT_READER } from "./domain/ports/driver-settlement-reader.port";
import { KyselyDriverRepository } from "./infrastructure/persistence/kysely-driver.repository";
import { KyselyDeliveryAssignmentRepository } from "./infrastructure/persistence/kysely-delivery-assignment.repository";
import { KyselyDriverSettlementRepository } from "./infrastructure/persistence/kysely-driver-settlement.repository";
import { KyselyDriverAttendanceShiftRepository } from "./infrastructure/persistence/kysely-driver-attendance-shift.repository";
import { KyselyDriverSettlementReader } from "./infrastructure/persistence/kysely-driver-settlement-reader";
import { RegisterDriverHandler } from "./application/commands/register-driver.handler";
import { AssignDriverHandler } from "./application/commands/assign-driver.handler";
import { UpdateDeliveryStatusHandler } from "./application/commands/update-delivery-status.handler";
import { RegisterDriverSettlementHandler } from "./application/commands/register-driver-settlement.handler";
import { ReviewDriverSettlementHandler } from "./application/commands/review-driver-settlement.handler";
import { CheckInDriverHandler } from "./application/commands/check-in-driver.handler";
import { CheckOutDriverHandler } from "./application/commands/check-out-driver.handler";
import { ListDriversHandler } from "./application/queries/list-drivers.handler";
import { ListDeliveryAssignmentsHandler } from "./application/queries/list-delivery-assignments.handler";
import { ListDriverSettlementsHandler } from "./application/queries/list-driver-settlements.handler";
import { GetDriverSettlementHandler } from "./application/queries/get-driver-settlement.handler";
import { ListDriverAttendanceShiftsHandler } from "./application/queries/list-driver-attendance-shifts.handler";
import { PreviewDriverSettlementHandler } from "./application/queries/preview-driver-settlement.handler";
import { ListPendingSettlementDriversHandler } from "./application/queries/list-pending-settlement-drivers.handler";
import { GetDriverDayOrdersHandler } from "./application/queries/get-driver-day-orders.handler";
import { DeliveryController } from "./api/delivery.controller";

// Delivery & Dispatch context - driver_settlements (تسوية كاش) وdriver_shifts (حضور/أجر بالساعة)
// كانوا مؤجّلين لحد TIER2-4 (كانوا شكليًا معتمدين على Payroll، بس اتضح إن مفيش تكامل حقيقي مطلوب مع
// hr-payroll context - الأجر بيتدفع كاش على طول، مفيش payroll_adjustment. راجع تعليقات
// driver-settlement.aggregate.ts وdriver-attendance-shift.aggregate.ts للتفاصيل الكاملة)
@Module({
  imports: [IdentityAccessModule, OrdersModule, PaymentControlModule, SettingsModule],
  controllers: [DeliveryController],
  providers: [
    { provide: DRIVER_REPOSITORY, useClass: KyselyDriverRepository },
    { provide: DELIVERY_ASSIGNMENT_REPOSITORY, useClass: KyselyDeliveryAssignmentRepository },
    { provide: DRIVER_SETTLEMENT_REPOSITORY, useClass: KyselyDriverSettlementRepository },
    { provide: DRIVER_ATTENDANCE_SHIFT_REPOSITORY, useClass: KyselyDriverAttendanceShiftRepository },
    { provide: DRIVER_SETTLEMENT_READER, useClass: KyselyDriverSettlementReader },
    RegisterDriverHandler,
    AssignDriverHandler,
    UpdateDeliveryStatusHandler,
    RegisterDriverSettlementHandler,
    ReviewDriverSettlementHandler,
    CheckInDriverHandler,
    CheckOutDriverHandler,
    ListDriversHandler,
    ListDeliveryAssignmentsHandler,
    ListDriverSettlementsHandler,
    GetDriverSettlementHandler,
    ListDriverAttendanceShiftsHandler,
    PreviewDriverSettlementHandler,
    ListPendingSettlementDriversHandler,
    GetDriverDayOrdersHandler,
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
        { key: "delivery.settlements.view", label: "رؤية تسويات كاش السائقين" },
        { key: "delivery.settlements.create", label: "تسجيل تسوية كاش سائق" },
        { key: "delivery.settlements.review", label: "مراجعة فرق تسوية سائق" },
        { key: "delivery.shifts.manage", label: "تسجيل دخول/خروج شيفت حضور السائق" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", [
      "delivery.drivers.view", "delivery.drivers.manage", "delivery.assignments.view", "delivery.assignments.manage",
      "delivery.settlements.view", "delivery.settlements.create", "delivery.settlements.review", "delivery.shifts.manage",
    ]);
    this.permissions.setRoleDefaults("accountant", ["delivery.settlements.view", "delivery.settlements.review"]);
    this.permissions.setRoleDefaults("cashier", ["delivery.settlements.create", "delivery.shifts.manage"]);
    this.permissions.setRoleDefaults("driver", ["delivery.assignments.view", "delivery.assignments.manage"]);
  }
}
