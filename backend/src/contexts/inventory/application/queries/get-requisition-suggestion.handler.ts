import { Inject, Injectable } from "@nestjs/common";
import {
  REQUISITION_SUGGESTION_READER,
  type RequisitionSuggestionReaderPort,
} from "../../domain/ports/requisition-suggestion-reader.port";
import {
  CONSUMPTION_MOVEMENT_TYPES,
  DEFAULT_LOOKBACK_WEEKS,
  computeRequisitionLine,
  coverageWindow,
  lookbackDatesForWindow,
  type RequisitionSuggestionLine,
} from "../../domain/requisition-suggestion";

export interface GetRequisitionSuggestionQuery {
  branchId: string;
  targetDate: string;
  nextReplenishmentDate?: string | null;
  lookbackWeeks?: number;
}

export interface RequisitionSuggestion {
  branchId: string;
  targetDate: string;
  nextReplenishmentDate: string | null;
  lookbackWeeks: number;
  coverageDays: number;
  lines: RequisitionSuggestionLine[];
}

// معاينة بس - مفيش أي حاجة بتتسجّل. مدير الفرع بيراجع/يعدّل الكميات وبعدين يبعت طلب تحويل حقيقي
// (نفس فلسفة GET /kitchen-orders/suggested في الريبو القديم)
@Injectable()
export class GetRequisitionSuggestionHandler {
  constructor(@Inject(REQUISITION_SUGGESTION_READER) private readonly reader: RequisitionSuggestionReaderPort) {}

  async execute(query: GetRequisitionSuggestionQuery): Promise<RequisitionSuggestion> {
    const lookbackWeeks = query.lookbackWeeks ?? DEFAULT_LOOKBACK_WEEKS;
    const nextReplenishmentDate = query.nextReplenishmentDate ?? null;
    const window = coverageWindow(query.targetDate, nextReplenishmentDate);

    const items = await this.reader.listThresholdItems(query.branchId);
    const [consumption, pending, inTransit] = await Promise.all([
      this.reader.consumptionByDate(query.branchId, lookbackDatesForWindow(window, lookbackWeeks), CONSUMPTION_MOVEMENT_TYPES),
      this.reader.pendingPipelineQuantities(query.branchId),
      this.reader.inTransitQuantities(query.branchId),
    ]);

    const lines = items.map((item) =>
      computeRequisitionLine(
        {
          ...item,
          consumptionByDate: consumption.get(item.inventoryItemId) ?? new Map(),
          pendingPipelineQuantity: pending.get(item.inventoryItemId) ?? 0,
          inTransitQuantity: inTransit.get(item.inventoryItemId) ?? 0,
        },
        window,
        lookbackWeeks
      )
    );

    return {
      branchId: query.branchId,
      targetDate: query.targetDate,
      nextReplenishmentDate,
      lookbackWeeks,
      coverageDays: window.length,
      lines,
    };
  }
}
