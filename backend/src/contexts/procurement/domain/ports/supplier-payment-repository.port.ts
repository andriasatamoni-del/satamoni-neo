import type { SupplierPayment } from "../supplier-payment.aggregate";

export interface SupplierPaymentRepositoryPort {
  save(payment: SupplierPayment): Promise<void>;
  findById(id: string): Promise<SupplierPayment | null>;
  listByInvoiceId(supplierInvoiceId: string): Promise<SupplierPayment[]>;
  sumByInvoiceId(supplierInvoiceId: string): Promise<number>;
  countByInvoiceId(supplierInvoiceId: string): Promise<number>;
  list(filter?: { supplierId?: string; branchId?: string }): Promise<SupplierPayment[]>;
}

export const SUPPLIER_PAYMENT_REPOSITORY = Symbol("SUPPLIER_PAYMENT_REPOSITORY");
