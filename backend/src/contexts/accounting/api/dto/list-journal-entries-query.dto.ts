import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { BranchListQueryDto } from "../../../../shared/http/list-query.dto";
import { JOURNAL_ENTRY_STATUSES } from "../../domain/journal-entry.aggregate";

export class ListJournalEntriesQueryDto extends BranchListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sourceType?: string;

  @IsOptional()
  @IsIn(JOURNAL_ENTRY_STATUSES)
  status?: string;
}
