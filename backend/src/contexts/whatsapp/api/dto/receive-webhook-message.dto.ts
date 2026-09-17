import { IsOptional, IsString } from "class-validator";

// شكل مبسّط لمحاكاة webhook حقيقي (Meta Cloud API بيبعت payload أعقد بكتير فيه entry/changes/value) -
// راجع تعليق migration 023_create_whatsapp_intake_tables.ts. أول ما الاعتماد الحقيقي يتوفر، محول
// (adapter) بسيط هيترجم payload ميتا الحقيقي لنفس الشكل ده قبل ما ينده على نفس الـhandler
export class ReceiveWebhookMessageDto {
  @IsString() phone!: string;
  @IsOptional() @IsString() customerName?: string;
  @IsString() body!: string;
  @IsOptional() @IsString() waMessageId?: string;
}
