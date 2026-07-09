"use client";

import type { MetaAssetsDto } from "@wpptrack/shared";
import { useMemo, useState } from "react";

type SaveMetaAssetsAction = (formData: FormData) => void | Promise<void>;

type MetaAssetsFormProps = {
  action: SaveMetaAssetsAction;
  assets: MetaAssetsDto;
};

export function metaAdAccountsForBusiness(
  assets: MetaAssetsDto,
  businessId: string
) {
  if (!businessId) {
    return [];
  }

  return assets.adAccounts.filter((adAccount) =>
    adAccount.businessId === businessId
  );
}

export function metaPixelsForBusiness(assets: MetaAssetsDto, businessId: string) {
  if (!businessId) {
    return [];
  }

  return assets.pixels.filter((pixel) => pixel.businessId === businessId);
}

function firstId<T extends { id: string }>(items: T[]): string {
  return items[0]?.id ?? "";
}

function initialBusinessId(assets: MetaAssetsDto): string {
  return assets.selection.businessId ?? firstId(assets.businesses);
}

export function MetaAssetsForm({ action, assets }: MetaAssetsFormProps) {
  const [businessId, setBusinessId] = useState(() => initialBusinessId(assets));

  const businessAdAccounts = useMemo(
    () => metaAdAccountsForBusiness(assets, businessId),
    [assets.adAccounts, businessId]
  );
  const businessPixels = useMemo(
    () => metaPixelsForBusiness(assets, businessId),
    [assets.pixels, businessId]
  );

  const [adAccountId, setAdAccountId] = useState(() => {
    const selected = assets.selection.adAccountId;
    const initialAccounts = metaAdAccountsForBusiness(
      assets,
      initialBusinessId(assets)
    );

    return selected && initialAccounts.some((item) => item.id === selected)
      ? selected
      : firstId(initialAccounts);
  });
  const [pixelId, setPixelId] = useState(() => {
    const selected = assets.selection.pixelId;
    const initialPixels = metaPixelsForBusiness(assets, initialBusinessId(assets));

    return selected && initialPixels.some((item) => item.id === selected)
      ? selected
      : firstId(initialPixels);
  });

  function handleBusinessChange(nextBusinessId: string) {
    const nextAdAccounts = metaAdAccountsForBusiness(assets, nextBusinessId);
    const nextPixels = metaPixelsForBusiness(assets, nextBusinessId);

    setBusinessId(nextBusinessId);
    setAdAccountId((current) =>
      nextAdAccounts.some((item) => item.id === current)
        ? current
        : firstId(nextAdAccounts)
    );
    setPixelId((current) =>
      nextPixels.some((item) => item.id === current) ? current : firstId(nextPixels)
    );
  }

  return (
    <form className="filter-bar" action={action}>
      <select
        className="filter-control"
        name="businessId"
        value={businessId}
        onChange={(event) => handleBusinessChange(event.currentTarget.value)}
        aria-label="Business Manager Meta"
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
        name="adAccountId"
        value={adAccountId}
        onChange={(event) => setAdAccountId(event.currentTarget.value)}
        aria-label="Conta de anuncio Meta"
      >
        <option value="">Sem conta</option>
        {businessAdAccounts.map((adAccount) => (
          <option key={adAccount.id} value={adAccount.id}>
            {adAccount.name}
          </option>
        ))}
      </select>
      <select
        className="filter-control"
        name="pixelId"
        value={pixelId}
        onChange={(event) => setPixelId(event.currentTarget.value)}
        aria-label="Pixel Meta"
      >
        <option value="">Sem Pixel</option>
        {businessPixels.map((pixel) => (
          <option key={pixel.id} value={pixel.id}>
            {pixel.name}
          </option>
        ))}
      </select>
      <button className="button" type="submit">
        Salvar selecao Meta
      </button>
    </form>
  );
}
