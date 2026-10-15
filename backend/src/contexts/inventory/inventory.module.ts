import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module";
import { INVENTORY_ITEM_REPOSITORY } from "./domain/ports/inventory-item-repository.port";
import { STOCK_MOVEMENT_REPOSITORY } from "./domain/ports/stock-movement-repository.port";
import { STOCKTAKE_REPOSITORY } from "./domain/ports/stocktake-repository.port";
import { BRANCH_STOCK_THRESHOLD_REPOSITORY } from "./domain/ports/branch-stock-threshold-repository.port";
import { TRANSFER_REQUEST_REPOSITORY } from "./domain/ports/transfer-request-repository.port";
import { INVENTORY_BATCH_REPOSITORY } from "./domain/ports/inventory-batch-repository.port";
import { InventoryItemRepository } from "./infrastructure/persistence/inventory-item.repository";
import { StockMovementRepository } from "./infrastructure/persistence/stock-movement.repository";
import { StocktakeRepository } from "./infrastructure/persistence/stocktake.repository";
import { BranchStockThresholdRepository } from "./infrastructure/persistence/branch-stock-threshold.repository";
import { TransferRequestRepository } from "./infrastructure/persistence/transfer-request.repository";
import { InventoryBatchRepository } from "./infrastructure/persistence/inventory-batch.repository";
import { RegisterInventoryItemHandler } from "./application/commands/register-inventory-item.handler";
import { RecordStockMovementHandler } from "./application/commands/record-stock-movement.handler";
import { RegisterStocktakeHandler } from "./application/commands/register-stocktake.handler";
import { UpdateStockThresholdHandler } from "./application/commands/update-stock-threshold.handler";
import { RegisterTransferRequestHandler } from "./application/commands/register-transfer-request.handler";
import { ApproveTransferRequestHandler } from "./application/commands/approve-transfer-request.handler";
import { RejectTransferRequestHandler } from "./application/commands/reject-transfer-request.handler";
import { DispatchTransferRequestHandler } from "./application/commands/dispatch-transfer-request.handler";
import { ReceiveTransferRequestHandler } from "./application/commands/receive-transfer-request.handler";
import { CancelTransferRequestHandler } from "./application/commands/cancel-transfer-request.handler";
import { WriteOffInventoryBatchHandler } from "./application/commands/write-off-inventory-batch.handler";
import { ListInventoryItemsHandler } from "./application/queries/list-inventory-items.handler";
import { GetBranchBalanceHandler } from "./application/queries/get-branch-balance.handler";
import { ListStocktakesHandler } from "./application/queries/list-stocktakes.handler";
import { GetStocktakeHandler } from "./application/queries/get-stocktake.handler";
import { GetStocktakeBoardHandler } from "./application/queries/get-stocktake-board.handler";
import { GetStockThresholdHandler } from "./application/queries/get-stock-threshold.handler";
import { ListLowStockHandler } from "./application/queries/list-low-stock.handler";
import { ListTransferRequestsHandler } from "./application/queries/list-transfer-requests.handler";
import { ListInventoryBatchesHandler } from "./application/queries/list-inventory-batches.handler";
import { GetRequisitionSuggestionHandler } from "./application/queries/get-requisition-suggestion.handler";
import { REQUISITION_SUGGESTION_READER } from "./domain/ports/requisition-suggestion-reader.port";
import { RequisitionSuggestionReader } from "./infrastructure/persistence/requisition-suggestion.reader";
import { InventoryController } from "./api/inventory.controller";

@Module({
  imports: [IdentityAccessModule],
  controllers: [InventoryController],
  providers: [
    { provide: INVENTORY_ITEM_REPOSITORY, useClass: InventoryItemRepository },
    { provide: STOCK_MOVEMENT_REPOSITORY, useClass: StockMovementRepository },
    { provide: STOCKTAKE_REPOSITORY, useClass: StocktakeRepository },
    { provide: BRANCH_STOCK_THRESHOLD_REPOSITORY, useClass: BranchStockThresholdRepository },
    { provide: TRANSFER_REQUEST_REPOSITORY, useClass: TransferRequestRepository },
    { provide: INVENTORY_BATCH_REPOSITORY, useClass: InventoryBatchRepository },
    { provide: REQUISITION_SUGGESTION_READER, useClass: RequisitionSuggestionReader },
    GetRequisitionSuggestionHandler,
    RegisterInventoryItemHandler,
    RecordStockMovementHandler,
    RegisterStocktakeHandler,
    UpdateStockThresholdHandler,
    RegisterTransferRequestHandler,
    ApproveTransferRequestHandler,
    RejectTransferRequestHandler,
    DispatchTransferRequestHandler,
    ReceiveTransferRequestHandler,
    CancelTransferRequestHandler,
    WriteOffInventoryBatchHandler,
    ListInventoryItemsHandler,
    GetBranchBalanceHandler,
    ListStocktakesHandler,
    GetStocktakeHandler,
    GetStocktakeBoardHandler,
    GetStockThresholdHandler,
    ListLowStockHandler,
    ListTransferRequestsHandler,
    ListInventoryBatchesHandler,
  ],
  exports: [INVENTORY_ITEM_REPOSITORY, STOCK_MOVEMENT_REPOSITORY, TRANSFER_REQUEST_REPOSITORY, INVENTORY_BATCH_REPOSITORY],
})
export class InventoryModule {}
