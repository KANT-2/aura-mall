import type { Metadata } from "next"
import type { ReactNode } from "react"
import "./globals.css"
import { AuraProviders, AuraShell } from "@/components/AuraSite"

export const metadata: Metadata = {
  title: "AURA — From Scent to Identity",
  description: "AURA — 향과 취향을 연결하는 프래그런스 리워드 플랫폼",
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <AuraProviders>
          <AuraShell>{children}</AuraShell>
        </AuraProviders>
      </body>
    </html>
  )
}
