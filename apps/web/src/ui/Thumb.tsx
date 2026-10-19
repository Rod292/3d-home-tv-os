import { memo } from "react";
import { useCatalogThumbnail } from "@appart3d/catalog";
import type { ItemCategory } from "@appart3d/scene";

interface Props {
  category: ItemCategory;
  variant?: string;
  color?: string;
  /** Visual size class: "lg" catalog card, "md" inspector header, "sm" list rows. */
  size?: "lg" | "md" | "sm";
}

/**
 * Rendered preview of a catalog model (from `useCatalogThumbnail`), with a tinted isometric block as a
 * fallback while the image is being rendered or when WebGL is unavailable.
 */
export const Thumb = memo(function Thumb({ category, variant, color, size = "lg" }: Props) {
  const url = useCatalogThumbnail(category, variant, color);
  return (
    <span className={`thumb thumb-${size}${url ? " has-img" : ""}`} style={{ ["--c" as string]: color ?? "#d8cfc2" }} aria-hidden>
      {url ? (
        <img src={url} alt="" draggable={false} decoding="async" />
      ) : (
        <span className="cube">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
});
