import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { INVENTORY_ITEM_REPOSITORY } from "./domain/ports/inventory-item-repository.port";
import { STOCK_MOVEMENT_REPOSITORY } from "./domain/ports/stock-movement-repository.port";
import { KyselyInventoryItemRepository } from "./infrastructure/persistence/kysely-inventory-item.repository";
import { KyselyStockMovementRepository } from "./infrastructure/persistence/kysely-stock-movement.repository";
import { RegisterInventoryItemHandler } from "./application/commands/register-inventory-item.handler";
import { RecordStockMovementHandler } from "./application/commands/record-stock-movement.handler";
import { ListInventoryItemsHandler } from "./application/queries/list-inventory-items.handler";
import { GetBranchBalanceHandler } from "./application/queries/get-branch-balance.handler";
import { InventoryController } from "./api/inventory.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [InventoryController],
  providers: [
    { provide: INVENTORY_ITEM_REPOSITORY, useClass: KyselyInventoryItemRepository },
    { provide: STOCK_MOVEMENT_REPOSITORY, useClass: KyselyStockMovementRepository },
    RegisterInventoryItemHandler,
    RecordStockMovementHandler,
    ListInventoryItemsHandler,
    GetBranchBalanceHandler,
  ],
  exports: [INVENTORY_ITEM_REPOSITORY, STOCK_MOVEMENT_REPOSITORY],
})
export class InventoryModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "inventory",
      groupLabel: "المخزون",
      permissions: [
        { key: "inventory.items.view", label: "رؤية أصناف المخزون" },
        { key: "inventory.items.manage", label: "إدارة أصناف المخزون" },
        { key: "inventory.movements.record", label: "تسجيل حركات مخزون" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["inventory.items.view", "inventory.movements.record"]);
    this.permissions.setRoleDefaults("accountant", ["inventory.items.view"]);
  }
}
