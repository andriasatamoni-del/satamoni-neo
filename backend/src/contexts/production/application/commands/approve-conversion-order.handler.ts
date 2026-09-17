import { Inject, Injectable } from "@nestjs/common";
import { ConversionOrder } from "../../domain/conversion-order.aggregate";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";
import { ConversionOrderNotFoundError } from "../../domain/errors";

export interface ApproveConversionOrderCommand {
  conversionOrderId: string;
  approvedBy: string | null;
}

@Injectable()
export class ApproveConversionOrderHandler {
  constructor(@Inject(CONVERSION_ORDER_REPOSITORY) private readonly conversionOrders: ConversionOrderRepositoryPort) {}

  async execute(command: ApproveConversionOrderCommand): Promise<ConversionOrder> {
    const order = await this.conversionOrders.findById(command.conversionOrderId);
    if (!order) throw new ConversionOrderNotFoundError();
    order.approve(command.approvedBy);
    await this.conversionOrders.save(order);
    return order;
  }
}
