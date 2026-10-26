import "server-only";
import { backendRequest, backendError } from "@/server/backend/transport";

export async function serverRequest<T>(path: string, decode?: (data: unknown) => T): Promise<T> {
  const response = await backendRequest(path);
  if (response.status >= 400) {
    throw backendError(response.status, response.data);
  }

  return decode ? decode(response.data) : (response.data as T);
}
