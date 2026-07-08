import React from 'react';

/** WppTrack — Tag. Mono filter chip for campaign / adset / ad / UTM, optionally removable. */
export function Tag({ children, prefix, onRemove, active = false, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-medium)',
        lineHeight: 1, padding: '5px 9px', borderRadius: 'var(--radius-sm)',
        color: active ? 'var(--text-brand)' : 'var(--text-secondary)',
        background: active ? 'var(--brand-subtle)' : 'var(--bg-subtle)',
        border: `1px solid ${active ? 'var(--brand-border)' : 'var(--border)'}`,
        transition: 'background var(--dur-fast) var(--ease-out)',
        ...style,
      }}
      {...rest}
    >
      {prefix ? <span style={{ color: 'var(--text-muted)' }}>{prefix}</span> : null}
      {children}
      {onRemove ? (
        <button
          onClick={onRemove}
          aria-label="Remover"
          style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginLeft: 1,
            color: hover ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 14, lineHeight: 1,
            fontFamily: 'var(--font-body)',
          }}
        >×</button>
      ) : null}
    </span>
  );
}
