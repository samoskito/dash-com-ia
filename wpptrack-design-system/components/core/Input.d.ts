import React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: React.ReactNode;
  /** Helper text below the field */
  hint?: React.ReactNode;
  /** Error message — turns the border red and replaces the hint */
  error?: React.ReactNode;
  /** Icon node rendered inside, left of the text */
  iconLeft?: React.ReactNode;
  /** Mono prefix inside the field, e.g. "utm_" */
  prefix?: React.ReactNode;
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

/** Labelled text field with focus ring, optional icon/prefix, hint and error states. */
export function Input(props: InputProps): JSX.Element;
