import type { ReactNode } from "react";

export function PresentationMask({
  children,
  className,
  placeholder,
}: {
  children?: ReactNode;
  className?: string;
  placeholder: string;
}) {
  return (
    <span
      className={`presentation-mask${className ? ` ${className}` : ""}`}
      data-presentation-sensitive="true"
    >
      <span className="presentation-mask-value">{children}</span>
      <span className="presentation-mask-placeholder">{placeholder}</span>
    </span>
  );
}
