import { IsUUID } from "class-validator";

export class CheckInEmployeeDto {
  @IsUUID() branchId!: string;
}
