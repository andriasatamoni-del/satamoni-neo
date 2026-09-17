import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Account } from "../../../accounting/domain/account.aggregate";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../../accounting/domain/ports/account-repository.port";
import { Treasury } from "../../domain/treasury.aggregate";
import { TREASURY_REPOSITORY, type TreasuryRepositoryPort } from "../../domain/ports/treasury-repository.port";
import { MainTreasuryAlreadyExistsError } from "../../domain/errors";

export interface RegisterTreasuryCommand {
  name: string;
  kind: string;
  branchId?: string | null;
}

// بينشئ الحساب المحاسبي الحامل للخزينة تلقائيًا (كود فريد مولّد، نوع ASSET) قبل ما ينشئ الخزينة نفسها -
// نفس فلسفة createBankAccountTreasury في الريبو القديم بالظبط (خزينة من غير حساب مالهاش معنى). بينادى
// تلقائيًا لما فرع جديد يتسجّل (BranchRegisteredEvent) - وكمان متاح كـendpoint يدوي للأدمن (POST
// /treasuries) عشان يقدر يوفّر خزينة رئيسية للفروع القديمة اللي اتستوردت من الريبو القديم (سكريبتات
// الاستيراد بتتخطى نشر الأحداث عمدًا، نفس فلسفة كل سكريبتات الاستيراد التانية في المشروع)
@Injectable()
export class RegisterTreasuryHandler {
  constructor(
    @Inject(TREASURY_REPOSITORY) private readonly treasuries: TreasuryRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async execute(command: RegisterTreasuryCommand): Promise<Treasury> {
    if (command.kind === "MAIN" && command.branchId) {
      const existing = await this.treasuries.list({ branchId: command.branchId });
      if (existing.some((t) => t.kind === "MAIN")) throw new MainTreasuryAlreadyExistsError();
    }

    const code = `${command.kind === "MAIN" ? "TRSY" : "BANK"}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const account = Account.register({ code, name: command.name, accountType: "ASSET", isSystemAccount: true });
    await this.accounts.save(account);

    const treasury = Treasury.register({ name: command.name, kind: command.kind, branchId: command.branchId, accountId: account.id });
    await this.treasuries.save(treasury);
    return treasury;
  }
}
