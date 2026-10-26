import { ApiError } from "../../shared/api/client";

export function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "حصل خطأ غير متوقع";
}
