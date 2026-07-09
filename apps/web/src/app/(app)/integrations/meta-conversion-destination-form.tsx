"use client";

import type { MetaAssetsDto } from "@wpptrack/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { SubmitButton } from "../../../components/submit-button";

type SaveMetaConversionDestinationAction = (
  formData: FormData
) => void | Promise<void>;

type MetaConversionDestinationFormProps = {
  action: SaveMetaConversionDestinationAction;
  assets: MetaAssetsDto;
  loadBusinessAssetsAction: LoadMetaBusinessAssetsAction;
};

type LoadMetaBusinessAssetsAction = (
  businessId: string
) => Promise<Pick<MetaAssetsDto, "pixels" | "pages">>;

function firstId<T extends { id: string }>(items: T[]): string {
  return items[0]?.id ?? "";
}

function pixelsForBusiness(assets: MetaAssetsDto, businessId: string) {
  if (!businessId) {
    return [];
  }

  return assets.pixels.filter((pixel) => pixel.businessId === businessId);
}

export function metaPagesForBusiness(assets: MetaAssetsDto, businessId: string) {
  if (!businessId) {
    return [];
  }

  return (assets.pages ?? []).filter((page) => page.businessId === businessId);
}

function initialBusinessId(assets: MetaAssetsDto): string {
  const destination = assets.conversionDestination;
  const selectedPixel = assets.pixels.find(
    (pixel) => pixel.id === destination?.pixelId
  );
  const selectedPage = (assets.pages ?? []).find(
    (page) => page.id === destination?.pageId
  );

  return (
    selectedPixel?.businessId ??
    selectedPage?.businessId ??
    assets.selection.businessId ??
    firstId(assets.businesses)
  );
}

export function MetaConversionDestinationForm({
  action,
  assets,
  loadBusinessAssetsAction
}: MetaConversionDestinationFormProps) {
  const destination = assets.conversionDestination;
  const [businessId, setBusinessId] = useState(() => initialBusinessId(assets));
  const [availablePixels, setAvailablePixels] = useState(() => assets.pixels);
  const [availablePages, setAvailablePages] = useState(() => assets.pages ?? []);
  const [isLoadingBusinessAssets, setIsLoadingBusinessAssets] = useState(false);
  const loadSequence = useRef(0);
  const pixels = useMemo(
    () => pixelsForBusiness({ ...assets, pixels: availablePixels }, businessId),
    [assets, availablePixels, businessId]
  );
  const pages = useMemo(
    () =>
      metaPagesForBusiness(
        { ...assets, pages: availablePages },
        businessId
      ),
    [assets, availablePages, businessId]
  );
  const [pixelId, setPixelId] = useState(
    () =>
      destination?.pixelId && pixels.some((pixel) => pixel.id === destination.pixelId)
        ? destination.pixelId
        : firstId(pixels)
  );
  const [pageId, setPageId] = useState(
    () =>
      destination?.pageId && pages.some((page) => page.id === destination.pageId)
        ? destination.pageId
        : firstId(pages)
  );
  const selectedPixel = useMemo(
    () => pixels.find((pixel) => pixel.id === pixelId),
    [pixels, pixelId]
  );
  const selectedPage = useMemo(
    () => pages.find((page) => page.id === pageId),
    [pages, pageId]
  );

  useEffect(() => {
    const nextBusinessId = initialBusinessId(assets);
    const nextPixels = pixelsForBusiness(assets, nextBusinessId);
    const nextPages = metaPagesForBusiness(assets, nextBusinessId);

    setBusinessId(nextBusinessId);
    setAvailablePixels(assets.pixels);
    setAvailablePages(assets.pages ?? []);
    setPixelId(
      destination?.pixelId && nextPixels.some((item) => item.id === destination.pixelId)
        ? destination.pixelId
        : firstId(nextPixels)
    );
    setPageId(
      destination?.pageId && nextPages.some((item) => item.id === destination.pageId)
        ? destination.pageId
        : firstId(nextPages)
    );
  }, [assets, destination?.pageId, destination?.pixelId]);

  async function handleBusinessChange(nextBusinessId: string) {
    const sequence = loadSequence.current + 1;

    loadSequence.current = sequence;
    setBusinessId(nextBusinessId);
    setPixelId("");
    setPageId("");

    if (!nextBusinessId) {
      setAvailablePixels([]);
      setAvailablePages([]);
      setIsLoadingBusinessAssets(false);
      return;
    }

    setIsLoadingBusinessAssets(true);

    try {
      const nextAssets = await loadBusinessAssetsAction(nextBusinessId);

      if (loadSequence.current !== sequence) {
        return;
      }

      setAvailablePixels(nextAssets.pixels);
      setAvailablePages(nextAssets.pages ?? []);
      setPixelId(firstId(nextAssets.pixels));
      setPageId(firstId(nextAssets.pages ?? []));
    } catch {
      if (loadSequence.current !== sequence) {
        return;
      }

      setAvailablePixels([]);
      setAvailablePages([]);
    } finally {
      if (loadSequence.current === sequence) {
        setIsLoadingBusinessAssets(false);
      }
    }
  }

  return (
    <form className="filter-bar" action={action}>
      <input type="hidden" name="pixelName" value={selectedPixel?.name ?? ""} />
      <input type="hidden" name="pageName" value={selectedPage?.name ?? ""} />
      <select
        className="filter-control"
        name="businessId"
        value={businessId}
        onChange={(event) => handleBusinessChange(event.currentTarget.value)}
        aria-label="Business Manager do destino de conversao"
        disabled={isLoadingBusinessAssets}
      >
        <option value="">Sem BM</option>
        {assets.businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name}
          </option>
        ))}
      </select>
      <select
        className="filter-control"
        name="pixelId"
        value={pixelId}
        onChange={(event) => setPixelId(event.currentTarget.value)}
        aria-label="Pixel do destino de conversao"
        disabled={isLoadingBusinessAssets}
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
        disabled={isLoadingBusinessAssets}
      >
        <option value="">Sem Pagina</option>
        {pages.map((page) => (
          <option key={page.id} value={page.id}>
            {page.name}
          </option>
        ))}
      </select>
      <SubmitButton
        disabled={isLoadingBusinessAssets || !businessId || !pixelId || !pageId}
        pendingLabel="Salvando destino..."
        statusText="Salvando Pixel e pagina principal."
      >
        {isLoadingBusinessAssets ? "Carregando ativos" : "Salvar destino"}
      </SubmitButton>
    </form>
  );
}
