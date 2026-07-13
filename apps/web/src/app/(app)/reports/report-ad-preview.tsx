"use client";

import { ImageOff, Maximize2, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

type HoverPosition = {
  left: number;
  top: number;
};

const hoverWidth = 248;
const hoverGap = 10;

export function ReportAdPreview({
  adName,
  thumbnailUrl,
}: {
  adName: string;
  thumbnailUrl?: string | null;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<HoverPosition | null>(
    null,
  );
  const imageAvailable = Boolean(thumbnailUrl && !imageFailed);

  function showHoverPreview() {
    if (!imageAvailable || !buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const fitsOnRight = rect.right + hoverGap + hoverWidth < window.innerWidth;
    const left = fitsOnRight
      ? rect.right + hoverGap
      : Math.max(12, rect.left - hoverWidth - hoverGap);
    const top = Math.min(
      Math.max(12, rect.top - 70),
      Math.max(12, window.innerHeight - 372),
    );

    setHoverPosition({ left, top });
  }

  function hideHoverPreview() {
    setHoverPosition(null);
  }

  if (!imageAvailable) {
    return (
      <span
        aria-label="Miniatura indisponivel"
        className="report-ad-thumbnail unavailable"
        role="img"
        title="Miniatura indisponivel"
      >
        <ImageOff aria-hidden="true" size={17} strokeWidth={1.7} />
      </span>
    );
  }

  return (
    <>
      <button
        aria-label={`Ampliar criativo do anuncio ${adName}`}
        className="report-ad-thumbnail"
        onBlur={hideHoverPreview}
        onClick={() => dialogRef.current?.showModal()}
        onFocus={showHoverPreview}
        onMouseEnter={showHoverPreview}
        onMouseLeave={hideHoverPreview}
        ref={buttonRef}
        title="Ampliar criativo"
        type="button"
      >
        <img
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
          referrerPolicy="no-referrer"
          src={thumbnailUrl ?? undefined}
        />
        <span aria-hidden="true" className="report-ad-thumbnail-action">
          <Maximize2 size={13} strokeWidth={2.2} />
        </span>
      </button>

      {hoverPosition
        ? createPortal(
            <div
              aria-hidden="true"
              className="report-ad-hover-preview"
              style={hoverPosition}
            >
              <img
                alt=""
                referrerPolicy="no-referrer"
                src={thumbnailUrl ?? undefined}
              />
              <strong>{adName}</strong>
            </div>,
            document.body,
          )
        : null}

      <dialog className="report-ad-preview-dialog" ref={dialogRef}>
        <div className="report-ad-preview-header">
          <div>
            <span className="micro-label">Criativo do anuncio</span>
            <h3>{adName}</h3>
          </div>
          <button
            aria-label="Fechar"
            className="meta-dialog-close"
            onClick={() => dialogRef.current?.close()}
            title="Fechar"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="report-ad-preview-stage">
          <img
            alt={`Criativo do anuncio ${adName}`}
            referrerPolicy="no-referrer"
            src={thumbnailUrl ?? undefined}
          />
        </div>
      </dialog>
    </>
  );
}
