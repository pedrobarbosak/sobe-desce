import { ConvexError } from "convex/values";

/** Extracts the `code` from a ConvexError thrown by our functions. */
export function errorCode(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { code?: string } | string;
    if (typeof data === "string") return data;
    if (data && typeof data.code === "string") return data.code;
  }
  if (err instanceof Error) return err.message;
  return "unknown";
}
