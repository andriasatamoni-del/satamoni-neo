import { Inject, Injectable } from "@nestjs/common";
import { TransferRequest } from "../../domain/transfer-request.aggregate";
import { StockMovement } from "../../domain/stock-movement.aggregate";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../domain/ports/transfer-request-repository.port";
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepositoryPort } from "../../domain/ports/stock-movement-repository.port";
import { TransferRequestNotFoundError } from "../../domain/errors";

export interface ReceiveTransferRequestCommand {
  requestId: string;
  receivedBy: string | null;
  // كمية الاستلام الفعلية لكل بند - ممكن تكون أقل من المشحونة (فقد أثناء النقل)؛ لو مش محددة، بتساوي
  // الكمية المشحونة تلقائيًا (استلام كامل)
  quantities?: Record<string, number>;
}

// استلام الطلب - بيسجّل TRANSFER_IN حقيقي عند toBranchId. الفرق بين المشحون والمستلم (لو موجود) بيفضل
// واضح في السطر نفسه (dispatchedQuantity vs receivedQuantity) - مفيش تسوية تلقائية لفرق الفقد هنا، نفس
// تبسيط باقي المخزون (تسويات الفرق محتاجة جلسة جرد منفصلة، مش جزء من استلام التحويل)
@Injectable()
export class ReceiveTransferRequestHandler {
  constructor(
    @Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort
  ) {}

  async execute(command: ReceiveTransferRequestCommand): Promise<TransferRequest> {
    const request = await this.requests.findById(command.requestId);
    if (!request) throw new TransferRequestNotFoundError();

    const movementResults: { lineId: string; quantity: number; movementId: string }[] = [];
    for (const line of request.lines) {
      const quantity = command.quantities?.[line.id] ?? line.dispatchedQuantity ?? 0;
      if (!quantity || quantity <= 0) continue;

      const movement = StockMovement.register({
        inventoryItemId: line.inventoryItemId,
        branchId: request.toBranchId,
        movementType: "TRANSFER_IN",
        quantityDelta: quantity,
        referenceType: "transfer_request",
        referenceId: request.id,
        performedBy: command.receivedBy,
      });
      await this.movements.recordMovement(movement, { allowNegativeBalance: true });
      movementResults.push({ lineId: line.id, quantity, movementId: movement.id });
    }

    request.receive({ receivedBy: command.receivedBy, movements: movementResults });
    await this.requests.save(request);
    return request;
  }
}
