import "server-only";
import { backendRequest, backendError } from "@/server/backend/transport";

export async function serverRequest<T>(path: string): Promise<T> {
  const response = await backendRequest(path);
  if (response.status >= 400) {
    throw backendError(response.status, response.data);
  }

  return response.data as T;
}
