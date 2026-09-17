import { IsIn, IsOptional, IsString } from "class-validator";

export class ReviewShiftVarianceDto {
  @IsIn(["approve", "acknowledge"])
  decision!: "approve" | "acknowledge";

  @IsOptional() @IsString() notes?: string;
}
