import React from 'react';

export interface BadgeProps {
  children?: React.ReactNode;
  /** @default "neutral" */
  tone?: 'neutral' | 'brand' | 'signal' | 'success' | 'warning' | 'danger' | 'info';
  /** Show a leading status dot. @default false */
  dot?: boolean;
  /** Solid fill instead of subtle tint. @default false */
  solid?: boolean;
  style?: React.CSSProperties;
}

/**
 * Compact status pill — integration status, event state, lead quality, deltas.
 * @startingPoint section="Core" subtitle="Status badges & tones" viewport="700x120"
 */
export function Badge(props: BadgeProps): JSX.Element;
