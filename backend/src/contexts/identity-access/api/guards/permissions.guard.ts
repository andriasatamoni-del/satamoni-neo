import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PERMISSIONS_KEY } from "./require-permission.decorator";
import type { AuthenticatedUser } from "../types";
import type { Permission } from "../../domain/permission";

// لازم JwtAuthGuard يتنفّذ قبله (بيعتمد على req.user اللي بيحطه) - نفس ترتيب requireAuth قبل
// requirePermission في الريبو القديم
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("معندكش صلاحية تعمل الإجراء ده");

    if (!required.some((permission) => user.permissions.has(permission))) {
      throw new ForbiddenException("معندكش صلاحية تعمل الإجراء ده");
    }
    return true;
  }
}
