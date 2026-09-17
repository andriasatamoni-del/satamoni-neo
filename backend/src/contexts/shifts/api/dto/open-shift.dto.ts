import { IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class OpenShiftDto {
  @IsOptional() @IsUUID() branchId?: string;

  @IsNumber()
  @Min(0)
  openingCash!: number;

  @IsOptional() @IsString() openingNotes?: string;
}
