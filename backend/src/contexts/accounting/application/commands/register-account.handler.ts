import { Inject, Injectable } from "@nestjs/common";
import { Account } from "../../domain/account.aggregate";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";
import { DuplicateAccountCodeError } from "../../domain/errors";

export interface RegisterAccountCommand {
  code: string;
  name: string;
  accountType: string;
  parentAccountId?: string | null;
  branchId?: string | null;
  isSystemAccount?: boolean;
}

@Injectable()
export class RegisterAccountHandler {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort) {}

  async execute(command: RegisterAccountCommand): Promise<Account> {
    if (await this.accounts.existsByCode(command.code)) throw new DuplicateAccountCodeError(command.code);
    const account = Account.register(command);
    await this.accounts.save(account);
    return account;
  }
}
