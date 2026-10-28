import { ApiError } from "./client";

export function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : "حصل خطأ غير متوقع";
}
