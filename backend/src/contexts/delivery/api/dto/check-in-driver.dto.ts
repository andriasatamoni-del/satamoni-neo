import { IsUUID } from "class-validator";

export class CheckInDriverDto {
  @IsUUID() driverId!: string;
  @IsUUID() branchId!: string;
}
