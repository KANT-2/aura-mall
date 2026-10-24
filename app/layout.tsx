import type { Metadata } from "next";
import { Cormorant_Garamond, Noto_Serif_KR } from "next/font/google";
import { AuraMotionEnhancer } from "@/components/ui/AuraMotionEnhancer";
import { AuraProvider, Shell } from "@/components/editorial/Aura";
import "./editorial.css";
import "./atelier-refinement.css";
import "./atelier-dark.css";
import "./aura-editorial-v3.css";
import "./aura-sheet-ui-v4.css";
import "./aura-atelier-v5.css";
import "./aura-brand-v6.css";
import "./aura-v7-flow.css";
import "./aura-v8-integrated.css";
import "./aura-v85-detail-assets.css";
import "./aura-v85-motion.css";
import "./aura-v86-qa-fixes.css";
import "./aura-v87-mobile-shake.css";
import "./aura-atelier-stability.css";
import "./aura-motion-system.css";
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
          <Shell>{children}</Shell>
        </AuraProvider>
      </body>
    </html>
  );
}
