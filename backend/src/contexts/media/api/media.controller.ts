import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { DomainError } from "../../../shared/domain/domain-error";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { UploadImageHandler } from "../application/upload-image.handler";
import { GetImageHandler } from "../application/get-image.handler";
import { ImageNotFoundError, MAX_IMAGE_BYTES } from "../domain/image-format";

@Catch(DomainError)
class MediaDomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(exception instanceof ImageNotFoundError ? 404 : 400).json({ error: exception.message });
  }
}

@Controller("media")
@UseFilters(MediaDomainErrorFilter)
export class MediaController {
  constructor(
    private readonly uploadImage: UploadImageHandler,
    private readonly getImage: GetImageHandler
  ) {}

  // رفع صورة صنف/عرض/مكافأة - لمين يقدر يعدّل المنيو بس
  @Post("images")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission("catalog.items.manage")
  // حد الـmulter أعلى شوية من حد الدومين عشان الرسالة العربي (أكبر من 2 ميجا) هي اللي توصل
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_BYTES + 1024 } }))
  async upload(@UploadedFile() file: { buffer: Buffer } | undefined, @Req() req: Request & { user: AuthenticatedUser }) {
    return this.uploadImage.execute({ content: file?.buffer, uploadedBy: req.user.id });
  }

  // عام - صفحة المنيو بتحمّل كل الصور مرة واحدة، فمفيش throttle. id الصورة مابيتغيّرش أبدًا (تعديل
  // الصورة = رفع صورة جديدة بـid جديد) فبتتخزّن في المتصفح سنة كاملة
  @Get("images/:id")
  @SkipThrottle()
  async serve(@Param("id", ParseUUIDPipe) id: string, @Res() res: Response) {
    const image = await this.getImage.execute(id);
    res.setHeader("Content-Type", image.mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    // helmet بيحط same-origin افتراضيًا - الفرونت إند على دومين تاني ولازم يعرض الصورة
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(image.content);
  }
}
