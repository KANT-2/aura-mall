import { createBffHandler } from "@/server/bff/handler";
import { integer, record, text } from "@/server/backend/decode";
export const POST = createBffHandler("POST", "/admin/media", {
  authScope: "admin",
  maxBodyBytes: 3 * 1024 * 1024,
  bodyFields: ["data"],
  responseBody: (value) => {
    const asset = record(value);
    return {
      id: text(asset.id),
      url: text(asset.url),
      width: integer(asset.width),
      height: integer(asset.height),
    };
  },
});
