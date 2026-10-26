import "server-only";
import { ApiError } from "@/lib/api/errors";
import { isRecord } from "@/lib/validation";

const MAX_BODY_BYTES = 32 * 1024;
export async function jsonRequestBody(request: Request): Promise<string | undefined> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new ApiError(413, "입력 내용이 너무 길어요.", "PAYLOAD_TOO_LARGE");
  }
  if (!request.body) {
    return undefined;
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "입력 내용이 너무 길어요.", "PAYLOAD_TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  if (!text) {
    return undefined;
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new ApiError(415, "JSON 형식으로 요청해 주세요.", "UNSUPPORTED_MEDIA_TYPE");
  }
  try {
    if (!isRecord(JSON.parse(text))) {
      throw new Error("Expected an object");
    }
    return text;
  } catch {
    throw new ApiError(400, "입력 형식을 확인해 주세요.", "INVALID_JSON");
  }
}
