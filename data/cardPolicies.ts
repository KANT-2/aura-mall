export type AuraCard = "Dew" | "Velvet" | "Amber"

export const cardPolicies = {
  Dew: { name: "듀", tier: "START", signupBonus: 10000, rate: 1 },
  Velvet: { name: "벨벳", tier: "TASTE", signupBonus: 30000, rate: 3 },
  Amber: { name: "앰버", tier: "PRIVILEGE", signupBonus: 50000, rate: 5 },
} satisfies Record<AuraCard, { name: string; tier: string; signupBonus: number; rate: number }>

export function isAuraCard(value: unknown): value is AuraCard {
  return value === "Dew" || value === "Velvet" || value === "Amber"
}

export function calculateCardReward(total: number, card: AuraCard) {
  return Math.floor(total * cardPolicies[card].rate / 100)
}

export function detectAuraCard(cardNumber: string): AuraCard | null {
  const digits = cardNumber.replace(/[\s-]/g, "")
  if (!/^\d{16}$/.test(digits)) return null
  if (/^[0-3]/.test(digits)) return "Dew"
  if (/^[4-6]/.test(digits)) return "Velvet"
  if (/^[7-9]/.test(digits)) return "Amber"
  return null
}

export function formatAuraCardNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 16).match(/.{1,4}/g)?.join(" ") ?? ""
}
