import { IsOptional, IsString } from "class-validator";

export class ReverseJournalEntryDto {
  @IsOptional() @IsString() reason?: string;
}
