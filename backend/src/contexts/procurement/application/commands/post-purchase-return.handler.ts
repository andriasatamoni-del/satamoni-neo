import { Inject, Injectable, Logger } from "@nestjs/common";
import { PurchaseReturn } from "../../domain/purchase-return.aggregate";
import {
  PURCHASE_RETURN_REPOSITORY,
  type PurchaseReturnRepositoryPort,
} from "../../domain/ports/purchase-return-repository.port";
import { PurchaseReturnNotFoundError } from "../../domain/errors";
import {
  STOCK_MOVEMENT_REPOSITORY,
  type StockMovementRepositoryPort,
} from "../../../inventory/domain/ports/stock-movement-repository.port";
import { StockMovement } from "../../../inventory/domain/stock-movement.aggregate";
import { RegisterJournalEntryHandler } from "../../../accounting/application/commands/register-journal-entry.handler";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../../accounting/domain/ports/account-repository.port";

export interface PostPurchaseReturnCommand {
  purchaseReturnId: string;
  postedBy?: string | null;
}

const INVENTORY_ACCOUNT_CODE = "1400";
const ACCOUNTS_PAYABLE_ACCOUNT_CODE = "2100";

// عكس بالظبط لـConfirmGoodsReceiptHandler: نفس حركة المخزون (بس بالسالب، movementType مختلف) ونفس
// قيد المحاسبة (بس مقلوب: DR AP / CR المخزون بدل العكس) - البضاعة خرجت فعليًا للمورد، فسياسة الرصيد
// السالب هنا زي الريبو القديم بالظبط: allowNegativeBalance دايمًا true، مفيش اعتماد منفصل مطلوب
@Injectable()
export class PostPurchaseReturnHandler {
  private readonly logger = new Logger(PostPurchaseReturnHandler.name);

  constructor(
    @Inject(PURCHASE_RETURN_REPOSITORY) private readonly returns: PurchaseReturnRepositoryPort,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly movements: StockMovementRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort,
    private readonly registerJournalEntry: RegisterJournalEntryHandler
  ) {}

  async execute(command: PostPurchaseReturnCommand): Promise<PurchaseReturn> {
    const purchaseReturn = await this.returns.findById(command.purchaseReturnId);
    if (!purchaseReturn) throw new PurchaseReturnNotFoundError();

    const postedNow = purchaseReturn.post({ postedBy: command.postedBy ?? null });
    if (!postedNow) return purchaseReturn; // idempotent - كانت POSTED بالفعل

    for (const line of purchaseReturn.lines) {
      const movement = StockMovement.register({
        inventoryItemId: line.inventoryItemId,
        branchId: purchaseReturn.branchId,
        movementType: "RETURN_TO_SUPPLIER",
        quantityDelta: -line.quantity,
        referenceType: "purchase_return",
        referenceId: purchaseReturn.id,
        performedBy: command.postedBy,
      });
      await this.movements.recordMovement(movement, { allowNegativeBalance: true });
    }

    const totalCost = purchaseReturn.lines.reduce((sum, l) => sum + (l.lineValue ?? 0), 0);
    if (purchaseReturn.supplierId && totalCost > 0) {
      const inventoryAccount = await this.accounts.findByCode(INVENTORY_ACCOUNT_CODE);
      const apAccount = await this.accounts.findByCode(ACCOUNTS_PAYABLE_ACCOUNT_CODE);
      if (!inventoryAccount || !apAccount) {
        this.logger.warn(`تخطّي ترحيل قيد مرتجع المشتريات ${purchaseReturn.id} - دليل الحسابات لسه مش معدّ`);
      } else {
        const entry = await this.registerJournalEntry.execute({
          sourceType: "purchase_return",
          sourceId: purchaseReturn.id,
          branchId: purchaseReturn.branchId,
          description: `مرتجع مشتريات - ${purchaseReturn.reason}`,
          lines: [
            { accountId: apAccount.id, debit: totalCost, credit: 0, referenceType: "supplier", referenceId: purchaseReturn.supplierId },
            { accountId: inventoryAccount.id, debit: 0, credit: totalCost },
          ],
          createdBy: command.postedBy,
        });
        purchaseReturn.assignJournalEntry(entry.id);
      }
    }

    await this.returns.save(purchaseReturn);
    return purchaseReturn;
  }
}
