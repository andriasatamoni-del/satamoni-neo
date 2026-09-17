import { IsDateString, IsOptional, IsString } from "class-validator";

export class RegisterLeaveRequestDto {
  @IsString() leaveType!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() reason?: string;
}
