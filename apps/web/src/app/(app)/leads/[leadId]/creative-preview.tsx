"use client";

import { ExternalLink, ImageOff } from "lucide-react";
import { useState } from "react";

type CreativePreviewProps = {
  adName: string;
  destinationUrl: string | null;
  thumbnailUrl: string | null;
};

export function CreativePreview({
  adName,
  destinationUrl,
  thumbnailUrl,
}: CreativePreviewProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(thumbnailUrl) && !imageFailed;

  return (
    <aside className="lead-creative-panel" aria-label="Criativo do anuncio">
      <div className="lead-creative-media">
        <span className="lead-creative-badge">Criativo</span>
        {showImage ? (
          <img
            alt={`Miniatura do anuncio ${adName}`}
            decoding="async"
            onError={() => setImageFailed(true)}
            src={thumbnailUrl ?? undefined}
          />
        ) : (
          <div className="lead-creative-placeholder">
            <ImageOff aria-hidden="true" size={24} strokeWidth={1.7} />
            <span>Miniatura indisponivel</span>
          </div>
        )}
      </div>

      <div className="lead-creative-caption">
        <div>
          <span className="micro-label">Anuncio atribuido</span>
          <strong title={adName}>{adName}</strong>
        </div>
        {destinationUrl ? (
          <a
            aria-label="Ver anuncio no Instagram em uma nova aba"
            className="button lead-creative-link"
            href={destinationUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <ExternalLink aria-hidden="true" size={16} strokeWidth={1.9} />
            Ver no Instagram
          </a>
        ) : null}
      </div>
    </aside>
  );
}
