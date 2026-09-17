import { Inject, Injectable } from "@nestjs/common";
import { SupplierInvoice } from "../../domain/supplier-invoice.aggregate";
import { SupplierPayment } from "../../domain/supplier-payment.aggregate";
import {
  SUPPLIER_INVOICE_REPOSITORY,
  type SupplierInvoiceRepositoryPort,
} from "../../domain/ports/supplier-invoice-repository.port";
import {
  SUPPLIER_PAYMENT_REPOSITORY,
  type SupplierPaymentRepositoryPort,
} from "../../domain/ports/supplier-payment-repository.port";
import { SupplierInvoiceNotFoundError } from "../../domain/errors";

@Injectable()
export class GetSupplierInvoiceHandler {
  constructor(
    @Inject(SUPPLIER_INVOICE_REPOSITORY) private readonly invoices: SupplierInvoiceRepositoryPort,
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepositoryPort
  ) {}

  async execute(supplierInvoiceId: string): Promise<{ invoice: SupplierInvoice; payments: SupplierPayment[] }> {
    const invoice = await this.invoices.findById(supplierInvoiceId);
    if (!invoice) throw new SupplierInvoiceNotFoundError();
    const payments = await this.payments.listByInvoiceId(supplierInvoiceId);
    return { invoice, payments };
  }
}
