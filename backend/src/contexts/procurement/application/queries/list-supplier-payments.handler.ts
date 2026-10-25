import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { SupplierPayment } from "../../domain/supplier-payment.aggregate";
import {
  SUPPLIER_PAYMENT_REPOSITORY,
  type SupplierPaymentRepositoryPort,
} from "../../domain/ports/supplier-payment-repository.port";

@Injectable()
export class ListSupplierPaymentsHandler {
  constructor(@Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepositoryPort) {}

  execute(filter?: { supplierId?: string; branchId?: string }, page?: PageRequest): Promise<{ rows: SupplierPayment[]; total: number }> {
    return this.payments.listPage(filter, page);
  }
}
