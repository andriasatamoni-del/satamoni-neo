import { IsIn, IsOptional, IsString } from "class-validator";

export class ReviewDriverSettlementDto {
  @IsIn(["approve", "acknowledge"]) decision!: "approve" | "acknowledge";
  @IsOptional() @IsString() notes?: string;
}
