import { Inject, Injectable } from "@nestjs/common";
import { TREASURY_REPOSITORY, type TreasuryRepositoryPort } from "../../domain/ports/treasury-repository.port";
import { TREASURY_BALANCE_READER, type TreasuryBalanceReaderPort } from "../../domain/ports/treasury-balance-reader.port";
import { ACCOUNT_REPOSITORY, type AccountRepositoryPort } from "../../../accounting/domain/ports/account-repository.port";

export interface TreasuryWithBalance {
  id: string;
  name: string;
  kind: string;
  branchId: string | null;
  accountId: string;
  accountCode: string;
  balance: number;
}

@Injectable()
export class ListTreasuriesHandler {
  constructor(
    @Inject(TREASURY_REPOSITORY) private readonly treasuries: TreasuryRepositoryPort,
    @Inject(TREASURY_BALANCE_READER) private readonly balanceReader: TreasuryBalanceReaderPort,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepositoryPort
  ) {}

  async execute(filter?: { branchId?: string }): Promise<TreasuryWithBalance[]> {
    const treasuries = await this.treasuries.list(filter);
    const balances = await this.balanceReader.getBalances(treasuries.map((t) => t.accountId));

    const result: TreasuryWithBalance[] = [];
    for (const t of treasuries) {
      const account = await this.accounts.findById(t.accountId);
      result.push({
        id: t.id, name: t.name, kind: t.kind, branchId: t.branchId, accountId: t.accountId,
        accountCode: account?.code ?? "", balance: balances.get(t.accountId) ?? 0,
      });
    }
    return result;
  }
}
