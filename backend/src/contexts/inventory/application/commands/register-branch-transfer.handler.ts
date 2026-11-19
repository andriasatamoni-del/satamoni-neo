import { Inject, Injectable } from "@nestjs/common";
import { TransactionService } from "../../../../shared/database/transaction-context";
import { TransferRequest } from "../../domain/transfer-request.aggregate";
import { StockMovement } from "../../domain/stock-movement.aggregate";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepositoryPort } from "../../domain/ports/stock-movement-repository.port";
import { INVENTORY_ITEM_REPOSITORY, type InventoryItemRepositoryPort } from "../../domain/ports/inventory-item-repository.port";
import { InventoryItemArchivedError, InventoryItemNotFoundError } from "../../domain/errors";

export interface RegisterBranchTransferCommand {
  fromBranchId: string;
  toBranchId: string;
  performedBy: string;
  notes?: string | null;
  lines: { inventoryItemId: string; quantity: number }[];
}

@Injectable()
export class RegisterBranchTransferHandler {
  constructor(
    @Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: RegisterBranchTransferCommand): Promise<TransferRequest> {
    return this.tx.run(async () => {
      const transfer = TransferRequest.register({
        fromBranchId: command.fromBranchId,
        toBranchId: command.toBranchId,
        requestedBy: command.performedBy,
        notes: command.notes ?? null,
        lines: command.lines.map((l) => ({ inventoryItemId: l.inventoryItemId, requestedQuantity: l.quantity })),
      });
      transfer.approve({ approvedBy: command.performedBy });

      const unitCosts = new Map<string, number | null>();
      for (const line of transfer.lines) {
        const item = await this.items.findById(line.inventoryItemId);
        if (!item) throw new InventoryItemNotFoundError();
        if (item.archivedAt) throw new InventoryItemArchivedError(item.name);
        unitCosts.set(item.id, item.unitCost);
      }

      const dispatched = [];
      for (const line of transfer.lines) {
        const movement = StockMovement.register({
          inventoryItemId: line.inventoryItemId,
          branchId: transfer.fromBranchId,
          movementType: "TRANSFER_OUT",
          quantityDelta: -line.requestedQuantity,
          referenceType: "transfer_request",
          referenceId: transfer.id,
          performedBy: command.performedBy,
          unitCost: unitCosts.get(line.inventoryItemId) ?? null,
        });
        await this.movements.recordMovement(movement, { allowNegativeBalance: false });
        dispatched.push({ lineId: line.id, quantity: line.requestedQuantity, movementId: movement.id });
      }
      transfer.dispatch({ dispatchedBy: command.performedBy, movements: dispatched });

      const received = [];
      for (const line of transfer.lines) {
        const movement = StockMovement.register({
          inventoryItemId: line.inventoryItemId,
          branchId: transfer.toBranchId,
          movementType: "TRANSFER_IN",
          quantityDelta: line.requestedQuantity,
          referenceType: "transfer_request",
          referenceId: transfer.id,
          performedBy: command.performedBy,
          unitCost: unitCosts.get(line.inventoryItemId) ?? null,
        });
        await this.movements.recordMovement(movement, { allowNegativeBalance: true });
        received.push({ lineId: line.id, quantity: line.requestedQuantity, movementId: movement.id });
      }
      transfer.receive({ receivedBy: command.performedBy, movements: received });

      await this.requests.save(transfer);
      return transfer;
    });
  }
}
