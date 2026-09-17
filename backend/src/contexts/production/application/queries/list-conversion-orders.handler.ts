import { Inject, Injectable } from "@nestjs/common";
import { ConversionOrder } from "../../domain/conversion-order.aggregate";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";

@Injectable()
export class ListConversionOrdersHandler {
  constructor(@Inject(CONVERSION_ORDER_REPOSITORY) private readonly conversionOrders: ConversionOrderRepositoryPort) {}

  async execute(filter?: { branchId?: string; status?: string }): Promise<ConversionOrder[]> {
    return this.conversionOrders.list(filter);
  }
}
