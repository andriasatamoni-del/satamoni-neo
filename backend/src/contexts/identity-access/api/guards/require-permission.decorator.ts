import { SetMetadata } from "@nestjs/common";
import type { Permission } from "../../domain/permission";

export const PERMISSIONS_KEY = "required_permissions";

// بيقبل أكتر من صلاحية - يكفي إن المستخدم يملك واحدة منهم (OR) - نفس فلسفة requirePermission
// في middleware/permissions.js بالريبو القديم بالظبط
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
