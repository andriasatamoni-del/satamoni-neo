import { Inject, Injectable } from "@nestjs/common";
import { Bank } from "../../domain/bank.aggregate";
import { BANK_REPOSITORY, type BankRepositoryPort } from "../../domain/ports/bank-repository.port";

@Injectable()
export class ListBanksHandler {
  constructor(@Inject(BANK_REPOSITORY) private readonly banks: BankRepositoryPort) {}

  execute(): Promise<Bank[]> {
    return this.banks.list();
  }
}
