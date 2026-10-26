/* eslint-disable @next/next/no-img-element */

/**
 * AURA collection illustration composition.
 * Composes shared transparent WebP illustrations at modest rendered sizes.
 * Each layer can be replaced via the registry later.
 */
const variants = {
  fresh: ["bergamot", "neroli", "rosemary"],
  soft: ["jasmine", "rose", "white-musk"],
  warm: ["sandalwood", "amber", "cedarwood"],
} as const;

type CollectionId = keyof typeof variants;

export function AuraCollectionArtwork({
  collection,
  className = "",
}: {
  collection: string;
  className?: string;
}) {
  if (!(collection in variants)) {
    return null;
  }
  const key = collection as CollectionId;
  const images = variants[key];
  return (
    <div
      className={`a85-collection-art a85-collection-art--${key} ${className}`}
      aria-hidden="true"
    >
      <span className="a85-art-line a85-art-line--outer" />
      <span className="a85-art-line a85-art-line--inner" />
      {images.map((item, i) => (
        <img
          key={item}
          src={`/assets/botanical/${item}.webp`}
          className={`a85-art-ingredient a85-art-ingredient--${i + 1}`}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      ))}
      <span className="a85-art-hairline" />
    </div>
  );
}
