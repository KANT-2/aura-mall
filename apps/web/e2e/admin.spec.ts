import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/test";
import { seedApi } from "./fixtures/api";
import { testIds } from "@/lib/test-ids";

const seedMember = (page: Parameters<typeof seedApi>[0], role: "member" | "admin") =>
  seedApi(page, {
    member: {
      name: role === "admin" ? "E2E 운영자" : "E2E 회원",
      email: `${role}-${randomUUID()}@example.com`,
      coupon: false,
      role,
    },
  });

test("guests and members cannot use admin pages or APIs", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByTestId(testIds.admin.gate)).toContainText("관리자 로그인이 필요해요");
  await expect(page.getByRole("link", { name: "로그인" })).toHaveAttribute(
    "href",
    "/login?next=%2Fadmin",
  );
  expect((await page.request.get("/api/admin/overview")).status()).toBe(401);

  await seedMember(page, "member");
  await page.goto("/admin/products");
  await expect(page.getByTestId(testIds.admin.gate)).toContainText("관리자 권한이 없어요");
  await expect(page.getByTestId(testIds.admin.shell)).toHaveCount(0);
  expect((await page.request.get("/api/admin/products")).status()).toBe(403);
  expect(
    (
      await page.request.patch("/api/admin/products/fresh-hand-cream", {
        data: { version: 1, price: 1 },
      })
    ).status(),
  ).toBe(403);
});

test("admin edits a product, adjusts stock, processes an inquiry and views an order", async ({
  page,
}, testInfo) => {
  // Other specs read storefront prices, so each project edits a product only this spec uses.
  const product = testInfo.project.name === "mobile" ? "SOFT 디퓨저" : "WARM 디퓨저";
  const brand = `E2E Brand ${randomUUID().slice(0, 8)}`;
  const reason = `정기 입고 ${randomUUID().slice(0, 8)}`;
  await seedMember(page, "admin");
  expect(
    (
      await page.request.post("/api/partner", {
        data: {
          brand,
          name: "담당자",
          email: "partner@example.com",
          introduction: "브랜드 소개",
          message: "입점 문의",
          type: "향수",
          consent: "on",
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.post("/api/orders", {
        data: {
          recipient: "받는 분",
          address: "서울시",
          items: [{ productId: "warm-body-lotion", quantity: 1 }],
        },
      })
    ).status(),
  ).toBe(201);

  await page.goto("/admin");
  await expect(page.getByTestId(testIds.admin.shell)).toBeVisible();
  await expect(page.getByRole("heading", { name: "운영 요약" })).toBeVisible();
  await expect(page.getByTestId(testIds.navigation.cart)).toHaveCount(0);

  await page.goto(`/admin/products?q=${encodeURIComponent(product)}`);
  await page.getByTestId(testIds.admin.productRow).getByRole("link", { name: product }).click();
  const form = page.getByTestId(testIds.admin.productForm);
  const price = form.getByLabel("판매가(원)");
  const nextPrice = Number(await price.inputValue()) + 1000;
  await price.fill(String(nextPrice));
  page.once("dialog", (dialog) => dialog.accept());
  await form.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.getByText(`→ ${nextPrice.toLocaleString("ko-KR")}원`)).toBeVisible();
  await expect(form.getByRole("button", { name: "변경 저장" })).toBeDisabled();

  const stock = page.getByTestId(testIds.admin.stockForm);
  const current = Number((await stock.locator("strong").first().innerText()).replace(/\D/g, ""));
  await stock.getByLabel("수량").fill("3");
  await stock.getByLabel("사유").fill(reason);
  await stock.getByRole("button", { name: "재고 조정" }).click();
  await expect(page.getByText(`사유: ${reason}`)).toBeVisible();
  await expect(stock.locator("strong").first()).toHaveText(
    `${(current + 3).toLocaleString("ko-KR")}개`,
  );

  await page.goto("/admin/inquiries?status=received");
  await page.getByTestId(testIds.admin.inquiryRow).getByRole("link", { name: brand }).click();
  const inquiryForm = page.getByTestId(testIds.admin.inquiryForm);
  await inquiryForm.getByLabel("검토 중").check();
  await inquiryForm.getByLabel("내부 메모").fill("다음 주 연락 예정");
  await inquiryForm.getByRole("button", { name: "저장" }).click();
  await expect(
    page.getByRole("heading", { name: brand }).locator("..").locator(".."),
  ).toContainText("검토 중");
  await expect(inquiryForm.getByRole("button", { name: "저장" })).toBeDisabled();

  await page.goto("/admin/orders");
  await page.getByTestId(testIds.admin.orderRow).first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: "주문 상품" })).toBeVisible();
  await expect(page.getByText("주문 당시 저장된 상품 정보")).toBeVisible();

  await page.getByTestId(testIds.admin.logout).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  expect((await page.request.get("/api/admin/overview")).status()).toBe(401);
});
