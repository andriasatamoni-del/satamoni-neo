import type { SupplierInvoice } from "../supplier-invoice.aggregate";

export interface SupplierInvoiceRepositoryPort {
  save(invoice: SupplierInvoice): Promise<void>;
  findById(id: string): Promise<SupplierInvoice | null>;
  existsBySupplierAndNumber(supplierId: string, supplierInvoiceNumber: string): Promise<boolean>;
  list(filter?: { supplierId?: string; branchId?: string; status?: string }): Promise<SupplierInvoice[]>;
}

export const SUPPLIER_INVOICE_REPOSITORY = Symbol("SUPPLIER_INVOICE_REPOSITORY");
