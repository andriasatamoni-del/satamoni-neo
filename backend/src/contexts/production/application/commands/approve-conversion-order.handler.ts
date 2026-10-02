import { Inject, Injectable } from "@nestjs/common";
import { ConversionOrder } from "../../domain/conversion-order.aggregate";
import { CONVERSION_ORDER_REPOSITORY, type ConversionOrderRepositoryPort } from "../../domain/ports/conversion-order-repository.port";
import { ConversionOrderNotFoundError } from "../../domain/errors";
import { TransactionService } from "../../../../shared/database/transaction-context";

export interface ApproveConversionOrderCommand {
  conversionOrderId: string;
  approvedBy: string | null;
}

@Injectable()
export class ApproveConversionOrderHandler {
  constructor(
    @Inject(CONVERSION_ORDER_REPOSITORY) private readonly conversionOrders: ConversionOrderRepositoryPort,
    private readonly tx: TransactionService
  ) {}

  async execute(command: ApproveConversionOrderCommand): Promise<ConversionOrder> {
    return this.tx.run(async () => {
      if (!(await this.tx.lockRow("conversion_orders", command.conversionOrderId))) throw new ConversionOrderNotFoundError();
      const order = await this.conversionOrders.findById(command.conversionOrderId);
      if (!order) throw new ConversionOrderNotFoundError();
      order.approve(command.approvedBy);
      await this.conversionOrders.save(order);
      return order;
    });
  }
}
