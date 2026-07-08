import React from 'react';

export interface StatCardProps {
  /** Mono uppercase metric label, e.g. "Leads no WhatsApp" */
  label: React.ReactNode;
  /** The big tabular number, e.g. "1.284" */
  value: React.ReactNode;
  /** Optional unit / suffix shown next to the value */
  unit?: React.ReactNode;
  /** Delta text, e.g. "+18%" — sign infers direction unless deltaDir is set */
  delta?: React.ReactNode;
  /** Force delta color/arrow */
  deltaDir?: 'up' | 'down';
  /** Muted text after the delta chip, e.g. "vs. 7 dias" */
  hint?: React.ReactNode;
  /** Optional icon node (Lucide SVG) in the top-right */
  icon?: React.ReactNode;
  /** Filled brand variant for the hero metric */
  accent?: boolean;
  style?: React.CSSProperties;
}

/**
 * The signature WppTrack metric tile: mono eyebrow → big tabular number → delta chip.
 * @startingPoint section="Core" subtitle="Metric / KPI tile with delta" viewport="700x180"
 */
export function StatCard(props: StatCardProps): JSX.Element;
