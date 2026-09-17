import { Inject, Injectable } from "@nestjs/common";
import { SUPPLIER_BALANCE_READER, type SupplierBalanceReaderPort } from "../../domain/ports/supplier-balance-reader.port";

@Injectable()
export class GetSupplierBalanceHandler {
  constructor(@Inject(SUPPLIER_BALANCE_READER) private readonly reader: SupplierBalanceReaderPort) {}

  execute(supplierId: string): Promise<number> {
    return this.reader.getBalance(supplierId);
  }
}
