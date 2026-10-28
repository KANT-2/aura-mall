import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { testIds } from "@/lib/test-ids";

async function member(page: Page) {
  const response = await page.request.post("/api/auth/register", {
    data: {
      name: "브라우저 고객",
      email: `${randomUUID()}@example.test`,
      password: "browser-member-password-42",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
}
async function admin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("이메일", { exact: true }).fill("operator@example.test");
  await page.getByLabel("비밀번호", { exact: true }).fill("browser-admin-password-42");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByTestId(testIds.admin.shell)).toBeVisible();
}

test("private product inquiry is saved, masked for visitors, answered in the back office and deleted by its owner", async ({
  page,
  browser,
}) => {
  await member(page);
  const title = `문의-${randomUUID().slice(0, 8)}`;
  await page.goto("/shop/fresh-hand-cream");
  await page.getByRole("tab", { name: "Q&A", exact: true }).click();
  await page.getByRole("button", { name: "상품 문의 작성", exact: true }).click();
  await page.getByLabel("제목", { exact: true }).fill(title);
  await page.getByLabel("문의 내용", { exact: true }).fill("비공개 성분 문의입니다.");
  await page.getByRole("button", { name: "문의 등록", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const guest = await browser.newContext();
  const operator = await browser.newContext();
  try {
    const hidden = await guest.request.get(
      new URL("/api/products/fresh-hand-cream/questions", page.url()).href,
    );
    expect(await hidden.text()).not.toContain(title);
    expect(await hidden.text()).not.toContain("비공개 성분 문의입니다.");
    const backoffice = await operator.newPage();
    await admin(backoffice);
    await backoffice.goto("/admin/questions");
    const card = backoffice
      .getByRole("article")
      .filter({ has: backoffice.getByRole("heading", { name: title }) });
    await card.getByLabel("관리자 답변").fill("성분 안내를 확인해 주세요.");
    await card.getByRole("button", { name: "답변 등록", exact: true }).click();
    await expect(card.getByText("답변 완료", { exact: false })).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Q&A", exact: true }).click();
    await expect(page.getByText("성분 안내를 확인해 주세요.", { exact: true })).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: title }) })
      .getByRole("button", { name: "문의 삭제" })
      .click();
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  } finally {
    await guest.close();
    await operator.close();
  }
});

test("checkout survives a lost order response, pays once, clears its original cart and supports full refund", async ({
  page,
}) => {
  await member(page);
  await page.route("https://js.tosspayments.com/v2/standard", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.TossPayments = Object.assign(function(){let amount;return {widgets(){return {async setAmount(value){amount=value.value},async renderPaymentMethods(){document.querySelector('#payment-method').textContent='테스트 카드'},async renderAgreement(){document.querySelector('#payment-agreement').textContent='테스트 동의'},async requestPayment(options){location.href=options.successUrl+'?'+new URLSearchParams({paymentKey:'browser-'+crypto.randomUUID(),orderId:options.orderId,amount:String(amount)})}}}}},{ANONYMOUS:'ANONYMOUS'});`,
    }),
  );
  await page.goto("/shop/fresh-hand-cream");
  await page.getByTestId(testIds.catalog.addToCart).click();
  await expect(page.getByRole("link", { name: "장바구니에서 확인하기 →" })).toBeVisible();
  await page.goto("/checkout");
  await page.getByLabel("받는 분", { exact: true }).fill("브라우저 수령인");
  await page.getByLabel("연락처", { exact: true }).fill("010-0000-0000");
  await page.getByLabel("주소", { exact: true }).fill("검증 주소");
  await page.getByLabel("상세 주소", { exact: true }).fill("101호");
  await page.getByLabel("배송 요청사항", { exact: true }).fill("문 앞에 놓아주세요.");
  let dropped = false;
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      const upstream = await route.fetch();
      expect(upstream.status()).toBe(201);
      await route.abort("failed");
      return;
    }

    await route.continue();
  });
  await page.getByRole("button", { name: "주문하고 테스트 결제하기" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "주문하고 테스트 결제하기" }).click();
  await expect(page).toHaveURL(/\/payments\/[0-9a-f-]+$/);
  const placed = await (await page.request.get("/api/orders")).json();
  expect(placed).toHaveLength(1);
  expect(placed[0].recipientPhone).toBe("010-0000-0000");
  expect(placed[0].address).toBe("검증 주소 101호");
  await page.getByRole("button", { name: "이 주문 결제 준비", exact: true }).click();
  await expect(page.getByText("테스트 카드", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "테스트 결제하기", exact: true }).click();
  await expect(page.locator('[data-payment-status="DONE"]')).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByTestId(testIds.cart.item)).toHaveCount(0);
  await page.goto("/mypage");
  await page.getByRole("button", { name: "주문 내역", exact: true }).click();
  await expect(page.getByText("결제 완료", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "취소·전액 환불 요청", exact: true }).click();
  await expect(page.getByText("취소 완료", { exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/orders")).json())[0].status).toBe("cancelled");
});
