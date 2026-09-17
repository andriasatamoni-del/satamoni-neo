import { Inject, Injectable } from "@nestjs/common";
import { Bank } from "../../domain/bank.aggregate";
import { BANK_REPOSITORY, type BankRepositoryPort } from "../../domain/ports/bank-repository.port";

@Injectable()
export class RegisterBankHandler {
  constructor(@Inject(BANK_REPOSITORY) private readonly banks: BankRepositoryPort) {}

  async execute(command: { name: string }): Promise<Bank> {
    const bank = Bank.register(command);
    await this.banks.save(bank);
    return bank;
  }
}
