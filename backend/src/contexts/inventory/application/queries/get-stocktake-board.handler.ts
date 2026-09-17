import { Inject, Injectable } from "@nestjs/common";
import {
  INVENTORY_ITEM_REPOSITORY,
  type InventoryItemRepositoryPort,
} from "../../domain/ports/inventory-item-repository.port";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../domain/ports/stock-movement-repository.port";

export interface StocktakeBoardRow {
  inventoryItemId: string;
  name: string;
  unit: string;
  unitCost: number | null;
  systemQuantity: number;
}

// نفس GET /api/stocktake/board في الريبو القديم بالظبط - كل الأصناف مع رصيد الفرع الحالي، عشان شاشة
// إدخال الجرد تعرضها كلها من غير ما تحتاج طلب منفصل لكل صنف
@Injectable()
export class GetStocktakeBoardHandler {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly inventoryItems: InventoryItemRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort
  ) {}

  async execute(branchId: string): Promise<StocktakeBoardRow[]> {
    const items = await this.inventoryItems.list();
    const rows: StocktakeBoardRow[] = [];
    for (const item of items) {
      const systemQuantity = await this.movements.getBalance(branchId, item.id);
      rows.push({ inventoryItemId: item.id, name: item.name, unit: item.unit, unitCost: item.unitCost, systemQuantity });
    }
    return rows;
  }
}
