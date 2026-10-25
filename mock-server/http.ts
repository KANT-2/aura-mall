export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireString(value: unknown, message: string, max = 3000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new HttpError(400, message);
  return value.trim();
}
