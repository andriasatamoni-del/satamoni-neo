import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { Account } from "../../domain/account.aggregate";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../domain/ports/account-repository.port";

@Injectable()
export class ListAccountsHandler {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort) {}

  async execute(page?: PageRequest): Promise<{ rows: Account[]; total: number }> {
    return this.accounts.listPage(page);
  }
}
