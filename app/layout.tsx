import type { Metadata } from "next";
import { Cormorant_Garamond, Noto_Serif_KR } from "next/font/google";
import { AuraMotionEnhancer } from "@/components/ui/AuraMotionEnhancer";
import { AuraProvider } from "@/components/providers/AuraProvider";
import { Shell } from "@/components/editorial/Shell";
import { Footer } from "@/components/editorial/Footer";
import "./globals.css";

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
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${cormorant.variable} ${notoSerif.variable}`}>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css" />
      </head>
      <body>
        <AuraProvider>
          <AuraMotionEnhancer/>
          <Shell footer={<Footer />}>{children}</Shell>
        </AuraProvider>
      </body>
    </html>
  );
}
