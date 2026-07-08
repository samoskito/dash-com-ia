import React from 'react';

export interface CardProps {
  children?: React.ReactNode;
  /** Heading (Space Grotesk) */
  title?: React.ReactNode;
  /** Tiny mono uppercase label above the title */
  eyebrow?: React.ReactNode;
  /** Element rendered at the top-right of the header */
  action?: React.ReactNode;
  /** Footer strip on an inset background */
  footer?: React.ReactNode;
  /** @default "md" */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover lift + cursor when the whole card is clickable */
  interactive?: boolean;
  style?: React.CSSProperties;
}

/**
 * Surface container — the base panel for dashboards and content.
 * @startingPoint section="Core" subtitle="Card surface with eyebrow / title / footer" viewport="700x260"
 */
export function Card(props: CardProps): JSX.Element;
