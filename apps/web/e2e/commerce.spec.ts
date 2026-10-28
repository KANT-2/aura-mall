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

test("administrator uploads an image, publishes a new product, edits customer guidance and stops sales while retaining history", async ({
  page,
}) => {
  await admin(page);
  const id = `browser-managed-${randomUUID().slice(0, 8)}`;
  const name = `베르가못 리필 ${id.slice(-8)}`;
  const usage = "손에 적당량을 덜어 부드럽게 펴 발라 주세요.";
  const shipping = "주문 준비가 끝나면 배송을 시작하고 운송장을 안내해요.";
  await page.goto("/admin/products/new");
  await page.getByLabel(/^상품명/).fill(name);
  await page.getByLabel(/^영문명/).fill("Bergamot Hand Cream Refill");
  await page.getByLabel(/^컬렉션/).selectOption("fresh");
  await page.getByLabel(/^제품 유형/).selectOption("hand-cream");
  await page.getByLabel(/^용량/).fill("100mL");
  await page.getByLabel(/^상품 분류/).fill("핸드 케어");
  await page.getByLabel(/^상품 소개/).fill("산뜻한 시트러스 향의 리필 핸드크림이에요.");
  await page.locator('input[name="price"]').fill("39000");
  await page.locator('input[name="stock"]').fill("12");
  await page.locator('input[name="notes"]').fill("베르가못, 네롤리, 화이트 머스크");
  await page.getByRole("checkbox", { name: /판매·목록 노출/ }).check();
  await page.getByText("상품 ID 직접 지정", { exact: true }).click();
  await page.locator('input[name="id"]').fill(id);
  const [uploaded] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/media") && response.request().method() === "POST",
    ),
    page.getByLabel("이미지 업로드", { exact: true }).setInputFiles({
      name: "bergamot-product.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8tKKHARtgwio6aCUAi5ECBrUHlk0AAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  ]);
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const asset = await uploaded.json();
  expect(asset.url).toMatch(/^\/api\/media\/[0-9a-f-]{36}$/);
  const delivered = await page.request.get(asset.url);
  expect(delivered.status()).toBe(200);
  expect(delivered.headers()["content-type"]).toBe("image/webp");
  expect(delivered.headers()["cache-control"]).toContain("immutable");
  await expect(page.getByRole("status").filter({ hasText: "업로드 완료" })).toBeVisible();
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/products/${id}$`));
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByText(/상세 안내 편집/).click();
  await page.getByLabel("사용 방법·보관", { exact: true }).fill(usage);
  await page.getByLabel("배송 안내", { exact: true }).fill(shipping);
  await page.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect(page.getByText("상품 정보를 저장했어요.", { exact: true })).toBeVisible();
  const customerProduct = await page.request.get(`/api/catalog/products/${id}`);
  expect(customerProduct.status()).toBe(200);
  expect((await customerProduct.json()).details).toMatchObject({ usage, shipping });
  await page.goto(`/shop/${id}`);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "제품 정보", exact: true }).click();
  await page.getByText("사용 방법과 보관", { exact: true }).click();
  await expect(page.getByText(usage, { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "배송·교환", exact: true }).click();
  await expect(page.getByText(shipping, { exact: true })).toBeVisible();
  await page.goto(`/admin/products/${id}`);
  await page.getByRole("checkbox", { name: /판매·목록 노출/ }).uncheck();
  await page.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect(page.getByText("상품 정보를 저장했어요.", { exact: true })).toBeVisible();
  expect((await page.request.get(`/api/catalog/products/${id}`)).status()).toBe(404);
  const retained = await page.request.get(`/api/admin/products/${id}`);
  expect(retained.status()).toBe(200);
  const record = await retained.json();
  expect(record.isActive).toBe(false);
  expect(
    record.history.some((entry: { action: string }) => entry.action === "product.create"),
  ).toBe(true);
  expect(
    record.history.some((entry: { action: string }) => entry.action === "product.update"),
  ).toBe(true);
  await expect(page.getByRole("heading", { name: "변경 이력", exact: true })).toBeVisible();
});

test("administrator password change returns to login even when logout cleanup loses its response", async ({
  page,
}) => {
  await admin(page);
  const email = `operator-${randomUUID()}@example.test`;
  const currentPassword = "temporary-admin-password-42";
  const newPassword = "replacement-admin-password-42";
  expect(
    (
      await page.request.post("/api/admin/admins", {
        data: { name: "새 운영자", email, password: currentPassword },
      })
    ).status(),
  ).toBe(201);
  await page.request.post("/api/admin/auth/logout");
  await page.goto("/admin/login");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(currentPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByTestId(testIds.admin.shell)).toBeVisible();
  await page.goto("/admin/settings");
  await page.locator('input[name="currentPassword"]').fill(currentPassword);
  await page.locator('input[name="newPassword"]').fill(newPassword);
  await page.locator('input[name="repeatPassword"]').fill(newPassword);
  await page.route("**/api/admin/auth/logout", (route) => route.abort("failed"));
  await page.getByRole("button", { name: /비밀번호 변경/ }).click();
  await expect(page).toHaveURL(/\/admin\/login\?passwordChanged=1$/);
  await page.unroute("**/api/admin/auth/logout");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByTestId(testIds.admin.shell)).toBeVisible();
});
