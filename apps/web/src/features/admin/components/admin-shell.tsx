"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useNotify } from "@/components/feedback/notification-provider";
import { useAdminAuth, useAdminAccount } from "@/features/admin/hooks/use-admin-auth";
import { AdminError } from "@/features/admin/components/admin-feedback";
import styles from "@/features/admin/components/admin.module.css";
import { testIds } from "@/lib/test-ids";

const menu = [
  ["/admin", "운영 요약"],
  ["/admin/products", "상품·재고"],
  ["/admin/orders", "주문 조회"],
  ["/admin/inquiries", "입점 문의"],
] as const;

/** Hiding the menu is only UX; every admin API checks the role again on the server. */
export function AdminShell({ children }: { children: ReactNode }) {
  const account = useAdminAccount();
  const user = account.data?.admin;
  const ready = account.isSuccess;
  const { signOut, pending } = useAdminAuth();
  const path = usePathname();
  const router = useRouter();
  const notify = useNotify();
  const [seenAdmin, setSeenAdmin] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const admin = !!user;
  if (admin && !seenAdmin) {
    setSeenAdmin(true);
  }

  if (path === "/admin/login") {
    return children;
  }

  if (account.error) {
    return (
      <main className={styles.gate}>
        <AdminError
          error={account.error}
          retry={() => {
            void account.refetch();
          }}
        />
      </main>
    );
  }

  if (!ready || leaving) {
    return (
      <main className={styles.gate} aria-busy="true">
        <p role="status">관리자 정보를 확인하고 있어요.</p>
      </main>
    );
  }

  if (!admin) {
    const expired = seenAdmin && !user;
    return (
      <main className={styles.gate} data-testid={testIds.admin.gate}>
        <span className="eyebrow">AURA ADMIN</span>
        <h1>{expired ? "로그인이 만료되었어요." : "관리자 로그인이 필요해요."}</h1>
        <p>
          {expired
            ? "다시 로그인한 뒤 작업을 이어가 주세요. 저장하지 않은 변경은 반영되지 않았어요."
            : "관리자 계정으로 로그인하면 상품·주문·입점 문의를 관리할 수 있어요."}
        </p>
        <div className="actions">
          <Link className="button" href={`/admin/login?next=${encodeURIComponent(path)}`}>
            로그인
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className={styles.shell} data-testid={testIds.admin.shell}>
      <a className="skip" href="#admin-main">
        본문 바로가기
      </a>
      <header className={styles.bar}>
        <Link href="/admin" className={styles.brand}>
          AURA <span>ADMIN</span>
        </Link>
        <nav className={styles.menu} aria-label="관리자 메뉴">
          {menu.map(([href, label]) => {
            const current = href === "/admin" ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={current ? "page" : undefined}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.account}>
          <span>{user.name}</span>
          <Link href="/">쇼핑몰</Link>
          <button
            type="button"
            disabled={pending}
            data-testid={testIds.admin.logout}
            onClick={async () => {
              setLeaving(true);
              try {
                await signOut();
                router.replace("/");
                notify("로그아웃했어요.");
              } catch (error) {
                setLeaving(false);
                notify(error instanceof Error ? error.message : "로그아웃하지 못했어요.");
              }
            }}
          >
            로그아웃
          </button>
        </div>
      </header>
      <main id="admin-main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
