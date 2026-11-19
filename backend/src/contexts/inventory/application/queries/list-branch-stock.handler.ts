import { Inject, Injectable } from "@nestjs/common";
import type { PageRequest } from "../../../../shared/http/list-query.dto";
import { BRANCH_STOCK_READER, type BranchStockFilter, type BranchStockReaderPort, type BranchStockRow } from "../../domain/ports/branch-stock-reader.port";

@Injectable()
export class ListBranchStockHandler {
  constructor(@Inject(BRANCH_STOCK_READER) private readonly reader: BranchStockReaderPort) {}

  async execute(filter: BranchStockFilter, page?: PageRequest): Promise<{ rows: BranchStockRow[]; total: number }> {
    return this.reader.list(filter, page);
  }
}
