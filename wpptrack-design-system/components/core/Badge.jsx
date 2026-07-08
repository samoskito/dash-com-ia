import React from 'react';

/** WppTrack — Badge. Compact status pill. */
export function Badge({ children, tone = 'neutral', dot = false, solid = false, style, ...rest }) {
  const tones = {
    neutral: { fg: 'var(--text-secondary)', bg: 'var(--bg-subtle)', dot: 'var(--gray-400)' },
    brand:   { fg: 'var(--text-brand)', bg: 'var(--brand-subtle)', dot: 'var(--brand)' },
    signal:  { fg: 'var(--signal-500)', bg: 'var(--signal-subtle)', dot: 'var(--signal)' },
    success: { fg: 'var(--success)', bg: 'var(--success-subtle)', dot: 'var(--success)' },
    warning: { fg: 'var(--amber-500)', bg: 'var(--warning-subtle)', dot: 'var(--warning)' },
    danger:  { fg: 'var(--danger)', bg: 'var(--danger-subtle)', dot: 'var(--danger)' },
    info:    { fg: 'var(--info)', bg: 'var(--info-subtle)', dot: 'var(--info)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-semibold)',
        lineHeight: 1, padding: '4px 9px', borderRadius: 'var(--radius-pill)',
        color: solid ? 'var(--on-brand)' : t.fg,
        background: solid ? t.dot : t.bg,
        ...style,
      }}
      {...rest}
    >
      {dot ? (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: solid ? 'currentColor' : t.dot, flex: '0 0 auto' }} />
      ) : null}
      {children}
    </span>
  );
}
