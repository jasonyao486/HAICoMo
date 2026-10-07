export type AppError = { code: string; message: string; details?: string };
export function errorData(error: unknown): AppError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error
  )
    return {
      code: String(error.code),
      message: String(error.message),
      details: "details" in error ? String(error.details) : undefined,
    };
  const message = (
    error instanceof Error ? error.message : String(error)
  ).replace(/^(Error:\s*)+/, "");
  const match = /^([A-Z][A-Z_]+)(?::\s*(.*))?$/s.exec(message);
  return {
    code: match?.[1] ?? "UNEXPECTED_ERROR",
    message,
    details: match?.[2],
  };
}
