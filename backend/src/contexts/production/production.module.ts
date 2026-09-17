import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { CatalogModule } from "../catalog/catalog.module";
import { InventoryModule } from "../inventory/inventory.module";
import { CONVERSION_ORDER_REPOSITORY } from "./domain/ports/conversion-order-repository.port";
import { KyselyConversionOrderRepository } from "./infrastructure/persistence/kysely-conversion-order.repository";
import { RegisterConversionOrderHandler } from "./application/commands/register-conversion-order.handler";
import { ApproveConversionOrderHandler } from "./application/commands/approve-conversion-order.handler";
import { StartConversionOrderHandler } from "./application/commands/start-conversion-order.handler";
import { CompleteConversionOrderHandler } from "./application/commands/complete-conversion-order.handler";
import { CancelConversionOrderHandler } from "./application/commands/cancel-conversion-order.handler";
import { ListConversionOrdersHandler } from "./application/queries/list-conversion-orders.handler";
import { GetConversionOrderHandler } from "./application/queries/get-conversion-order.handler";
import { ProductionController } from "./api/production.controller";

@Module({
  imports: [IdentityAccessModule, CatalogModule, InventoryModule],
  controllers: [ProductionController],
  providers: [
    { provide: CONVERSION_ORDER_REPOSITORY, useClass: KyselyConversionOrderRepository },
    RegisterConversionOrderHandler,
    ApproveConversionOrderHandler,
    StartConversionOrderHandler,
    CompleteConversionOrderHandler,
    CancelConversionOrderHandler,
    ListConversionOrdersHandler,
    GetConversionOrderHandler,
  ],
})
export class ProductionModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "production",
      groupLabel: "التصنيع والتعبئة",
      permissions: [
        { key: "production.view", label: "رؤية أوامر التصنيع" },
        { key: "production.create", label: "إنشاء/بدء أمر تصنيع" },
        { key: "production.approve", label: "اعتماد أمر تصنيع" },
        { key: "production.complete", label: "إكمال أمر تصنيع" },
        { key: "production.cancel", label: "إلغاء أمر تصنيع" },
      ],
    });
    // نفس الريبو القديم بالظبط: الاعتماد (approve) للأدمن بس (مش من الافتراضيات هنا، الأدمن بياخدها
    // تلقائيًا من الكاتش-أول في PermissionRegistry.hasPermission) - branch_manager بيقدر ينشئ/يبدأ/يكمّل/
    // يلغي بس، مش يعتمد
    this.permissions.setRoleDefaults("branch_manager", [
      "production.view",
      "production.create",
      "production.complete",
      "production.cancel",
    ]);
    this.permissions.setRoleDefaults("accountant", ["production.view"]);
  }
}
