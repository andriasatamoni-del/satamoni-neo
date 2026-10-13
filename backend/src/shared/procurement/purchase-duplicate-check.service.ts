import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ne } from "drizzle-orm";
import { DATABASE, type Database } from "../database/database.token";
import { goodsReceipts } from "../../contexts/procurement/infrastructure/persistence/procurement.tables";
import { purchases } from "../../contexts/purchases/infrastructure/persistence/purchases.tables";

export interface DuplicatePurchaseMatch {
  source: "purchase" | "goods_receipt";
  id: string;
  date: Date;
  status: string;
}

// SAFE-1: نفس فكرة db/purchase-duplicate-check.js بالريبو القديم بالحرف - المشترى النقدي السريع
// (contexts/purchases) وGRN الرسمي (contexts/procurement) مسارين مستقلين تمامًا بيقدروا يرحّلوا نفس
// فاتورة التوريد الحقيقية مرتين (كل واحد بمخزون+قيد محاسبي منفصل بالكامل). عشان الـcontext-ين محتاجين
// يفحصوا مقابل بعض من غير أي منهم يعتمد على الـmodule التاني (purchases بيعتمد على procurement أصلًا -
// اعتماد عكسي هيعمل دورة استيراد)، الفحص هنا بيقرا الجدولين مباشرة (زي الدالة المشتركة القديمة
// بالظبط) بدل ما يعدّي من repository ports أي واحد من الـcontext-ين. مش بيمنع تلقائيًا - بيتعرض على
// المستخدم صراحة ولازم acknowledgeDuplicate صريح قبل ما يكمل (نفس فلسفة blockers إنهاء خدمة الموظف)
@Injectable()
export class PurchaseDuplicateCheckService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findDuplicates(input: {
    supplierId: string;
    supplierDocumentNumber: string;
    branchId: string;
    excludePurchaseId?: string;
    excludeGoodsReceiptId?: string;
  }): Promise<DuplicatePurchaseMatch[]> {
    const doc = input.supplierDocumentNumber.trim();
    if (!doc) return [];

    const [purchaseRows, grnRows] = await Promise.all([
      this.db
        .select({ id: purchases.id, date: purchases.business_date, status: purchases.status })
        .from(purchases)
        .where(
          and(
            eq(purchases.supplier_id, input.supplierId),
            eq(purchases.supplier_document_number, doc),
            eq(purchases.branch_id, input.branchId),
            ne(purchases.status, "REJECTED"),
            input.excludePurchaseId ? ne(purchases.id, input.excludePurchaseId) : undefined
          )
        ),
      this.db
        .select({ id: goodsReceipts.id, date: goodsReceipts.created_at, status: goodsReceipts.status })
        .from(goodsReceipts)
        .where(
          and(
            eq(goodsReceipts.supplier_id, input.supplierId),
            eq(goodsReceipts.supplier_document_number, doc),
            eq(goodsReceipts.branch_id, input.branchId),
            input.excludeGoodsReceiptId ? ne(goodsReceipts.id, input.excludeGoodsReceiptId) : undefined
          )
        ),
    ]);

    return [
      ...purchaseRows.map((r) => ({ source: "purchase" as const, id: r.id, date: r.date, status: r.status })),
      ...grnRows.map((r) => ({ source: "goods_receipt" as const, id: r.id, date: r.date, status: r.status })),
    ];
  }
}
