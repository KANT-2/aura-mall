export type AssetKind = "ingredient" | "editorial";
export function asset(id: string, kind: AssetKind = "editorial") {
  const resolved = id === "gold-droplet" ? "droplet" : id;
  return kind === "ingredient"
    ? `/assets/botanical/${resolved}.webp`
    : `/assets/editorial/${resolved}.svg`;
}
