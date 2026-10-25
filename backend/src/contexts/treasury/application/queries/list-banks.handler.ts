import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { Bank } from "../../domain/bank.aggregate";
import { BANK_REPOSITORY, type BankRepositoryPort } from "../../domain/ports/bank-repository.port";

@Injectable()
export class ListBanksHandler {
  constructor(@Inject(BANK_REPOSITORY) private readonly banks: BankRepositoryPort) {}

  execute(page?: PageRequest): Promise<{ rows: Bank[]; total: number }> {
    return this.banks.listPage(page);
  }
}
