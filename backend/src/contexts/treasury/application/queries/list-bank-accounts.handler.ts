import { Inject, Injectable } from "@nestjs/common";
import { BANK_ACCOUNT_REPOSITORY, type BankAccountRepositoryPort } from "../../domain/ports/bank-account-repository.port";
import { BANK_REPOSITORY, type BankRepositoryPort } from "../../domain/ports/bank-repository.port";
import { TREASURY_REPOSITORY, type TreasuryRepositoryPort } from "../../domain/ports/treasury-repository.port";
import { TREASURY_BALANCE_READER, type TreasuryBalanceReaderPort } from "../../domain/ports/treasury-balance-reader.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../../accounting/domain/ports/account-repository.port";

export interface BankAccountWithBalance {
  id: string;
  bankId: string;
  bankName: string;
  treasuryId: string;
  accountCode: string;
  accountNumber: string | null;
  iban: string | null;
  bankBranchName: string | null;
  notes: string | null;
  isActive: boolean;
  balance: number;
}

@Injectable()
export class ListBankAccountsHandler {
  constructor(
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly bankAccounts: BankAccountRepositoryPort,
    @Inject(BANK_REPOSITORY) private readonly banks: BankRepositoryPort,
    @Inject(TREASURY_REPOSITORY) private readonly treasuries: TreasuryRepositoryPort,
    @Inject(TREASURY_BALANCE_READER) private readonly balanceReader: TreasuryBalanceReaderPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async execute(): Promise<BankAccountWithBalance[]> {
    const bankAccounts = await this.bankAccounts.list();
    const banks = await this.banks.list();
    const bankNameById = new Map(banks.map((b) => [b.id, b.name]));

    const result: BankAccountWithBalance[] = [];
    for (const ba of bankAccounts) {
      const treasury = await this.treasuries.findById(ba.treasuryId);
      if (!treasury) continue;
      const account = await this.accounts.findById(treasury.accountId);
      const balances = await this.balanceReader.getBalances([treasury.accountId]);
      result.push({
        id: ba.id, bankId: ba.bankId, bankName: bankNameById.get(ba.bankId) ?? "",
        treasuryId: ba.treasuryId, accountCode: account?.code ?? "",
        accountNumber: ba.accountNumber, iban: ba.iban, bankBranchName: ba.bankBranchName,
        notes: ba.notes, isActive: ba.isActive, balance: balances.get(treasury.accountId) ?? 0,
      });
    }
    return result;
  }
}
