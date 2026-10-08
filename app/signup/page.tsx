import { Suspense } from "react"
import { AuthPage } from "@/components/AuraSite"
export default function Page(){
  return <Suspense fallback={<main className="auth-layout" aria-busy="true" />}><AuthPage mode="signup" /></Suspense>
}
