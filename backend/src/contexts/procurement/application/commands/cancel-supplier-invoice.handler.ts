import { Inject, Injectable } from "@nestjs/common";
import { SupplierInvoice } from "../../domain/supplier-invoice.aggregate";
import {
  SUPPLIER_INVOICE_REPOSITORY,
  type SupplierInvoiceRepositoryPort,
} from "../../domain/ports/supplier-invoice-repository.port";
import {
  SUPPLIER_PAYMENT_REPOSITORY,
  type SupplierPaymentRepositoryPort,
} from "../../domain/ports/supplier-payment-repository.port";
import { SupplierInvoiceNotFoundError } from "../../domain/errors";
import { ReverseJournalEntryHandler } from "../../../accounting/application/commands/reverse-journal-entry.handler";

export interface CancelSupplierInvoiceCommand {
  supplierInvoiceId: string;
  reason?: string | null;
  cancelledBy?: string | null;
}

@Injectable()
export class CancelSupplierInvoiceHandler {
  constructor(
    @Inject(SUPPLIER_INVOICE_REPOSITORY) private readonly invoices: SupplierInvoiceRepositoryPort,
    @Inject(SUPPLIER_PAYMENT_REPOSITORY) private readonly payments: SupplierPaymentRepositoryPort,
    private readonly reverseJournalEntry: ReverseJournalEntryHandler
  ) {}

  async execute(command: CancelSupplierInvoiceCommand): Promise<SupplierInvoice> {
    const invoice = await this.invoices.findById(command.supplierInvoiceId);
    if (!invoice) throw new SupplierInvoiceNotFoundError();

    const hasPayments = (await this.payments.countByInvoiceId(invoice.id)) > 0;
    invoice.cancel({ hasPayments, reason: command.reason, cancelledBy: command.cancelledBy ?? null });

    if (invoice.varianceJournalEntryId) {
      await this.reverseJournalEntry.execute({
        entryId: invoice.varianceJournalEntryId,
        reversedBy: command.cancelledBy,
        reason: `إلغاء فاتورة مورد - ${command.reason ?? ""}`,
      });
    }

    await this.invoices.save(invoice);
    return invoice;
  }
}
