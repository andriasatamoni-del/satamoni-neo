import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { CatalogModule } from "../catalog/catalog.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ORDER_REPOSITORY } from "./domain/ports/order-repository.port";
import { KyselyOrderRepository } from "./infrastructure/persistence/kysely-order.repository";
import { RegisterOrderHandler } from "./application/commands/register-order.handler";
import { UpdateOrderStatusHandler } from "./application/commands/update-order-status.handler";
import { ListOrdersHandler } from "./application/queries/list-orders.handler";
import { OrdersController } from "./api/orders.controller";

@Module({
  imports: [IdentityAccessModule, CatalogModule, InventoryModule],
  controllers: [OrdersController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: KyselyOrderRepository },
    RegisterOrderHandler,
    UpdateOrderStatusHandler,
    ListOrdersHandler,
  ],
  exports: [ORDER_REPOSITORY],
})
export class OrdersModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "orders",
      groupLabel: "الطلبات والبيع",
      permissions: [
        { key: "orders.view", label: "رؤية الطلبات" },
        { key: "orders.create", label: "تسجيل طلب جديد" },
        { key: "orders.manage", label: "إدارة حالة الطلبات" },
      ],
    });
    this.permissions.setRoleDefaults("cashier", ["orders.view", "orders.create"]);
    this.permissions.setRoleDefaults("branch_manager", ["orders.view", "orders.create", "orders.manage"]);
  }
}
