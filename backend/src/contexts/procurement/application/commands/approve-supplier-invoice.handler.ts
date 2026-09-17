import { Inject, Injectable, Logger } from "@nestjs/common";
import { SupplierInvoice } from "../../domain/supplier-invoice.aggregate";
import {
  SUPPLIER_INVOICE_REPOSITORY,
  type SupplierInvoiceRepositoryPort,
} from "../../domain/ports/supplier-invoice-repository.port";
import { SupplierInvoiceNotFoundError } from "../../domain/errors";
import { RegisterJournalEntryHandler } from "../../../accounting/application/commands/register-journal-entry.handler";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../../accounting/domain/ports/account-repository.port";

const VARIANCE_TOLERANCE = 0.0000001;
const INVENTORY_ACCOUNT_CODE = "1400";
const ACCOUNTS_PAYABLE_ACCOUNT_CODE = "2100";

export interface ApproveSupplierInvoiceCommand {
  supplierInvoiceId: string;
  approvedBy?: string | null;
}

// بيرحّل قيد الفرق بس (لو موجود) ويحوّل الحالة لـAPPROVED - نفس فلسفة الريبو القديم بالظبط: اعتماد
// فاتورة فيها فرق قرار واعي، مش تلقائي أبدًا (مفيش موافقة تلقائية على فرق)
@Injectable()
export class ApproveSupplierInvoiceHandler {
  private readonly logger = new Logger(ApproveSupplierInvoiceHandler.name);

  constructor(
    @Inject(SUPPLIER_INVOICE_REPOSITORY) private readonly invoices: SupplierInvoiceRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly registerJournalEntry: RegisterJournalEntryHandler
  ) {}

  async execute(command: ApproveSupplierInvoiceCommand): Promise<SupplierInvoice> {
    const invoice = await this.invoices.findById(command.supplierInvoiceId);
    if (!invoice) throw new SupplierInvoiceNotFoundError();

    const wasApprovedNow = invoice.approve({ approvedBy: command.approvedBy ?? null });
    if (!wasApprovedNow) return invoice; // idempotent - كانت معتمدة بالفعل

    if (Math.abs(invoice.varianceAmount) > VARIANCE_TOLERANCE) {
      const inventoryAccount = await this.accounts.findByCode(INVENTORY_ACCOUNT_CODE);
      const apAccount = await this.accounts.findByCode(ACCOUNTS_PAYABLE_ACCOUNT_CODE);
      if (!inventoryAccount || !apAccount) {
        this.logger.warn(`تخطّي ترحيل قيد فرق فاتورة المورد ${invoice.id} - دليل الحسابات لسه مش معدّ`);
      } else {
        const variance = invoice.varianceAmount;
        const lines = variance > 0
          ? [
              { accountId: inventoryAccount.id, debit: variance, credit: 0 },
              { accountId: apAccount.id, debit: 0, credit: variance, referenceType: "supplier", referenceId: invoice.supplierId },
            ]
          : [
              { accountId: apAccount.id, debit: -variance, credit: 0, referenceType: "supplier", referenceId: invoice.supplierId },
              { accountId: inventoryAccount.id, debit: 0, credit: -variance },
            ];
        const entry = await this.registerJournalEntry.execute({
          sourceType: "supplier_invoice_variance",
          sourceId: invoice.id,
          branchId: invoice.branchId,
          description: `فرق فاتورة مورد #${invoice.supplierInvoiceNumber}`,
          lines,
          createdBy: command.approvedBy,
        });
        invoice.assignVarianceJournalEntry(entry.id);
      }
    }

    await this.invoices.save(invoice);
    return invoice;
  }
}
