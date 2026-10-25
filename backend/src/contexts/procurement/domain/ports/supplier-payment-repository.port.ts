import type { PageRequest } from "../../../../shared/http/list-query.dto";
import type { SupplierPayment } from "../supplier-payment.aggregate";

export interface SupplierPaymentRepositoryPort {
  save(payment: SupplierPayment): Promise<void>;
  findById(id: string): Promise<SupplierPayment | null>;
  listByInvoiceId(supplierInvoiceId: string): Promise<SupplierPayment[]>;
  sumByInvoiceId(supplierInvoiceId: string): Promise<number>;
  countByInvoiceId(supplierInvoiceId: string): Promise<number>;
  list(filter?: { supplierId?: string; branchId?: string }): Promise<SupplierPayment[]>;
  listPage(filter?: { supplierId?: string; branchId?: string }, page?: PageRequest): Promise<{ rows: SupplierPayment[]; total: number }>;
}

export const SUPPLIER_PAYMENT_REPOSITORY = Symbol("SUPPLIER_PAYMENT_REPOSITORY");
