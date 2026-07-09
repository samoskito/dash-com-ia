"use client";

import type { MetaAssetsDto } from "@wpptrack/shared";
import { useState } from "react";

type SaveMetaConversionDestinationAction = (
  formData: FormData
) => void | Promise<void>;

type MetaConversionDestinationFormProps = {
  action: SaveMetaConversionDestinationAction;
  assets: MetaAssetsDto;
};

function firstId<T extends { id: string }>(items: T[]): string {
  return items[0]?.id ?? "";
}

export function MetaConversionDestinationForm({
  action,
  assets
}: MetaConversionDestinationFormProps) {
  const pages = assets.pages ?? [];
  const destination = assets.conversionDestination;
  const selectedPixel = assets.pixels.find(
    (pixel) => pixel.id === destination?.pixelId
  );
  const businessId = assets.selection.businessId ?? selectedPixel?.businessId ?? "";
  const pixels = businessId
    ? assets.pixels.filter((pixel) => pixel.businessId === businessId)
    : assets.pixels;
  const [pixelId, setPixelId] = useState(
    () => destination?.pixelId ?? assets.selection.pixelId ?? firstId(pixels)
  );
  const [pageId, setPageId] = useState(
    () => destination?.pageId ?? firstId(pages)
  );

  return (
    <form className="filter-bar" action={action}>
      <select
        className="filter-control"
        name="pixelId"
        value={pixelId}
        onChange={(event) => setPixelId(event.currentTarget.value)}
        aria-label="Pixel do destino de conversao"
      >
        <option value="">Sem Pixel</option>
        {pixels.map((pixel) => (
          <option key={pixel.id} value={pixel.id}>
            {pixel.name}
          </option>
        ))}
      </select>
      <select
        className="filter-control"
        name="pageId"
        value={pageId}
        onChange={(event) => setPageId(event.currentTarget.value)}
        aria-label="Pagina Facebook principal"
      >
        <option value="">Sem Pagina</option>
        {pages.map((page) => (
          <option key={page.id} value={page.id}>
            {page.name}
          </option>
        ))}
      </select>
      <button className="button" type="submit">
        Salvar destino
      </button>
    </form>
  );
}
