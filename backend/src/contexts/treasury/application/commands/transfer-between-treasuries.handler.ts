import { Inject, Injectable } from "@nestjs/common";
import { RegisterJournalEntryHandler } from "../../../accounting/application/commands/register-journal-entry.handler";
import type { JournalEntry } from "../../../accounting/domain/journal-entry.aggregate";
import { TREASURY_REPOSITORY, type TreasuryRepositoryPort } from "../../domain/ports/treasury-repository.port";
import { InvalidTransferAmountError, SameTreasuryTransferError, TreasuryNotFoundError } from "../../domain/errors";

export interface TransferBetweenTreasuriesCommand {
  fromTreasuryId: string;
  toTreasuryId: string;
  amount: number;
  notes?: string | null;
  createdBy?: string | null;
}

@Injectable()
export class TransferBetweenTreasuriesHandler {
  constructor(
    @Inject(TREASURY_REPOSITORY) private readonly treasuries: TreasuryRepositoryPort,
    private readonly registerJournalEntry: RegisterJournalEntryHandler
  ) {}

  async execute(command: TransferBetweenTreasuriesCommand): Promise<JournalEntry> {
    if (command.fromTreasuryId === command.toTreasuryId) throw new SameTreasuryTransferError();
    if (!(command.amount > 0)) throw new InvalidTransferAmountError();

    const from = await this.treasuries.findById(command.fromTreasuryId);
    const to = await this.treasuries.findById(command.toTreasuryId);
    if (!from || !to) throw new TreasuryNotFoundError();

    return this.registerJournalEntry.execute({
      description: `تحويل من ${from.name} لـ${to.name}${command.notes ? " - " + command.notes : ""}`,
      sourceType: "treasury_transfer",
      sourceId: from.id,
      branchId: from.branchId ?? to.branchId,
      lines: [
        { accountId: to.accountId, debit: command.amount, credit: 0 },
        { accountId: from.accountId, debit: 0, credit: command.amount },
      ],
      createdBy: command.createdBy,
    });
  }
}
