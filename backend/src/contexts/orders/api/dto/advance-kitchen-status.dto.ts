import { IsIn } from "class-validator";
import { KITCHEN_STATUSES } from "../../domain/order.aggregate";

export class AdvanceKitchenStatusDto {
  @IsIn(KITCHEN_STATUSES) kitchenStatus!: string;
}
