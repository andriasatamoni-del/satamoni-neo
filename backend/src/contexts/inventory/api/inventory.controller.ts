import { Body, Controller, Get, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterInventoryItemHandler } from "../application/commands/register-inventory-item.handler";
import { RecordStockMovementHandler } from "../application/commands/record-stock-movement.handler";
import { RegisterStocktakeHandler } from "../application/commands/register-stocktake.handler";
import { ListInventoryItemsHandler } from "../application/queries/list-inventory-items.handler";
import { GetBranchBalanceHandler } from "../application/queries/get-branch-balance.handler";
import { ListStocktakesHandler } from "../application/queries/list-stocktakes.handler";
import { GetStocktakeHandler } from "../application/queries/get-stocktake.handler";
import { GetStocktakeBoardHandler } from "../application/queries/get-stocktake-board.handler";
import { RegisterInventoryItemDto } from "./dto/register-inventory-item.dto";
import { RecordStockMovementDto } from "./dto/record-stock-movement.dto";
import { RegisterStocktakeDto } from "./dto/register-stocktake.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { InventoryDomainErrorFilter } from "./filters/domain-error.filter";
import type { InventoryItem } from "../domain/inventory-item.aggregate";
import type { StockMovement } from "../domain/stock-movement.aggregate";
import type { Stocktake } from "../domain/stocktake.aggregate";

@Controller("inventory")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(InventoryDomainErrorFilter)
export class InventoryController {
  constructor(
    private readonly registerItem: RegisterInventoryItemHandler,
    private readonly recordMovement: RecordStockMovementHandler,
    private readonly registerStocktake: RegisterStocktakeHandler,
    private readonly listItems: ListInventoryItemsHandler,
    private readonly getBalance: GetBranchBalanceHandler,
    private readonly listStocktakes: ListStocktakesHandler,
    private readonly getStocktake: GetStocktakeHandler,
    private readonly getStocktakeBoard: GetStocktakeBoardHandler
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

  @Get("stocktakes/board")
  @RequirePermission("inventory.items.view")
  async stocktakeBoard(@Query("branchId") branchId: string) {
    return this.getStocktakeBoard.execute(branchId);
  }

  @Get("stocktakes")
  @RequirePermission("inventory.items.view")
  async stocktakes(@Query("branchId") branchId?: string) {
    return (await this.listStocktakes.execute({ branchId })).map(toPublicStocktake);
  }

  @Get("stocktakes/:id")
  @RequirePermission("inventory.items.view")
  async stocktake(@Param("id") id: string) {
    return toPublicStocktake(await this.getStocktake.execute(id));
  }

  @Post("stocktakes")
  @RequirePermission("inventory.movements.record")
  async createStocktake(@Body() dto: RegisterStocktakeDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicStocktake(await this.registerStocktake.execute({ ...dto, createdBy: req.user.id }));
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

function toPublicStocktake(stocktake: Stocktake) {
  return {
    id: stocktake.id,
    branchId: stocktake.branchId,
    createdBy: stocktake.createdBy,
    notes: stocktake.notes,
    totalVarianceValue: stocktake.totalVarianceValue,
    createdAt: stocktake.createdAt,
    lines: stocktake.lines.map((l) => ({
      inventoryItemId: l.inventoryItemId,
      systemQuantity: l.systemQuantity,
      actualQuantity: l.actualQuantity,
      varianceQuantity: l.varianceQuantity,
      unitCost: l.unitCost,
      varianceValue: l.varianceValue,
      reason: l.reason,
      chargeAccountCode: l.chargeAccountCode,
    })),
  };
}
