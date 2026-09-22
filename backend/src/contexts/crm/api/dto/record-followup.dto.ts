import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, ValidateIf, ValidateNested } from "class-validator";

const CALL_RESULTS = ["answered", "no_answer", "no_answer_after_3_tries"];
const SATISFACTION_RATINGS = ["excellent", "good", "average", "bad"];
const COMPLAINT_CATEGORIES = ["late_order", "wrong_item", "quality", "other"];
const COMPLAINT_STATUSES = ["open", "in_progress", "resolved"];

export class ComplaintInputDto {
  @IsIn(COMPLAINT_CATEGORIES, { message: "نوع الشكوى ده مش معروف" })
  category!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(COMPLAINT_STATUSES, { message: "حالة الشكوى دي مش معروفة" })
  status?: string;

  @IsOptional()
  @IsString()
  resolutionNotes?: string | null;
}

export class RecordFollowupDto {
  @IsOptional()
  @IsUUID()
  orderId?: string | null;

  @IsOptional()
  @IsInt()
  legacyOrderId?: number | null;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsString()
  customerPhone!: string;

  @IsIn(CALL_RESULTS, { message: "نتيجة الاتصال دي مش معروفة" })
  callResult!: string;

  @IsOptional()
  @IsIn(SATISFACTION_RATINGS, { message: "تقييم الرضا ده مش معروف" })
  satisfactionRating?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  hasComplaint?: boolean;

  @ValidateIf((o) => !!o.hasComplaint)
  @IsObject()
  @ValidateNested()
  @Type(() => ComplaintInputDto)
  complaint?: ComplaintInputDto;
}
