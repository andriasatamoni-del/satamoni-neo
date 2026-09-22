import { Module, OnModuleInit } from "@nestjs/common";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { INVENTORY_ITEM_REPOSITORY } from "./domain/ports/inventory-item-repository.port";
import { STOCK_MOVEMENT_REPOSITORY } from "./domain/ports/stock-movement-repository.port";
import { STOCKTAKE_REPOSITORY } from "./domain/ports/stocktake-repository.port";
import { BRANCH_STOCK_THRESHOLD_REPOSITORY } from "./domain/ports/branch-stock-threshold-repository.port";
import { KyselyInventoryItemRepository } from "./infrastructure/persistence/kysely-inventory-item.repository";
import { KyselyStockMovementRepository } from "./infrastructure/persistence/kysely-stock-movement.repository";
import { KyselyStocktakeRepository } from "./infrastructure/persistence/kysely-stocktake.repository";
import { KyselyBranchStockThresholdRepository } from "./infrastructure/persistence/kysely-branch-stock-threshold.repository";
import { RegisterInventoryItemHandler } from "./application/commands/register-inventory-item.handler";
import { RecordStockMovementHandler } from "./application/commands/record-stock-movement.handler";
import { RegisterStocktakeHandler } from "./application/commands/register-stocktake.handler";
import { UpdateStockThresholdHandler } from "./application/commands/update-stock-threshold.handler";
import { ListInventoryItemsHandler } from "./application/queries/list-inventory-items.handler";
import { GetBranchBalanceHandler } from "./application/queries/get-branch-balance.handler";
import { ListStocktakesHandler } from "./application/queries/list-stocktakes.handler";
import { GetStocktakeHandler } from "./application/queries/get-stocktake.handler";
import { GetStocktakeBoardHandler } from "./application/queries/get-stocktake-board.handler";
import { GetStockThresholdHandler } from "./application/queries/get-stock-threshold.handler";
import { ListLowStockHandler } from "./application/queries/list-low-stock.handler";
import { InventoryController } from "./api/inventory.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [InventoryController],
  providers: [
    { provide: INVENTORY_ITEM_REPOSITORY, useClass: KyselyInventoryItemRepository },
    { provide: STOCK_MOVEMENT_REPOSITORY, useClass: KyselyStockMovementRepository },
    { provide: STOCKTAKE_REPOSITORY, useClass: KyselyStocktakeRepository },
    { provide: BRANCH_STOCK_THRESHOLD_REPOSITORY, useClass: KyselyBranchStockThresholdRepository },
    RegisterInventoryItemHandler,
    RecordStockMovementHandler,
    RegisterStocktakeHandler,
    UpdateStockThresholdHandler,
    ListInventoryItemsHandler,
    GetBranchBalanceHandler,
    ListStocktakesHandler,
    GetStocktakeHandler,
    GetStocktakeBoardHandler,
    GetStockThresholdHandler,
    ListLowStockHandler,
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
