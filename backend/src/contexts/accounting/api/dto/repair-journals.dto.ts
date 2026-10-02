import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { ALL_GAP_KINDS } from "../../infrastructure/persistence/journal-coverage";

export class RepairJournalsDto {
  @IsOptional() @IsArray() @IsIn(ALL_GAP_KINDS, { each: true }) kinds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sourceIds?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(1000) limit?: number;
}
