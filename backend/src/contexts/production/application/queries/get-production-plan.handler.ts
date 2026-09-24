import { Inject, Injectable } from "@nestjs/common";
import { INVENTORY_ITEM_REPOSITORY, type InventoryItemRepositoryPort } from "../../../inventory/domain/ports/inventory-item-repository.port";
import { STOCK_MOVEMENT_REPOSITORY, type StockMovementRepositoryPort } from "../../../inventory/domain/ports/stock-movement-repository.port";
import { TRANSFER_REQUEST_REPOSITORY, type TransferRequestRepositoryPort } from "../../../inventory/domain/ports/transfer-request-repository.port";
import { RECIPE_REPOSITORY, type RecipeRepositoryPort } from "../../../catalog/domain/ports/recipe-repository.port";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";

export interface GetProductionPlanQuery {
  ckBranchId: string;
  fromDate: Date;
  toDate: Date;
}

export interface ProductionPlanRow {
  inventoryItemId: string;
  itemName: string;
  unit: string;
  approvedDemand: number;
  pendingDemand: number;
  availableStock: number;
  plannedOrInProgress: number;
  requiredProduction: number;
  hasActiveRecipe: boolean;
  recipeId: string | null;
  recipeVersionId: string | null;
}

const ACTIVE_PRODUCTION_STATUSES = ["DRAFT", "APPROVED", "IN_PROGRESS"];
// نفس فلسفة COMMITTED_DEMAND_STATUSES في db/production-planning.js بالريبو القديم بالظبط: بس الطلبات
// المعتمدة (APPROVED) وقبل ما تتشحن فعليًا (DISPATCHED) - بمجرد ما الطلب يتشحن، أثره بالفعل انعكس في
// availableStock (رصيد السنتر كيتشن نقص فعليًا)، فمفيش داعي يتحسب تاني في الطلب. SUBMITTED (لسه معتمدش)
// استرشادي بس (pendingDemand)، مش داخل في حساب المطلوب تصنيعه
const APPROVED_DEMAND_STATUSES = ["APPROVED"];
const PENDING_DEMAND_STATUSES = ["SUBMITTED"];

// الخطة الكاملة لكل الأصناف المصنّعة/المعبأة (itemType='manufactured') في نافذة تغطية معيّنة - نفس منطق
// computeProductionPlan في db/production-planning.js بالريبو القديم بالظبط، بس فوق TransferRequest
// (بدل kitchen_orders) وConversionOrder (بدل production_orders+packaging_orders المنفصلين). المطلوب
// تصنيعه = max(0, المعتمد من فروع تانية - المتاح فعليًا عند السنتر كيتشن - تحت التنفيذ/مخطط بالفعل)
@Injectable()
export class GetProductionPlanHandler {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY) private readonly items: InventoryItemRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    @Inject(TRANSFER_REQUEST_REPOSITORY) private readonly transferRequests: TransferRequestRepositoryPort,
    @Inject(RECIPE_REPOSITORY) private readonly recipes: RecipeRepositoryPort,
    @Inject(CONVERSION_ORDER_REPOSITORY) private readonly conversionOrders: ConversionOrderRepositoryPort
  ) {}

  async execute(query: GetProductionPlanQuery): Promise<ProductionPlanRow[]> {
    const allItems = await this.items.list();
    const manufacturedItems = allItems.filter((i) => i.itemType === "manufactured");
    if (manufacturedItems.length === 0) return [];

    const requests = await this.transferRequests.list({ fromBranchId: query.ckBranchId });
    const inWindow = requests.filter((r) => {
      if (!r.requiredDate) return true;
      return r.requiredDate >= query.fromDate && r.requiredDate <= query.toDate;
    });

    const conversions = await this.conversionOrders.list({ branchId: query.ckBranchId });
    const activeConversions = conversions.filter((c) => ACTIVE_PRODUCTION_STATUSES.includes(c.status));

    const rows: ProductionPlanRow[] = [];
    for (const item of manufacturedItems) {
      let approvedDemand = 0;
      let pendingDemand = 0;
      for (const r of inWindow) {
        for (const line of r.lines) {
          if (line.inventoryItemId !== item.id) continue;
          if (APPROVED_DEMAND_STATUSES.includes(r.status)) approvedDemand += line.approvedQuantity ?? line.requestedQuantity;
          else if (PENDING_DEMAND_STATUSES.includes(r.status)) pendingDemand += line.requestedQuantity;
        }
      }

      const availableStock = await this.movements.getBalance(query.ckBranchId, item.id);
      const plannedOrInProgress = activeConversions
        .filter((c) => c.outputItemId === item.id)
        .reduce((sum, c) => sum + c.plannedOutputQuantity, 0);

      const requiredProduction = Math.max(0, approvedDemand - availableStock - plannedOrInProgress);
      const recipe = await this.recipes.findByInventoryItemId(item.id);
      const activeVersion = recipe?.activeVersion ?? null;

      rows.push({
        inventoryItemId: item.id,
        itemName: item.name,
        unit: item.unit,
        approvedDemand,
        pendingDemand,
        availableStock,
        plannedOrInProgress,
        requiredProduction,
        hasActiveRecipe: !!activeVersion,
        recipeId: recipe?.id ?? null,
        recipeVersionId: activeVersion?.id ?? null,
      });
    }
    return rows;
  }
}
