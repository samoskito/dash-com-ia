import React from 'react';

export interface ButtonProps {
  children?: React.ReactNode;
  /** Visual style. @default "primary" */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'signal';
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Lucide icon name shown before the label */
  iconLeft?: string;
  /** Lucide icon name shown after the label */
  iconRight?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}

/**
 * Primary action control for WppTrack. Use `primary` for the main CTA,
 * `signal` for "enviar conversão/evento" actions, `secondary`/`ghost` for
 * lower-emphasis actions, `danger` for destructive ones.
 *
 * @startingPoint section="Core" subtitle="Buttons — primary, signal, secondary, ghost" viewport="700x150"
 */
export function Button(props: ButtonProps): JSX.Element;
