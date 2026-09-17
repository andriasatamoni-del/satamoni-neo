import { Inject, Injectable } from "@nestjs/common";
import { Bank } from "../../domain/bank.aggregate";
import { BANK_REPOSITORY, type BankRepositoryPort } from "../../domain/ports/bank-repository.port";
import { BankNotFoundError } from "../../domain/errors";

export interface UpdateBankCommand {
  bankId: string;
  name?: string;
  isActive?: boolean;
}

@Injectable()
export class UpdateBankHandler {
  constructor(@Inject(BANK_REPOSITORY) private readonly banks: BankRepositoryPort) {}

  async execute(command: UpdateBankCommand): Promise<Bank> {
    const bank = await this.banks.findById(command.bankId);
    if (!bank) throw new BankNotFoundError();

    if (command.name !== undefined) bank.rename(command.name);
    if (command.isActive === true) bank.activate();
    if (command.isActive === false) bank.deactivate();

    await this.banks.save(bank);
    return bank;
  }
}
