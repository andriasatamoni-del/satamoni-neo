import { Inject, Injectable } from "@nestjs/common";
import { ConversionOrder } from "../../domain/conversion-order.aggregate";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";
import { ConversionOrderNotFoundError } from "../../domain/errors";

@Injectable()
export class GetConversionOrderHandler {
  constructor(@Inject(CONVERSION_ORDER_REPOSITORY) private readonly conversionOrders: ConversionOrderRepositoryPort) {}

  async execute(id: string): Promise<ConversionOrder> {
    const order = await this.conversionOrders.findById(id);
    if (!order) throw new ConversionOrderNotFoundError();
    return order;
  }
}
