export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const required = [
    "brand",
    "name",
    "email",
    "introduction",
    "message",
    "type",
  ];
  if (
    !body ||
    required.some(
      (key) =>
        typeof body[key] !== "string" ||
        !body[key].trim() ||
        body[key].length > 3000,
    ) ||
    !/^\S+@\S+\.\S+$/.test(body.email) ||
    body.consent !== "on"
  ) {
    return Response.json(
      { error: "필수 입력 항목과 동의를 확인해 주세요." },
      { status: 400 },
    );
  }
  // Connect an authorized durable inbox before enabling receipt. Never fake success.
  return Response.json(
    {
      error: "현재 문의 전송을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.",
    },
    { status: 503 },
  );
}
