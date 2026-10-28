import type { Metadata } from "next";
import { connection } from "next/server";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerCatalog } from "@/features/catalog/api/server";
import { catalogKey } from "@/features/catalog/api/catalog";
import { Cormorant_Garamond, Noto_Serif_KR } from "next/font/google";
import { AuraMotionEnhancer } from "@/app/_components/motion-effects";
import { ImageLoadingFeedback } from "@/app/_components/image-loading-feedback";
import { Providers } from "@/app/providers";
import { SiteHeader } from "@/app/_components/site-header";
import { StorefrontOnly } from "@/app/_components/storefront-only";
import { WelcomeJourney } from "@/features/onboarding/components/welcome-dialog";
import { Footer } from "@/components/layout/site-footer";
import "@/app/globals.css";

const cormorant = Cormorant_Garamond({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-cormorant-garamond",
});
const notoSerif = Noto_Serif_KR({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-serif-kr",
});
export const metadata: Metadata = {
  title: "AURA — From Scent to Identity",
  description: "향을 발견하고, 나만의 취향을 완성하는 프래그런스 셀렉트 스토어",
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  await connection();
  const queryClient = new QueryClient();
  await queryClient.fetchQuery({ queryKey: catalogKey, queryFn: getServerCatalog });
  return (
    <html
      lang="ko"
      data-scroll-behavior="smooth"
      className={`${cormorant.variable} ${notoSerif.variable}`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
        />
      </head>
      <body>
        <Providers>
          <HydrationBoundary state={dehydrate(queryClient)}>
            <AuraMotionEnhancer />
            <ImageLoadingFeedback />
            <StorefrontOnly>
              <SiteHeader />
            </StorefrontOnly>
            <div id="main-content">{children}</div>
            <StorefrontOnly>
              <WelcomeJourney />
              <Footer />
            </StorefrontOnly>
          </HydrationBoundary>
        </Providers>
      </body>
    </html>
  );
}
