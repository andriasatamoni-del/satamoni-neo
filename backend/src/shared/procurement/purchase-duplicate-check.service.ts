import { Inject, Injectable } from "@nestjs/common";
import type { Kysely } from "kysely";
import type { Database } from "../database/database.types";
import { KYSELY } from "../database/database.module";

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
// اعتماد عكسي هيعمل دورة استيراد)، الفحص هنا بيقرا الجدولين مباشرة بـKysely (زي الدالة المشتركة القديمة
// بالظبط) بدل ما يعدّي من repository ports أي واحد من الـcontext-ين. مش بيمنع تلقائيًا - بيتعرض على
// المستخدم صراحة ولازم acknowledgeDuplicate صريح قبل ما يكمل (نفس فلسفة blockers إنهاء خدمة الموظف)
@Injectable()
export class PurchaseDuplicateCheckService {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async findDuplicates(input: {
    supplierId: string;
    supplierDocumentNumber: string;
    branchId: string;
    excludePurchaseId?: string;
    excludeGoodsReceiptId?: string;
  }): Promise<DuplicatePurchaseMatch[]> {
    const doc = input.supplierDocumentNumber.trim();
    if (!doc) return [];

    let purchaseQuery = this.db
      .selectFrom("purchases")
      .select(["id", "business_date as date", "status"])
      .where("supplier_id", "=", input.supplierId)
      .where("supplier_document_number", "=", doc)
      .where("branch_id", "=", input.branchId)
      .where("status", "!=", "REJECTED");
    if (input.excludePurchaseId) purchaseQuery = purchaseQuery.where("id", "!=", input.excludePurchaseId);

    let grnQuery = this.db
      .selectFrom("goods_receipts")
      .select(["id", "created_at as date", "status"])
      .where("supplier_id", "=", input.supplierId)
      .where("supplier_document_number", "=", doc)
      .where("branch_id", "=", input.branchId);
    if (input.excludeGoodsReceiptId) grnQuery = grnQuery.where("id", "!=", input.excludeGoodsReceiptId);

    const [purchaseRows, grnRows] = await Promise.all([purchaseQuery.execute(), grnQuery.execute()]);

    return [
      ...purchaseRows.map((r) => ({ source: "purchase" as const, id: r.id, date: r.date, status: r.status })),
      ...grnRows.map((r) => ({ source: "goods_receipt" as const, id: r.id, date: r.date, status: r.status })),
    ];
  }
}
