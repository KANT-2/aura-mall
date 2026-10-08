import { Suspense } from "react"
import { CollectionPage } from "@/components/AuraSite"

export default function Page() {
  return (
    <Suspense fallback={<main className="collection-page page-shell"><p className="eyebrow">AURA COLLECTION</p></main>}>
      <CollectionPage />
    </Suspense>
  )
}
