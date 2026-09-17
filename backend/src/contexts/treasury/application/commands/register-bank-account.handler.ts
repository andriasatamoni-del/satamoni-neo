import { Inject, Injectable } from "@nestjs/common";
import { BankAccount } from "../../domain/bank-account.aggregate";
import { BANK_ACCOUNT_REPOSITORY, type BankAccountRepositoryPort } from "../../domain/ports/bank-account-repository.port";
import { BANK_REPOSITORY, type BankRepositoryPort } from "../../domain/ports/bank-repository.port";
import { BankNotFoundError } from "../../domain/errors";
import { RegisterTreasuryHandler } from "./register-treasury.handler";

export interface RegisterBankAccountCommand {
  bankId: string;
  name: string; // اسم الخزينة/الحساب المحاسبي الحامل (مش بالضرورة نفس اسم البنك - زي "بنك مصر - فرع الجيزة")
  accountNumber?: string | null;
  iban?: string | null;
  bankBranchName?: string | null;
  notes?: string | null;
  branchId?: string | null;
}

@Injectable()
export class RegisterBankAccountHandler {
  constructor(
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly bankAccounts: BankAccountRepositoryPort,
    @Inject(BANK_REPOSITORY) private readonly banks: BankRepositoryPort,
    private readonly registerTreasury: RegisterTreasuryHandler
  ) {}

  async execute(command: RegisterBankAccountCommand): Promise<BankAccount> {
    const bank = await this.banks.findById(command.bankId);
    if (!bank) throw new BankNotFoundError();

    const treasury = await this.registerTreasury.execute({ name: command.name, kind: "BANK", branchId: command.branchId });

    const bankAccount = BankAccount.register({
      bankId: command.bankId,
      treasuryId: treasury.id,
      accountNumber: command.accountNumber,
      iban: command.iban,
      bankBranchName: command.bankBranchName,
      notes: command.notes,
    });
    await this.bankAccounts.save(bankAccount);
    return bankAccount;
  }
}
