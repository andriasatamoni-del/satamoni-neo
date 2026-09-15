import { Body, Controller, Get, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterInventoryItemHandler } from "../application/commands/register-inventory-item.handler";
import { RecordStockMovementHandler } from "../application/commands/record-stock-movement.handler";
import { ListInventoryItemsHandler } from "../application/queries/list-inventory-items.handler";
import { GetBranchBalanceHandler } from "../application/queries/get-branch-balance.handler";
import { RegisterInventoryItemDto } from "./dto/register-inventory-item.dto";
import { RecordStockMovementDto } from "./dto/record-stock-movement.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { InventoryDomainErrorFilter } from "./filters/domain-error.filter";
import type { InventoryItem } from "../domain/inventory-item.aggregate";
import type { StockMovement } from "../domain/stock-movement.aggregate";

@Controller("inventory")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(InventoryDomainErrorFilter)
export class InventoryController {
  constructor(
    private readonly registerItem: RegisterInventoryItemHandler,
    private readonly recordMovement: RecordStockMovementHandler,
    private readonly listItems: ListInventoryItemsHandler,
    private readonly getBalance: GetBranchBalanceHandler
  ) {}

  @Get("items")
  @RequirePermission("inventory.items.view", "inventory.items.manage")
  async list() {
    const items = await this.listItems.execute();
    return items.map(toPublicItem);
  }

  @Post("items")
  @RequirePermission("inventory.items.manage")
  async create(@Body() dto: RegisterInventoryItemDto) {
    const item = await this.registerItem.execute(dto);
    return toPublicItem(item);
  }

  @Post("movements")
  @RequirePermission("inventory.movements.record")
  async record(@Body() dto: RecordStockMovementDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const { movement, balanceAfter } = await this.recordMovement.execute({ ...dto, performedBy: req.user.id });
    return { movement: toPublicMovement(movement), balanceAfter };
  }

  @Get("balances")
  @RequirePermission("inventory.items.view", "inventory.movements.record")
  async balance(@Query("branchId") branchId: string, @Query("inventoryItemId") inventoryItemId: string) {
    const quantity = await this.getBalance.execute(branchId, inventoryItemId);
    return { branchId, inventoryItemId, quantity };
  }
}

function toPublicItem(item: InventoryItem) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    unitCost: item.unitCost,
    itemType: item.itemType,
    negativeStockPolicy: item.negativeStockPolicy,
  };
}

function toPublicMovement(movement: StockMovement) {
  return {
    id: movement.id,
    inventoryItemId: movement.inventoryItemId,
    branchId: movement.branchId,
    movementType: movement.movementType,
    quantityDelta: movement.quantityDelta,
    reason: movement.reason,
    occurredAt: movement.occurredAt,
  };
}
