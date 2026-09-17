import { Inject, Injectable } from "@nestjs/common";
import { SupplierInvoice } from "../../domain/supplier-invoice.aggregate";
import {
  SUPPLIER_INVOICE_REPOSITORY,
  type SupplierInvoiceRepositoryPort,
} from "../../domain/ports/supplier-invoice-repository.port";

@Injectable()
export class ListSupplierInvoicesHandler {
  constructor(@Inject(SUPPLIER_INVOICE_REPOSITORY) private readonly invoices: SupplierInvoiceRepositoryPort) {}

  execute(filter?: { supplierId?: string; branchId?: string; status?: string }): Promise<SupplierInvoice[]> {
    return this.invoices.list(filter);
  }
}
