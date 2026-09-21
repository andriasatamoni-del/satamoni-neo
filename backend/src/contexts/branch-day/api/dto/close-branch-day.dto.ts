import { IsOptional, IsString } from "class-validator";

export class CloseBranchDayDto {
  @IsOptional() @IsString() businessDate?: string;
  @IsOptional() @IsString() managerNotes?: string;
}
