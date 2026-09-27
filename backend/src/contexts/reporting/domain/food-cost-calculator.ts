// محرك تصنيف الاستهلاك وتكلفة الطعام - نسخة neo من db/food-cost-engine.js بالريبو القديم، بس مبنية
// على معمارية neo الفعلية بدل تخمين نفس الجداول القديمة. الفرق الجوهري: في neo، حركة CONSUMPTION
// (استهلاك بيع) وPRODUCTION_OUT (استهلاك تصنيع) بيتسجّلوا بالكمية النظرية من الوصفة بالظبط - مفيش
// batch-level استهلاك فعلي مختلف عن الوصفة (راجع مقارنة الفيتشرز في التقرير: batch traceability لسه
// مش مبني). يعني التكلفة "النظرية" و"الفعلية" لحركات البيع/التصنيع نفسها متطابقتين دايمًا بالتعريف -
// أي فرق (variance) حقيقي بييجي بس من حركات التصحيح: ADJUSTMENT (عكس إلغاء أوردر، أو تسجيل يدوي)،
// STOCK_COUNT (فرق الجرد الفعلي)، وPRODUCTION_REVERSAL (عكس إلغاء أمر تصنيع).
//
// قرار نطاق موثّق: مفيش نوع حركة WASTE/DAMAGE/EXPIRY مستقل في neo لسه (الريبو القديم عنده). أي هالك
// فعلي لازم يتسجل يدويًا كـADJUSTMENT سالب لحد ما فيتشر تسجيل هالك مخصّص يتبني - التقرير مبيميزوش
// هالك عن أي تصحيح يدوي تاني حاليًا.

export type UsageAdjustmentMovementType = "ADJUSTMENT" | "STOCK_COUNT" | "PRODUCTION_REVERSAL";
export type TheoreticalMovementType = "CONSUMPTION" | "PRODUCTION_OUT";

export const USAGE_ADJUSTMENT_TYPES: UsageAdjustmentMovementType[] = ["ADJUSTMENT", "STOCK_COUNT", "PRODUCTION_REVERSAL"];
export const THEORETICAL_TYPES: TheoreticalMovementType[] = ["CONSUMPTION", "PRODUCTION_OUT"];

export interface MovementCostRow {
  movementType: string;
  quantityDelta: number;
  totalCost: number | null;
}

export interface FoodCostBucket {
  theoreticalCost: number;
  theoreticalIncomplete: boolean;
  usageAdjustmentCost: number;
  usageAdjustmentIncomplete: boolean;
  actualUsageCost: number;
  variance: number;
  variancePercent: number | null;
}

// حركة تصحيح (ADJUSTMENT/STOCK_COUNT/PRODUCTION_REVERSAL): كمية سالبة = خروج فعلي من المخزون (هالك/عجز
// جرد) بيزوّد التكلفة الفعلية فوق النظري؛ كمية موجبة = رجوع للمخزون (عكس إلغاء أوردر/أمر تصنيع، أو زيادة
// جرد) بينقص التكلفة الفعلية تحت النظري. بالتالي إشارة مساهمتها في variance = عكس إشارة الكمية.
function signedAdjustmentCost(row: MovementCostRow): number {
  const cost = row.totalCost ?? 0;
  return row.quantityDelta < 0 ? cost : -cost;
}

export function computeFoodCostBucket(rows: MovementCostRow[]): FoodCostBucket {
  let theoreticalCost = 0;
  let theoreticalIncomplete = false;
  let usageAdjustmentCost = 0;
  let usageAdjustmentIncomplete = false;

  for (const row of rows) {
    if ((THEORETICAL_TYPES as string[]).includes(row.movementType)) {
      if (row.totalCost === null) theoreticalIncomplete = true;
      else theoreticalCost += row.totalCost;
    } else if ((USAGE_ADJUSTMENT_TYPES as string[]).includes(row.movementType)) {
      if (row.totalCost === null) usageAdjustmentIncomplete = true;
      else usageAdjustmentCost += signedAdjustmentCost(row);
    }
    // أنواع تانية (RECEIPT/TRANSFER_*/RETURN_TO_SUPPLIER/OPENING_BALANCE/PRODUCTION_IN) مستبعدة عمدًا -
    // زيادة مخزون أو نقل قيمة، مش استهلاك تشغيلي (نفس تعريف USAGE_CATEGORIES بالريبو القديم بالظبط)
  }

  const actualUsageCost = theoreticalCost + usageAdjustmentCost;
  const variance = usageAdjustmentCost;
  const variancePercent = theoreticalCost !== 0 ? (variance / theoreticalCost) * 100 : null;

  return {
    theoreticalCost,
    theoreticalIncomplete,
    usageAdjustmentCost,
    usageAdjustmentIncomplete,
    actualUsageCost,
    variance,
    variancePercent,
  };
}
