import React from 'react';

/** WppTrack — Card. Surface container with optional header + footer. */
export function Card({ children, title, eyebrow, action, footer, padding = 'md', interactive = false, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const pads = { none: '0', sm: '14px', md: '20px', lg: '24px' };
  const pad = pads[padding] ?? pads.md;
  return (
    <div
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${hover ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'box-shadow var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out)',
        cursor: interactive ? 'pointer' : 'default',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {(title || eyebrow || action) ? (
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          padding: `${pad === '0' ? '16px' : pad} ${pad === '0' ? '16px' : pad} 0`,
        }}>
          <div>
            {eyebrow ? (
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--fw-medium)',
                letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-brand)',
                marginBottom: 4,
              }}>{eyebrow}</div>
            ) : null}
            {title ? (
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-semibold)',
                letterSpacing: 'var(--tracking-tight)', color: 'var(--text-primary)',
              }}>{title}</div>
            ) : null}
          </div>
          {action ? <div style={{ flex: '0 0 auto' }}>{action}</div> : null}
        </div>
      ) : null}
      <div style={{ padding: pad }}>{children}</div>
      {footer ? (
        <div style={{
          padding: `12px ${pad === '0' ? '16px' : pad}`, borderTop: '1px solid var(--divider)',
          background: 'var(--bg-inset)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
        }}>{footer}</div>
      ) : null}
    </div>
  );
}
