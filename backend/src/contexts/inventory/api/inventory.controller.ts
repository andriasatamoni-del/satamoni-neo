import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterInventoryItemHandler } from "../application/commands/register-inventory-item.handler";
import { RecordStockMovementHandler } from "../application/commands/record-stock-movement.handler";
import { RegisterStocktakeHandler } from "../application/commands/register-stocktake.handler";
import { ListInventoryItemsHandler } from "../application/queries/list-inventory-items.handler";
import { GetBranchBalanceHandler } from "../application/queries/get-branch-balance.handler";
import { ListStocktakesHandler } from "../application/queries/list-stocktakes.handler";
import { GetStocktakeHandler } from "../application/queries/get-stocktake.handler";
import { GetStocktakeBoardHandler } from "../application/queries/get-stocktake-board.handler";
import { UpdateStockThresholdHandler } from "../application/commands/update-stock-threshold.handler";
import { GetStockThresholdHandler } from "../application/queries/get-stock-threshold.handler";
import { ListLowStockHandler } from "../application/queries/list-low-stock.handler";
import { RegisterTransferRequestHandler } from "../application/commands/register-transfer-request.handler";
import { ApproveTransferRequestHandler } from "../application/commands/approve-transfer-request.handler";
import { RejectTransferRequestHandler } from "../application/commands/reject-transfer-request.handler";
import { DispatchTransferRequestHandler } from "../application/commands/dispatch-transfer-request.handler";
import { ReceiveTransferRequestHandler } from "../application/commands/receive-transfer-request.handler";
import { CancelTransferRequestHandler } from "../application/commands/cancel-transfer-request.handler";
import { ListTransferRequestsHandler } from "../application/queries/list-transfer-requests.handler";
import { ListInventoryBatchesHandler } from "../application/queries/list-inventory-batches.handler";
import { WriteOffInventoryBatchHandler } from "../application/commands/write-off-inventory-batch.handler";
import { GetRequisitionSuggestionHandler } from "../application/queries/get-requisition-suggestion.handler";
import { GetRequisitionSuggestionDto } from "./dto/get-requisition-suggestion.dto";
import { RegisterInventoryItemDto } from "./dto/register-inventory-item.dto";
import { RecordStockMovementDto } from "./dto/record-stock-movement.dto";
import { RegisterStocktakeDto } from "./dto/register-stocktake.dto";
import { UpdateStockThresholdDto } from "./dto/update-stock-threshold.dto";
import { RegisterTransferRequestDto } from "./dto/register-transfer-request.dto";
import { ApproveTransferRequestDto } from "./dto/approve-transfer-request.dto";
import { RejectTransferRequestDto } from "./dto/reject-transfer-request.dto";
import { DispatchTransferRequestDto } from "./dto/dispatch-transfer-request.dto";
import { ReceiveTransferRequestDto } from "./dto/receive-transfer-request.dto";
import { CancelTransferRequestDto } from "./dto/cancel-transfer-request.dto";
import { WriteOffInventoryBatchDto } from "./dto/write-off-inventory-batch.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { BranchScopeGuard, BranchScoped, BranchResource, assertBranchAccess, branchScopeOf } from "../../../shared/authorization/branch-scope";
import { InventoryDomainErrorFilter } from "./filters/domain-error.filter";
import type { InventoryItem } from "../domain/inventory-item.aggregate";
import type { StockMovement } from "../domain/stock-movement.aggregate";
import type { Stocktake } from "../domain/stocktake.aggregate";
import type { BranchStockThreshold } from "../domain/branch-stock-threshold.aggregate";
import type { TransferRequest } from "../domain/transfer-request.aggregate";
import type { InventoryBatch } from "../domain/inventory-batch.aggregate";

@Controller("inventory")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
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
    private readonly getStocktakeBoard: GetStocktakeBoardHandler,
    private readonly updateStockThreshold: UpdateStockThresholdHandler,
    private readonly getStockThreshold: GetStockThresholdHandler,
    private readonly listLowStock: ListLowStockHandler,
    private readonly registerTransferRequest: RegisterTransferRequestHandler,
    private readonly approveTransferRequest: ApproveTransferRequestHandler,
    private readonly rejectTransferRequest: RejectTransferRequestHandler,
    private readonly dispatchTransferRequest: DispatchTransferRequestHandler,
    private readonly receiveTransferRequest: ReceiveTransferRequestHandler,
    private readonly cancelTransferRequest: CancelTransferRequestHandler,
    private readonly listTransferRequests: ListTransferRequestsHandler,
    private readonly listInventoryBatches: ListInventoryBatchesHandler,
    private readonly writeOffInventoryBatch: WriteOffInventoryBatchHandler,
    private readonly getRequisitionSuggestion: GetRequisitionSuggestionHandler
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

  @BranchScoped()
  @Post("movements")
  @RequirePermission("inventory.movements.record")
  async record(@Body() dto: RecordStockMovementDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const { movement, balanceAfter } = await this.recordMovement.execute({ ...dto, performedBy: req.user.id });
    return { movement: toPublicMovement(movement), balanceAfter };
  }

  @BranchScoped()
  @Get("balances")
  @RequirePermission("inventory.items.view", "inventory.movements.record")
  async balance(@Query("branchId") branchId: string, @Query("inventoryItemId") inventoryItemId: string) {
    const quantity = await this.getBalance.execute(branchId, inventoryItemId);
    return { branchId, inventoryItemId, quantity };
  }

  @BranchScoped()
  @Get("stock-thresholds")
  @RequirePermission("inventory.items.view", "inventory.items.manage")
  async stockThreshold(@Query("branchId") branchId: string, @Query("inventoryItemId") inventoryItemId: string) {
    return toPublicThreshold(await this.getStockThreshold.execute(branchId, inventoryItemId));
  }

  @BranchScoped()
  @Patch("stock-thresholds")
  @RequirePermission("inventory.items.manage")
  async updateStockThresholdRoute(@Body() dto: UpdateStockThresholdDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicThreshold(
      await this.updateStockThreshold.execute({
        branchId: dto.branchId,
        inventoryItemId: dto.inventoryItemId,
        reorderPoint: dto.reorderPoint,
        minStock: dto.minStock,
        maxStock: dto.maxStock,
        updatedBy: req.user.id,
      })
    );
  }

  @BranchScoped()
  @Get("low-stock")
  @RequirePermission("inventory.items.view", "inventory.items.manage")
  async lowStock(@Query("branchId") branchId?: string) {
    return this.listLowStock.execute(branchId);
  }

  @BranchScoped()
  @Get("requisition-suggestion")
  @RequirePermission("inventory.items.view", "inventory.movements.record")
  async requisitionSuggestion(@Query() dto: GetRequisitionSuggestionDto) {
    return this.getRequisitionSuggestion.execute(dto);
  }

  @BranchScoped()
  @Get("stocktakes/board")
  @RequirePermission("inventory.items.view")
  async stocktakeBoard(@Query("branchId") branchId: string) {
    return this.getStocktakeBoard.execute(branchId);
  }

  @BranchScoped()
  @Get("stocktakes")
  @RequirePermission("inventory.items.view")
  async stocktakes(@Query("branchId") branchId?: string) {
    return (await this.listStocktakes.execute({ branchId })).map(toPublicStocktake);
  }

  @BranchScoped()
  @BranchResource("stocktakes")
  @Get("stocktakes/:id")
  @RequirePermission("inventory.items.view")
  async stocktake(@Param("id") id: string) {
    return toPublicStocktake(await this.getStocktake.execute(id));
  }

  @BranchScoped()
  @Post("stocktakes")
  @RequirePermission("inventory.movements.record")
  async createStocktake(@Body() dto: RegisterStocktakeDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicStocktake(await this.registerStocktake.execute({ ...dto, createdBy: req.user.id }));
  }

  // طلبات التحويل بين الفروع - نفس مفهوم kitchen_orders في الريبو القديم بس معمّم (راجع تعليق
  // transfer-request.aggregate.ts). صلاحية واحدة للعرض، وواحدة لكل فعل بيغيّر حالة الطلب
  @BranchScoped()
  @Get("transfer-requests")
  @RequirePermission("inventory.items.view", "inventory.movements.record")
  async transferRequests(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query("fromBranchId") fromBranchId?: string,
    @Query("toBranchId") toBranchId?: string,
    @Query("status") status?: string
  ) {
    const rows = await this.listTransferRequests.execute({ fromBranchId, toBranchId, status });
    const scope = branchScopeOf(req.user);
    // a branch-bound user only sees transfers where its own branch is the sender or the receiver
    const visible = scope.kind === "all" ? rows : scope.kind === "branch" ? rows.filter((t) => t.fromBranchId === scope.branchId || t.toBranchId === scope.branchId) : [];
    return visible.map(toPublicTransferRequest);
  }

  @BranchScoped()
  @Post("transfer-requests")
  @RequirePermission("inventory.movements.record")
  async createTransferRequest(@Body() dto: RegisterTransferRequestDto, @Req() req: Request & { user: AuthenticatedUser }) {
    // a branch can only request stock FOR itself (the receiving branch is the caller's own branch)
    assertBranchAccess(req.user, dto.toBranchId);
    return toPublicTransferRequest(
      await this.registerTransferRequest.execute({
        fromBranchId: dto.fromBranchId,
        toBranchId: dto.toBranchId,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
        notes: dto.notes,
        lines: dto.lines,
        requestedBy: req.user.id,
      })
    );
  }

  @BranchScoped()
  @BranchResource("transfer_requests", { column: "from_branch_id" })
  @Post("transfer-requests/:id/approve")
  @RequirePermission("inventory.movements.record")
  async approveTransferRequestRoute(
    @Param("id") id: string,
    @Body() dto: ApproveTransferRequestDto,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return toPublicTransferRequest(
      await this.approveTransferRequest.execute({ requestId: id, approvedBy: req.user.id, approvedQuantities: dto.approvedQuantities })
    );
  }

  @BranchScoped()
  @BranchResource("transfer_requests", { column: "from_branch_id" })
  @Post("transfer-requests/:id/reject")
  @RequirePermission("inventory.movements.record")
  async rejectTransferRequestRoute(
    @Param("id") id: string,
    @Body() dto: RejectTransferRequestDto,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return toPublicTransferRequest(await this.rejectTransferRequest.execute({ requestId: id, rejectedBy: req.user.id, reason: dto.reason }));
  }

  @BranchScoped()
  @BranchResource("transfer_requests", { column: "from_branch_id" })
  @Post("transfer-requests/:id/dispatch")
  @RequirePermission("inventory.movements.record")
  async dispatchTransferRequestRoute(
    @Param("id") id: string,
    @Body() dto: DispatchTransferRequestDto,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return toPublicTransferRequest(
      await this.dispatchTransferRequest.execute({ requestId: id, dispatchedBy: req.user.id, quantities: dto.quantities, approved: dto.approved })
    );
  }

  @BranchScoped()
  @BranchResource("transfer_requests", { column: "to_branch_id" })
  @Post("transfer-requests/:id/receive")
  @RequirePermission("inventory.movements.record")
  async receiveTransferRequestRoute(
    @Param("id") id: string,
    @Body() dto: ReceiveTransferRequestDto,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return toPublicTransferRequest(await this.receiveTransferRequest.execute({ requestId: id, receivedBy: req.user.id, quantities: dto.quantities }));
  }

  @BranchScoped()
  @BranchResource("transfer_requests", { column: "to_branch_id", alsoColumns: ["from_branch_id"] })
  @Post("transfer-requests/:id/cancel")
  @RequirePermission("inventory.movements.record")
  async cancelTransferRequestRoute(
    @Param("id") id: string,
    @Body() dto: CancelTransferRequestDto,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    return toPublicTransferRequest(await this.cancelTransferRequest.execute({ requestId: id, cancelledBy: req.user.id, reason: dto.reason }));
  }

  // BATCH-1: دفعات/لوط - راجع تعليق inventory-batch.aggregate.ts لنطاق الميزة (استلام رسمي/إنتاج بس،
  // استهلاك يدوي، تتبّع مستوى واحد)
  @BranchScoped()
  @Get("items/:id/batches")
  @RequirePermission("inventory.items.view", "inventory.items.manage")
  async batches(@Param("id") id: string, @Query("branchId") branchId: string) {
    return (await this.listInventoryBatches.execute({ inventoryItemId: id, branchId })).map(toPublicBatch);
  }

  @BranchScoped()
  @BranchResource("inventory_batches")
  @Post("batches/:id/write-off")
  @RequirePermission("inventory.batches.manage")
  async writeOffBatch(@Param("id") id: string, @Body() dto: WriteOffInventoryBatchDto) {
    return toPublicBatch(await this.writeOffInventoryBatch.execute({ batchId: id, quantity: dto.quantity, markExpired: dto.markExpired }));
  }
}

function toPublicBatch(batch: InventoryBatch) {
  return {
    id: batch.id,
    batchNumber: batch.batchNumber,
    inventoryItemId: batch.inventoryItemId,
    branchId: batch.branchId,
    receivedQuantity: batch.receivedQuantity,
    remainingQuantity: batch.remainingQuantity,
    unitCost: batch.unitCost,
    expiryDate: batch.expiryDate,
    productionDate: batch.productionDate,
    sourceType: batch.sourceType,
    sourceId: batch.sourceId,
    status: batch.status,
    createdAt: batch.createdAt,
  };
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

function toPublicThreshold(threshold: BranchStockThreshold) {
  return {
    branchId: threshold.branchId,
    inventoryItemId: threshold.inventoryItemId,
    reorderPoint: threshold.reorderPoint,
    minStock: threshold.minStock,
    maxStock: threshold.maxStock,
    updatedBy: threshold.updatedBy,
    updatedAt: threshold.updatedAt,
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

function toPublicTransferRequest(request: TransferRequest) {
  return {
    id: request.id,
    fromBranchId: request.fromBranchId,
    toBranchId: request.toBranchId,
    requestedBy: request.requestedBy,
    requiredDate: request.requiredDate,
    notes: request.notes,
    status: request.status,
    approvedBy: request.approvedBy,
    approvedAt: request.approvedAt,
    rejectedBy: request.rejectedBy,
    rejectionReason: request.rejectionReason,
    dispatchedBy: request.dispatchedBy,
    dispatchedAt: request.dispatchedAt,
    receivedBy: request.receivedBy,
    receivedAt: request.receivedAt,
    cancelledBy: request.cancelledBy,
    cancelledAt: request.cancelledAt,
    cancellationReason: request.cancellationReason,
    createdAt: request.createdAt,
    lines: request.lines.map((l) => ({
      id: l.id,
      inventoryItemId: l.inventoryItemId,
      requestedQuantity: l.requestedQuantity,
      approvedQuantity: l.approvedQuantity,
      dispatchedQuantity: l.dispatchedQuantity,
      receivedQuantity: l.receivedQuantity,
    })),
  };
}
