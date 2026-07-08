import React from 'react';

/**
 * WppTrack — Button
 * Variants: primary | secondary | ghost | danger | signal
 * Sizes: sm | md | lg
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  type = 'button',
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);

  const sizes = {
    sm: { h: 'var(--control-sm)', px: '12px', fs: 'var(--text-sm)', gap: '6px', icon: 15 },
    md: { h: 'var(--control-md)', px: '16px', fs: 'var(--text-base)', gap: '8px', icon: 17 },
    lg: { h: 'var(--control-lg)', px: '22px', fs: 'var(--text-md)', gap: '9px', icon: 19 },
  };
  const s = sizes[size] || sizes.md;

  const palettes = {
    primary: {
      bg: hover ? 'var(--brand-hover)' : 'var(--brand)',
      color: 'var(--on-brand)',
      border: 'transparent',
      shadow: hover ? 'var(--shadow-brand)' : 'var(--shadow-xs)',
    },
    signal: {
      bg: hover ? 'var(--signal-500)' : 'var(--signal)',
      color: '#06231F',
      border: 'transparent',
      shadow: 'var(--shadow-xs)',
    },
    secondary: {
      bg: hover ? 'var(--bg-hover)' : 'var(--bg-surface)',
      color: 'var(--text-primary)',
      border: 'var(--border-strong)',
      shadow: 'none',
    },
    ghost: {
      bg: hover ? 'var(--bg-hover)' : 'transparent',
      color: 'var(--text-secondary)',
      border: 'transparent',
      shadow: 'none',
    },
    danger: {
      bg: hover ? 'var(--red-500)' : 'var(--danger)',
      color: '#fff',
      border: 'transparent',
      shadow: 'none',
    },
  };
  const p = palettes[variant] || palettes.primary;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        height: s.h,
        padding: `0 ${s.px}`,
        width: fullWidth ? '100%' : undefined,
        fontFamily: 'var(--font-body)',
        fontSize: s.fs,
        fontWeight: 'var(--fw-semibold)',
        lineHeight: 1,
        color: p.color,
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: p.shadow,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transform: active && !disabled ? 'translateY(1px)' : 'none',
        transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-base) var(--ease-out), transform var(--dur-fast) var(--ease-out)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {iconLeft ? <Glyph name={iconLeft} size={s.icon} /> : null}
      {children}
      {iconRight ? <Glyph name={iconRight} size={s.icon} /> : null}
    </button>
  );
}

/* Inline Lucide loader — renders an icon by name if lucide-static is reachable, else nothing. */
function Glyph({ name, size }) {
  const [svg, setSvg] = React.useState('');
  React.useEffect(() => {
    let on = true;
    fetch(`https://unpkg.com/lucide-static@latest/icons/${name}.svg`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => { if (on) setSvg(t); })
      .catch(() => {});
    return () => { on = false; };
  }, [name]);
  if (!svg) return null;
  return (
    <span
      aria-hidden
      style={{ display: 'inline-flex', width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${size}" height="${size}" stroke-width="2"`) }}
    />
  );
}
