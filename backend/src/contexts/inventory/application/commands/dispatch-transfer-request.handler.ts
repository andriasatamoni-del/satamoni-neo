import { Inject, Injectable } from "@nestjs/common";
import { TransferRequest } from "../../domain/transfer-request.aggregate";
import { StockMovement } from "../../domain/stock-movement.aggregate";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepositoryPort } from "../../domain/ports/stock-movement-repository.port";
import { INVENTORY_ITEM_REPOSITORY, type InventoryItemRepositoryPort } from "../../domain/ports/inventory-item-repository.port";
import { TransferRequestNotFoundError } from "../../domain/errors";

export interface DispatchTransferRequestCommand {
  requestId: string;
  dispatchedBy: string | null;
  // كمية الشحن الفعلية لكل بند - لو مش محددة، بتساوي approvedQuantity تلقائيًا
  quantities?: Record<string, number>;
  approved?: boolean;
}

// شحن الطلب - بيسجّل TRANSFER_OUT حقيقي عند fromBranchId لكل بند (نفس فلسفة RegisterStocktakeHandler:
// الحركة الحقيقية بتتسجل الأول، وبعدين movementId الحقيقي بيتحط في سطر الأجريجيت، مش العكس)
@Injectable()
export class DispatchTransferRequestHandler {
  constructor(
    @Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort
  ) {}

  async execute(command: DispatchTransferRequestCommand): Promise<TransferRequest> {
    const request = await this.requests.findById(command.requestId);
    if (!request) throw new TransferRequestNotFoundError();

    const movementResults: { lineId: string; quantity: number; movementId: string }[] = [];
    for (const line of request.lines) {
      const quantity = command.quantities?.[line.id] ?? line.approvedQuantity ?? line.requestedQuantity;
      if (!quantity || quantity <= 0) continue;

      const item = await this.items.findById(line.inventoryItemId);
      const allowNegativeBalance = item?.negativeStockPolicy === "ALLOW_WITH_APPROVAL" && !!command.approved;

      const movement = StockMovement.register({
        inventoryItemId: line.inventoryItemId,
        branchId: request.fromBranchId,
        movementType: "TRANSFER_OUT",
        quantityDelta: -quantity,
        referenceType: "transfer_request",
        referenceId: request.id,
        performedBy: command.dispatchedBy,
      });
      await this.movements.recordMovement(movement, { allowNegativeBalance });
      movementResults.push({ lineId: line.id, quantity, movementId: movement.id });
    }

    request.dispatch({ dispatchedBy: command.dispatchedBy, movements: movementResults });
    await this.requests.save(request);
    return request;
  }
}
