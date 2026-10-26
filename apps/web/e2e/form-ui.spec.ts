import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/test";
import { testIds } from "@/lib/test-ids";
import { routes } from "./fixtures/data";

test("signup welcome steps fit the viewport and can be dismissed", async ({ page }) => {
  await page.goto(routes.register);
  await page.getByLabel("이름", { exact: true }).fill("AURA 검수");
  await page.getByTestId(testIds.account.email).fill(`ui-${randomUUID()}@example.com`);
  await page.getByTestId(testIds.account.password).fill("password123");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("password123");
  await page.getByRole("checkbox", { name: /필수/ }).check();
  await page.getByTestId(testIds.account.submit).click();
  const dialog = page.getByRole("dialog", { name: "AURA 첫 이용 안내" });
  await expect(dialog).toBeVisible();
  for (let step = 1; step <= 5; step++) {
    await dialog.getByRole("button", { name: `${step}번째 안내`, exact: true }).click();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId(testIds.navigation.account)).toHaveAttribute("href", routes.mypage);
});

test("partner form clears corrected field errors and saves a valid mock inquiry", async ({
  page,
}) => {
  await page.goto(routes.partner);
  const brand = page.getByLabel("브랜드명", { exact: true });
  const name = page.getByLabel("담당자명", { exact: true });
  const submit = page.getByRole("button", { name: /입점 문의 보내기/ });
  await submit.click();
  await expect(brand).toHaveAttribute("aria-invalid", "true");
  await brand.fill("검수 브랜드");
  await submit.click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(brand).not.toHaveAttribute("aria-invalid", "true");
  await name.fill("검수자");
  await page.getByLabel("이메일", { exact: true }).fill("qa@example.com");
  await page.getByRole("combobox", { name: "주요 제품 유형" }).click();
  await page.getByRole("option", { name: "향수", exact: true }).click();
  await page.getByLabel("브랜드 및 제품 소개", { exact: true }).fill("브랜드 소개");
  await page.getByLabel("문의 내용", { exact: true }).fill("화면 검수용 문의");
  await page.getByRole("checkbox", { name: /필수/ }).check();
  await submit.click();
  await expect(page.getByRole("heading", { name: "모의 문의가 저장되었어요." })).toBeVisible();
});
