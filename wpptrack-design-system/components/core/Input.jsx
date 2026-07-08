import React from 'react';

/** WppTrack — Input. Labelled text field with optional icon, prefix, hint/error. */
export function Input({
  label, hint, error, iconLeft, prefix, size = 'md', id,
  disabled = false, style, ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const heights = { sm: 'var(--control-sm)', md: 'var(--control-md)', lg: 'var(--control-lg)' };
  const fid = id || React.useId();
  const borderColor = error ? 'var(--danger)' : focus ? 'var(--brand)' : 'var(--border-strong)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label ? (
        <label htmlFor={fid} style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 'var(--fw-medium)',
          color: 'var(--text-secondary)',
        }}>{label}</label>
      ) : null}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        height: heights[size] || heights.md, padding: '0 12px',
        background: disabled ? 'var(--bg-subtle)' : 'var(--bg-surface)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: focus && !error ? 'var(--shadow-focus)' : 'none',
        transition: 'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
      }}>
        {iconLeft ? <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }}>{iconLeft}</span> : null}
        {prefix ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{prefix}</span> : null}
        <input
          id={fid}
          disabled={disabled}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', color: 'var(--text-primary)',
          }}
          {...rest}
        />
      </div>
      {error ? (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{hint}</span>
      ) : null}
    </div>
  );
}
