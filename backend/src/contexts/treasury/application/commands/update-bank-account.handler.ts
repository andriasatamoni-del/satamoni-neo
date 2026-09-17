import { Inject, Injectable } from "@nestjs/common";
import { BankAccount } from "../../domain/bank-account.aggregate";
import { BANK_ACCOUNT_REPOSITORY, type BankAccountRepositoryPort } from "../../domain/ports/bank-account-repository.port";
import { BankAccountNotFoundError } from "../../domain/errors";

export interface UpdateBankAccountCommand {
  bankAccountId: string;
  accountNumber?: string | null;
  iban?: string | null;
  bankBranchName?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

@Injectable()
export class UpdateBankAccountHandler {
  constructor(@Inject(BANK_ACCOUNT_REPOSITORY) private readonly bankAccounts: BankAccountRepositoryPort) {}

  async execute(command: UpdateBankAccountCommand): Promise<BankAccount> {
    const bankAccount = await this.bankAccounts.findById(command.bankAccountId);
    if (!bankAccount) throw new BankAccountNotFoundError();

    bankAccount.updateDetails(command);
    await this.bankAccounts.save(bankAccount);
    return bankAccount;
  }
}
