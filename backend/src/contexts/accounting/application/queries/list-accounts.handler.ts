import { Inject, Injectable } from "@nestjs/common";
import { Account } from "../../domain/account.aggregate";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";

@Injectable()
export class ListAccountsHandler {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort) {}

  async execute(): Promise<Account[]> {
    return this.accounts.list();
  }
}
