import React from 'react';

/**
 * WppTrack — StatCard. The signature metric tile:
 * mono eyebrow → big tabular value → delta chip (+ optional sparkline area).
 */
export function StatCard({ label, value, unit, delta, deltaDir, hint, icon, accent = false, style, ...rest }) {
  const dir = deltaDir || (delta == null ? null : String(delta).trim().startsWith('-') ? 'down' : 'up');
  const deltaColor = dir === 'down' ? 'var(--danger)' : 'var(--success)';
  return (
    <div
      style={{
        background: accent ? 'var(--brand)' : 'var(--bg-surface)',
        border: `1px solid ${accent ? 'transparent' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: accent ? 'var(--shadow-brand)' : 'var(--shadow-sm)',
        padding: '18px 18px 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--fw-medium)',
          letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase',
          color: accent ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)',
        }}>{label}</span>
        {icon ? (
          <span style={{
            display: 'inline-flex', width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
            background: accent ? 'rgba(255,255,255,0.16)' : 'var(--brand-subtle)',
            color: accent ? '#fff' : 'var(--brand)',
          }}>{icon}</span>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', fontWeight: 'var(--fw-semibold)',
          letterSpacing: 'var(--tracking-tight)', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          color: accent ? '#fff' : 'var(--text-primary)',
        }}>{value}</span>
        {unit ? (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: accent ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}>{unit}</span>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {delta != null ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-semibold)',
            padding: '2px 7px', borderRadius: 'var(--radius-pill)',
            color: accent ? '#fff' : deltaColor,
            background: accent ? 'rgba(255,255,255,0.16)' : (dir === 'down' ? 'var(--danger-subtle)' : 'var(--success-subtle)'),
          }}>{dir === 'down' ? '▾' : '▴'} {delta}</span>
        ) : null}
        {hint ? (
          <span style={{ fontSize: 'var(--text-xs)', color: accent ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}>{hint}</span>
        ) : null}
      </div>
    </div>
  );
}
