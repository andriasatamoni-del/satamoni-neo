import { Inject, Injectable } from "@nestjs/common";
import { InventoryBatch } from "../../domain/inventory-batch.aggregate";
import { INVENTORY_BATCH_REPOSITORY, type InventoryBatchRepositoryPort } from "../../domain/ports/inventory-batch-repository.port";
import { InventoryBatchNotFoundError } from "../../domain/errors";

export interface WriteOffInventoryBatchCommand {
  batchId: string;
  quantity?: number;
  markExpired?: boolean;
}

// إعدام/إنهاء دفعة يدوي - مفيش استهلاك FEFO تلقائي مربوط بحركات المخزون (راجع تعليق
// inventory-batch.aggregate.ts)، فده الطريقة الوحيدة حاليًا لتصفير أو تقليل remaining_quantity: تلف/هالك
// جزئي (quantity) أو انتهاء صلاحية كامل (markExpired، بيقفل الدفعة بغض النظر عن المتبقي)
@Injectable()
export class WriteOffInventoryBatchHandler {
  constructor(@Inject(INVENTORY_BATCH_REPOSITORY) private readonly batches: InventoryBatchRepositoryPort) {}

  async execute(command: WriteOffInventoryBatchCommand): Promise<InventoryBatch> {
    const batch = await this.batches.findById(command.batchId);
    if (!batch) throw new InventoryBatchNotFoundError();

    if (command.markExpired) {
      batch.markExpired();
    } else if (command.quantity) {
      batch.recordConsumption(command.quantity);
    }

    await this.batches.save(batch);
    return batch;
  }
}
