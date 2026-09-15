import { IsIn, IsOptional, IsString } from "class-validator";

const COMPLAINT_STATUSES = ["open", "in_progress", "resolved"];

export class UpdateComplaintStatusDto {
  @IsOptional()
  @IsIn(COMPLAINT_STATUSES, { message: "حالة الشكوى دي مش معروفة" })
  status?: string;

  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}
