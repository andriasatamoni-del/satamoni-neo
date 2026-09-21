import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { CatalogModule } from "../catalog/catalog.module";
import { InventoryModule } from "../inventory/inventory.module";
import { BranchesModule } from "../branches/branches.module";
import { ORDER_REPOSITORY } from "./domain/ports/order-repository.port";
import { ORDER_RATING_REPOSITORY } from "./domain/ports/order-rating-repository.port";
import { KyselyOrderRepository } from "./infrastructure/persistence/kysely-order.repository";
import { KyselyOrderRatingRepository } from "./infrastructure/persistence/kysely-order-rating.repository";
import { RegisterOrderHandler } from "./application/commands/register-order.handler";
import { UpdateOrderStatusHandler } from "./application/commands/update-order-status.handler";
import { AdvanceKitchenStatusHandler } from "./application/commands/advance-kitchen-status.handler";
import { SubmitOrderRatingHandler } from "./application/commands/submit-order-rating.handler";
import { ListOrdersHandler } from "./application/queries/list-orders.handler";
import { ListKdsBoardHandler } from "./application/queries/list-kds-board.handler";
import { GetPublicOrderRatingHandler } from "./application/queries/get-public-order-rating.handler";
import { OrdersController } from "./api/orders.controller";
import { OrderRatingsController } from "./api/order-ratings.controller";

@Module({
  imports: [IdentityAccessModule, CatalogModule, InventoryModule, BranchesModule],
  controllers: [OrdersController, OrderRatingsController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: KyselyOrderRepository },
    { provide: ORDER_RATING_REPOSITORY, useClass: KyselyOrderRatingRepository },
    RegisterOrderHandler,
    UpdateOrderStatusHandler,
    AdvanceKitchenStatusHandler,
    SubmitOrderRatingHandler,
    ListOrdersHandler,
    ListKdsBoardHandler,
    GetPublicOrderRatingHandler,
  ],
  exports: [ORDER_REPOSITORY, RegisterOrderHandler],
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

    // مفيش دور "مطبخ" منفصل - نفس قرار الريبو القديم بالظبط (docs/KITCHEN-DISPLAY.md): الكاشير غالبًا
    // هو الواقف قدام شاشة المطبخ فعليًا، ومدير الفرع طبعًا لازم يشوف ويتابع برضه.
    this.permissions.registerGroup({
      group: "kitchen",
      groupLabel: "شاشة المطبخ",
      permissions: [
        { key: "kitchen.view", label: "رؤية شاشة المطبخ" },
        { key: "kitchen.advance", label: "تقديم حالة تحضير الطلب" },
      ],
    });
    this.permissions.setRoleDefaults("cashier", ["kitchen.view", "kitchen.advance"]);
    this.permissions.setRoleDefaults("branch_manager", ["kitchen.view", "kitchen.advance"]);
  }
}
