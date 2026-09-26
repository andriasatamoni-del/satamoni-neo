import { Inject, Injectable } from "@nestjs/common";
import { TalabatOrder } from "../../domain/talabat-order.aggregate";
import { TALABAT_ORDER_REPOSITORY, type TalabatOrderRepositoryPort } from "../../domain/ports/talabat-order-repository.port";

@Injectable()
export class ListTalabatOrdersHandler {
  constructor(@Inject(TALABAT_ORDER_REPOSITORY) private readonly talabatOrders: TalabatOrderRepositoryPort) {}

  async execute(filter?: { branchId?: string; status?: string; from?: Date; to?: Date }): Promise<TalabatOrder[]> {
    return this.talabatOrders.list(filter);
  }
}
