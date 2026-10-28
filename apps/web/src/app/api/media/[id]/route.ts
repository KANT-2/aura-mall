import { backendConfig } from "@/server/backend/config";
import { backendSegment } from "@/server/backend/transport";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const config = backendConfig();
    const response = await fetch(`${config.apiUrl}/media/${backendSegment((await params).id)}`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs)]),
    });
    if (!response.ok || response.headers.get("content-type") !== "image/webp") {
      return new Response(null, {
        status: response.status === 404 || response.status === 422 ? 404 : 502,
      });
    }

    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        ...(response.headers.get("etag") ? { ETag: response.headers.get("etag")! } : {}),
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
