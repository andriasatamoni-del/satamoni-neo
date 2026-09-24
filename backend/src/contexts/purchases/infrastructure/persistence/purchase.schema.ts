import type { Generated } from "kysely";

export interface PurchasesTable {
  id: Generated<string>;
  branch_id: string;
  business_date: Date;
  category: string | null;
  amount: number;
  notes: string | null;
  supplier_id: string | null;
  supplier_document_number: string | null;
  status: string;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  posted_to_inventory: boolean;
  created_at: Generated<Date>;
}

export interface PurchaseLinesTable {
  id: Generated<string>;
  purchase_id: string;
  inventory_item_id: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
}
