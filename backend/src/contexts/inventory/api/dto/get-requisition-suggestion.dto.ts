import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from "class-validator";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class GetRequisitionSuggestionDto {
  @IsUUID() branchId!: string;
  @Matches(ISO_DATE, { message: "targetDate لازم يكون بصيغة YYYY-MM-DD" }) targetDate!: string;
  @IsOptional() @Matches(ISO_DATE, { message: "nextReplenishmentDate لازم يكون بصيغة YYYY-MM-DD" }) nextReplenishmentDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(26) lookbackWeeks?: number;
}
