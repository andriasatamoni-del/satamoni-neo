import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { SupplierInvoice } from "../../domain/supplier-invoice.aggregate";
import {
  SUPPLIER_INVOICE_REPOSITORY,
  type SupplierInvoiceRepositoryPort,
} from "../../domain/ports/supplier-invoice-repository.port";

@Injectable()
export class ListSupplierInvoicesHandler {
  constructor(@Inject(SUPPLIER_INVOICE_REPOSITORY) private readonly invoices: SupplierInvoiceRepositoryPort) {}

  execute(filter?: { supplierId?: string; branchId?: string; status?: string }, page?: PageRequest): Promise<{ rows: SupplierInvoice[]; total: number }> {
    return this.invoices.listPage(filter, page);
  }
}
