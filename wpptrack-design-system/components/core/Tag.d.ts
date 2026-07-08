import React from 'react';

export interface TagProps {
  children?: React.ReactNode;
  /** Muted prefix label, e.g. "campanha:" */
  prefix?: React.ReactNode;
  /** When set, renders a × remove button */
  onRemove?: (e: React.MouseEvent) => void;
  /** Selected/active state (brand tint) */
  active?: boolean;
  style?: React.CSSProperties;
}

/** Mono filter chip for campaign / adset / ad / UTM values. Removable when `onRemove` is set. */
export function Tag(props: TagProps): JSX.Element;
