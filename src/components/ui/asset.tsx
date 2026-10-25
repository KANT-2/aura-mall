/* eslint-disable @next/next/no-img-element */
import { asset, type AssetKind } from "@/lib/assets";
import { AuraCollectionArtwork } from "@/components/brand/collection-artwork";
export function Asset({
  id,
  className = "",
  kind = "editorial",
}: {
  id: string;
  className?: string;
  kind?: AssetKind;
}) {
  if (id === "collection-fresh" || id === "collection-soft" || id === "collection-warm") {
    return (
      <AuraCollectionArtwork collection={id.slice("collection-".length)} className={className} />
    );
  }
  return <img className={className} src={asset(id, kind)} alt="" draggable={false} />;
}
