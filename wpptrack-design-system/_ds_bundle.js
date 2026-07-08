/* @ds-bundle: {"format":3,"namespace":"WppTrackDesignSystem_851504","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"StatCard","sourcePath":"components/core/StatCard.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"b5b0bfaf67d7","components/core/Button.jsx":"ff57d40305b8","components/core/Card.jsx":"4567239ae790","components/core/Input.jsx":"69c8ac188b26","components/core/StatCard.jsx":"6166f43e6dff","components/core/Tag.jsx":"99a630f04577","ui_kits/dashboard/App.jsx":"489e80b3acd8","ui_kits/dashboard/AppShell.jsx":"505147c122d7","ui_kits/dashboard/data.js":"d7117898b5b3","ui_kits/dashboard/modals.jsx":"17f9db909079","ui_kits/dashboard/screens/ClienteConfig.jsx":"850f13acf67b","ui_kits/dashboard/screens/ClienteDetalhe.jsx":"900adde92855","ui_kits/dashboard/screens/Clientes.jsx":"1de6566db3d9","ui_kits/dashboard/screens/Configuracoes.jsx":"04724628fdbe","ui_kits/dashboard/screens/LeadDetalhe.jsx":"0265dc343481","ui_kits/dashboard/screens/Overview.jsx":"58f98e5941cd","ui_kits/dashboard/screens/RelatorioCliente.jsx":"c97851f749ea","ui_kits/dashboard/screens/Relatorios.jsx":"e81410e54c13","ui_kits/dashboard/screens/Sistema.jsx":"fae362504165","ui_kits/dashboard/shared.jsx":"12aa133eacc3"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.WppTrackDesignSystem_851504 = window.WppTrackDesignSystem_851504 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** WppTrack — Badge. Compact status pill. */
function Badge({
  children,
  tone = 'neutral',
  dot = false,
  solid = false,
  style,
  ...rest
}) {
  const tones = {
    neutral: {
      fg: 'var(--text-secondary)',
      bg: 'var(--bg-subtle)',
      dot: 'var(--gray-400)'
    },
    brand: {
      fg: 'var(--text-brand)',
      bg: 'var(--brand-subtle)',
      dot: 'var(--brand)'
    },
    signal: {
      fg: 'var(--signal-500)',
      bg: 'var(--signal-subtle)',
      dot: 'var(--signal)'
    },
    success: {
      fg: 'var(--success)',
      bg: 'var(--success-subtle)',
      dot: 'var(--success)'
    },
    warning: {
      fg: 'var(--amber-500)',
      bg: 'var(--warning-subtle)',
      dot: 'var(--warning)'
    },
    danger: {
      fg: 'var(--danger)',
      bg: 'var(--danger-subtle)',
      dot: 'var(--danger)'
    },
    info: {
      fg: 'var(--info)',
      bg: 'var(--info-subtle)',
      dot: 'var(--info)'
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--fw-semibold)',
      lineHeight: 1,
      padding: '4px 9px',
      borderRadius: 'var(--radius-pill)',
      color: solid ? 'var(--on-brand)' : t.fg,
      background: solid ? t.dot : t.bg,
      ...style
    }
  }, rest), dot ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: solid ? 'currentColor' : t.dot,
      flex: '0 0 auto'
    }
  }) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * WppTrack — Button
 * Variants: primary | secondary | ghost | danger | signal
 * Sizes: sm | md | lg
 */
function Button({
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
    sm: {
      h: 'var(--control-sm)',
      px: '12px',
      fs: 'var(--text-sm)',
      gap: '6px',
      icon: 15
    },
    md: {
      h: 'var(--control-md)',
      px: '16px',
      fs: 'var(--text-base)',
      gap: '8px',
      icon: 17
    },
    lg: {
      h: 'var(--control-lg)',
      px: '22px',
      fs: 'var(--text-md)',
      gap: '9px',
      icon: 19
    }
  };
  const s = sizes[size] || sizes.md;
  const palettes = {
    primary: {
      bg: hover ? 'var(--brand-hover)' : 'var(--brand)',
      color: 'var(--on-brand)',
      border: 'transparent',
      shadow: hover ? 'var(--shadow-brand)' : 'var(--shadow-xs)'
    },
    signal: {
      bg: hover ? 'var(--signal-500)' : 'var(--signal)',
      color: '#06231F',
      border: 'transparent',
      shadow: 'var(--shadow-xs)'
    },
    secondary: {
      bg: hover ? 'var(--bg-hover)' : 'var(--bg-surface)',
      color: 'var(--text-primary)',
      border: 'var(--border-strong)',
      shadow: 'none'
    },
    ghost: {
      bg: hover ? 'var(--bg-hover)' : 'transparent',
      color: 'var(--text-secondary)',
      border: 'transparent',
      shadow: 'none'
    },
    danger: {
      bg: hover ? 'var(--red-500)' : 'var(--danger)',
      color: '#fff',
      border: 'transparent',
      shadow: 'none'
    }
  };
  const p = palettes[variant] || palettes.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    style: {
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
      ...style
    }
  }, rest), iconLeft ? /*#__PURE__*/React.createElement(Glyph, {
    name: iconLeft,
    size: s.icon
  }) : null, children, iconRight ? /*#__PURE__*/React.createElement(Glyph, {
    name: iconRight,
    size: s.icon
  }) : null);
}

/* Inline Lucide loader — renders an icon by name if lucide-static is reachable, else nothing. */
function Glyph({
  name,
  size
}) {
  const [svg, setSvg] = React.useState('');
  React.useEffect(() => {
    let on = true;
    fetch(`https://unpkg.com/lucide-static@latest/icons/${name}.svg`).then(r => r.ok ? r.text() : '').then(t => {
      if (on) setSvg(t);
    }).catch(() => {});
    return () => {
      on = false;
    };
  }, [name]);
  if (!svg) return null;
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      display: 'inline-flex',
      width: size,
      height: size
    },
    dangerouslySetInnerHTML: {
      __html: svg.replace('<svg', `<svg width="${size}" height="${size}" stroke-width="2"`)
    }
  });
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** WppTrack — Card. Surface container with optional header + footer. */
function Card({
  children,
  title,
  eyebrow,
  action,
  footer,
  padding = 'md',
  interactive = false,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const pads = {
    none: '0',
    sm: '14px',
    md: '20px',
    lg: '24px'
  };
  const pad = pads[padding] ?? pads.md;
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => interactive && setHover(true),
    onMouseLeave: () => interactive && setHover(false),
    style: {
      background: 'var(--bg-surface)',
      border: `1px solid ${hover ? 'var(--border-strong)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
      transition: 'box-shadow var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out)',
      cursor: interactive ? 'pointer' : 'default',
      overflow: 'hidden',
      ...style
    }
  }, rest), title || eyebrow || action ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      padding: `${pad === '0' ? '16px' : pad} ${pad === '0' ? '16px' : pad} 0`
    }
  }, /*#__PURE__*/React.createElement("div", null, eyebrow ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-2xs)',
      fontWeight: 'var(--fw-medium)',
      letterSpacing: 'var(--tracking-caps)',
      textTransform: 'uppercase',
      color: 'var(--text-brand)',
      marginBottom: 4
    }
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 'var(--fw-semibold)',
      letterSpacing: 'var(--tracking-tight)',
      color: 'var(--text-primary)'
    }
  }, title) : null), action ? /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 auto'
    }
  }, action) : null) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: pad
    }
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: `12px ${pad === '0' ? '16px' : pad}`,
      borderTop: '1px solid var(--divider)',
      background: 'var(--bg-inset)',
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)'
    }
  }, footer) : null);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** WppTrack — Input. Labelled text field with optional icon, prefix, hint/error. */
function Input({
  label,
  hint,
  error,
  iconLeft,
  prefix,
  size = 'md',
  id,
  disabled = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const heights = {
    sm: 'var(--control-sm)',
    md: 'var(--control-md)',
    lg: 'var(--control-lg)'
  };
  const fid = id || React.useId();
  const borderColor = error ? 'var(--danger)' : focus ? 'var(--brand)' : 'var(--border-strong)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: fid,
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--text-secondary)'
    }
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: heights[size] || heights.md,
      padding: '0 12px',
      background: disabled ? 'var(--bg-subtle)' : 'var(--bg-surface)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: focus && !error ? 'var(--shadow-focus)' : 'none',
      transition: 'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)'
    }
  }, iconLeft ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: 'var(--text-muted)'
    }
  }, iconLeft) : null, prefix ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, prefix) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: fid,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-base)',
      color: 'var(--text-primary)'
    }
  }, rest))), error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--danger)'
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * WppTrack — StatCard. The signature metric tile:
 * mono eyebrow → big tabular value → delta chip (+ optional sparkline area).
 */
function StatCard({
  label,
  value,
  unit,
  delta,
  deltaDir,
  hint,
  icon,
  accent = false,
  style,
  ...rest
}) {
  const dir = deltaDir || (delta == null ? null : String(delta).trim().startsWith('-') ? 'down' : 'up');
  const deltaColor = dir === 'down' ? 'var(--danger)' : 'var(--success)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: accent ? 'var(--brand)' : 'var(--bg-surface)',
      border: `1px solid ${accent ? 'transparent' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      boxShadow: accent ? 'var(--shadow-brand)' : 'var(--shadow-sm)',
      padding: '18px 18px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-2xs)',
      fontWeight: 'var(--fw-medium)',
      letterSpacing: 'var(--tracking-caps)',
      textTransform: 'uppercase',
      color: accent ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)'
    }
  }, label), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      background: accent ? 'rgba(255,255,255,0.16)' : 'var(--brand-subtle)',
      color: accent ? '#fff' : 'var(--brand)'
    }
  }, icon) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-4xl)',
      fontWeight: 'var(--fw-semibold)',
      letterSpacing: 'var(--tracking-tight)',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
      color: accent ? '#fff' : 'var(--text-primary)'
    }
  }, value), unit ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)',
      color: accent ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)'
    }
  }, unit) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, delta != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--fw-semibold)',
      padding: '2px 7px',
      borderRadius: 'var(--radius-pill)',
      color: accent ? '#fff' : deltaColor,
      background: accent ? 'rgba(255,255,255,0.16)' : dir === 'down' ? 'var(--danger-subtle)' : 'var(--success-subtle)'
    }
  }, dir === 'down' ? '▾' : '▴', " ", delta) : null, hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: accent ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)'
    }
  }, hint) : null));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** WppTrack — Tag. Mono filter chip for campaign / adset / ad / UTM, optionally removable. */
function Tag({
  children,
  prefix,
  onRemove,
  active = false,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--fw-medium)',
      lineHeight: 1,
      padding: '5px 9px',
      borderRadius: 'var(--radius-sm)',
      color: active ? 'var(--text-brand)' : 'var(--text-secondary)',
      background: active ? 'var(--brand-subtle)' : 'var(--bg-subtle)',
      border: `1px solid ${active ? 'var(--brand-border)' : 'var(--border)'}`,
      transition: 'background var(--dur-fast) var(--ease-out)',
      ...style
    }
  }, rest), prefix ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, prefix) : null, children, onRemove ? /*#__PURE__*/React.createElement("button", {
    onClick: onRemove,
    "aria-label": "Remover",
    style: {
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: 0,
      marginLeft: 1,
      color: hover ? 'var(--text-primary)' : 'var(--text-muted)',
      fontSize: 14,
      lineHeight: 1,
      fontFamily: 'var(--font-body)'
    }
  }, "\xD7") : null);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/App.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* WppTrack — Integrações: Meta Pixel connections across clients. */
function Integracoes({
  theme,
  onNav,
  onToggleTheme,
  openModal
}) {
  const {
    Icon,
    ClientAvatar,
    AppShell,
    MiniStat
  } = window;
  const {
    Button,
    Card,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const pixels = WT.CLIENTS.flatMap(c => c.pixels.map(p => ({
    ...p,
    client: c
  })));
  const tone = {
    ok: 'success',
    warn: 'warning',
    err: 'danger'
  };
  const txt = {
    ok: 'Conectado',
    warn: 'Sincronizando',
    err: 'Erro'
  };
  const actions = /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "message-circle",
    onClick: () => openModal({
      type: 'whatsapp'
    })
  }, "Conectar WhatsApp"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "plus",
    onClick: () => openModal({
      type: 'pixel'
    })
  }, "Conectar pixel"));
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "integracoes",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    title: "Integra\xE7\xF5es",
    actions: actions
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(window.MiniStat, {
    icon: "plug",
    label: "Pixels conectados",
    value: WT.TOTALS.pixels
  }), /*#__PURE__*/React.createElement(window.MiniStat, {
    icon: "send",
    label: "Eventos enviados hoje",
    value: "1.284"
  }), /*#__PURE__*/React.createElement(window.MiniStat, {
    icon: "check-circle",
    label: "Sa\xFAde da integra\xE7\xE3o",
    value: "98%"
  })), /*#__PURE__*/React.createElement(Card, {
    padding: "none"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 18px',
      borderBottom: '1px solid var(--divider)',
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Pixels da Meta"), /*#__PURE__*/React.createElement("div", null, pixels.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.id + i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 18px',
      borderBottom: i < pixels.length - 1 ? '1px solid var(--divider)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-subtle)',
      color: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "activity",
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, "ID ", p.id)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(ClientAvatar, {
    client: p.client,
    size: 24
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-secondary)',
      width: 130
    }
  }, p.client.name)), /*#__PURE__*/React.createElement(Badge, {
    tone: tone[p.status],
    dot: true
  }, txt[p.status]), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconLeft: "settings"
  }, "Gerenciar"))))));
}

/* Router — owns navigation + theme + modals, renders the active screen. */
function App() {
  const {
    useState,
    useEffect
  } = React;
  const [theme, setTheme] = useState('light');
  const [route, setRoute] = useState({
    screen: 'overview'
  });
  const [modal, setModal] = useState(null);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const nav = (screen, clientId) => setRoute(clientId ? {
    screen,
    clientId
  } : {
    screen
  });
  const openClient = clientId => setRoute({
    screen: 'clienteDetalhe',
    clientId
  });
  const openLead = leadId => setRoute({
    screen: 'leadDetalhe',
    leadId,
    clientId: route.clientId
  });
  const openModal = m => setModal(m);
  const closeModal = () => setModal(null);
  const common = {
    theme,
    onNav: nav,
    onToggleTheme: toggle,
    openModal
  };
  let screen;
  switch (route.screen) {
    case 'overview':
      screen = /*#__PURE__*/React.createElement(window.Overview, _extends({}, common, {
        onOpenClient: openClient
      }));
      break;
    case 'clientes':
      screen = /*#__PURE__*/React.createElement(window.Clientes, _extends({}, common, {
        onOpenClient: openClient,
        onNovoCliente: () => openModal({
          type: 'cliente'
        })
      }));
      break;
    case 'clienteDetalhe':
      screen = /*#__PURE__*/React.createElement(window.ClienteDetalhe, _extends({}, common, {
        clientId: route.clientId,
        onOpenLead: openLead,
        onBack: () => nav('clientes')
      }));
      break;
    case 'clienteConfig':
      screen = /*#__PURE__*/React.createElement(window.ClienteConfig, _extends({}, common, {
        clientId: route.clientId,
        onBack: () => openClient(route.clientId)
      }));
      break;
    case 'leadDetalhe':
      screen = /*#__PURE__*/React.createElement(window.LeadDetalhe, _extends({}, common, {
        leadId: route.leadId,
        onBack: () => route.clientId ? openClient(route.clientId) : nav('clientes')
      }));
      break;
    case 'leads':
      screen = /*#__PURE__*/React.createElement(window.Clientes, _extends({}, common, {
        onOpenClient: openClient,
        onNovoCliente: () => openModal({
          type: 'cliente'
        })
      }));
      break;
    case 'relatorios':
      screen = /*#__PURE__*/React.createElement(window.Relatorios, _extends({}, common, {
        onOpenReport: id => setRoute({
          screen: 'relatorioCliente',
          clientId: id || window.WT.CLIENTS[0].id
        })
      }));
      break;
    case 'relatorioCliente':
      screen = /*#__PURE__*/React.createElement(window.RelatorioCliente, _extends({}, common, {
        clientId: route.clientId,
        onBack: () => nav('relatorios')
      }));
      break;
    case 'integracoes':
      screen = /*#__PURE__*/React.createElement(window.Integracoes, common);
      break;
    case 'configuracoes':
      screen = /*#__PURE__*/React.createElement(window.Configuracoes, common);
      break;
    case 'sistema':
      screen = /*#__PURE__*/React.createElement(window.Sistema, common);
      break;
    default:
      screen = /*#__PURE__*/React.createElement(window.Overview, _extends({}, common, {
        onOpenClient: openClient
      }));
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, screen, modal && modal.type === 'pixel' ? /*#__PURE__*/React.createElement(window.ConectarPixelModal, {
    onClose: closeModal
  }) : null, modal && modal.type === 'whatsapp' ? /*#__PURE__*/React.createElement(window.ConectarWhatsAppModal, {
    client: modal.client,
    onClose: closeModal
  }) : null, modal && modal.type === 'cliente' ? /*#__PURE__*/React.createElement(window.NovoClienteModal, {
    onClose: closeModal
  }) : null, modal && modal.type === 'provedor' ? /*#__PURE__*/React.createElement(window.ProvedorConfigModal, {
    providerId: modal.providerId,
    onClose: closeModal
  }) : null, modal && modal.type === 'bm' ? /*#__PURE__*/React.createElement(window.ConectarBMModal, {
    onClose: closeModal
  }) : null);
}
Object.assign(window, {
  Integracoes,
  WppApp: App
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/AppShell.jsx
try { (() => {
/* WppTrack — AppShell: sidebar (agency nav) + topbar. Wraps every screen. */
function AppShell({
  active,
  onNav,
  theme,
  onToggleTheme,
  title,
  subtitle,
  breadcrumb,
  actions,
  children
}) {
  const Icon = window.Icon;
  const NAV = [{
    id: 'overview',
    label: 'Visão geral',
    icon: 'layout-dashboard'
  }, {
    id: 'clientes',
    label: 'Clientes',
    icon: 'users'
  }, {
    id: 'leads',
    label: 'Leads',
    icon: 'message-circle'
  }, {
    id: 'relatorios',
    label: 'Relatórios',
    icon: 'bar-chart-3'
  }, {
    id: 'integracoes',
    label: 'Integrações',
    icon: 'plug'
  }, {
    id: 'configuracoes',
    label: 'Configurações',
    icon: 'settings'
  }];
  const logo = theme === 'dark' ? '../../assets/logo-horizontal-light.svg' : '../../assets/logo-horizontal.svg';
  const navActive = ['clienteDetalhe'].includes(active) ? 'clientes' : ['leadDetalhe'].includes(active) ? 'clientes' : active;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-app)'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 'var(--sidebar-w)',
      flex: '0 0 var(--sidebar-w)',
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      height: '100vh'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 'var(--topbar-h)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: logo,
    alt: "WppTrack",
    style: {
      height: 22
    }
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      padding: '10px 10px 6px'
    }
  }, "Opera\xE7\xE3o"), NAV.map(n => {
    const on = navActive === n.id;
    return /*#__PURE__*/React.createElement("button", {
      key: n.id,
      onClick: () => onNav(n.id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 10px',
        borderRadius: 'var(--radius-md)',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-base)',
        fontWeight: on ? 'var(--fw-semibold)' : 'var(--fw-medium)',
        color: on ? 'var(--text-brand)' : 'var(--text-secondary)',
        background: on ? 'var(--brand-subtle)' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: n.icon,
      size: 18,
      color: on ? 'var(--brand)' : 'var(--text-muted)'
    }), n.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12,
      borderTop: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onNav('sistema'),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 10px',
      width: '100%',
      border: 'none',
      background: navActive === 'sistema' ? 'var(--brand-subtle)' : 'transparent',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 'var(--radius-md)',
      background: 'linear-gradient(135deg,var(--teal-500),var(--teal-700))',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: '-0.5'
    }
  }, "AN"), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.2,
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, "Ag\xEAncia Norte"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, "6 clientes \xB7 9 pixels")), /*#__PURE__*/React.createElement(Icon, {
    name: "settings",
    size: 15,
    color: "var(--text-muted)"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      minHeight: 'var(--topbar-h)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '0 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, breadcrumb ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 1
    }
  }, breadcrumb) : null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-xl)',
      fontWeight: 600,
      letterSpacing: 'var(--tracking-tight)',
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flex: '0 0 auto'
    }
  }, actions, /*#__PURE__*/React.createElement("button", {
    onClick: onToggleTheme,
    "aria-label": "Alternar tema",
    style: {
      width: 'var(--control-sm)',
      height: 'var(--control-sm)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      cursor: 'pointer',
      color: 'var(--text-secondary)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: theme === 'dark' ? 'sun' : 'moon',
    size: 15
  })))), /*#__PURE__*/React.createElement("main", {
    style: {
      padding: 'var(--content-pad)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, children)));
}

/* Small shared pieces used across screens */
function ClientAvatar({
  client,
  size = 34
}) {
  const TINTS = {
    teal: '#0E8C7A',
    deep: '#0A5E53',
    blue: '#2F73E8',
    amber: '#C77D12',
    slate: '#46555F',
    violet: '#6B57C2'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      flex: `0 0 ${size}px`,
      borderRadius: 'var(--radius-md)',
      background: TINTS[client.tint] || '#0E8C7A',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: size * 0.36,
      letterSpacing: '-0.3'
    }
  }, client.initials);
}
function Segmented({
  options,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      padding: 3,
      gap: 2,
      background: 'var(--bg-inset)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)'
    }
  }, options.map(o => {
    const on = o.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: o.value,
      onClick: () => onChange(o.value),
      style: {
        border: 'none',
        cursor: 'pointer',
        padding: '5px 12px',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-sm)',
        fontWeight: on ? 600 : 500,
        color: on ? 'var(--text-brand)' : 'var(--text-secondary)',
        background: on ? 'var(--bg-surface)' : 'transparent',
        boxShadow: on ? 'var(--shadow-xs)' : 'none'
      }
    }, o.label);
  }));
}
Object.assign(window, {
  AppShell,
  ClientAvatar,
  Segmented
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/data.js
try { (() => {
/* WppTrack — mock data for the agency dashboard UI kit.
   Plain JS (no JSX). Sets window.WT. Agency → clients (1 level).
   Metrics: conversas iniciadas / rastreadas / não rastreadas + conversões (Pixel). */
(function () {
  const BRL = n => 'R$ ' + n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const NUM = n => n.toLocaleString('pt-BR');

  // categorical avatar tints (subtle, brand-adjacent) for client identity
  const TINTS = {
    teal: {
      bg: '#0E8C7A',
      fg: '#fff'
    },
    deep: {
      bg: '#0A5E53',
      fg: '#fff'
    },
    blue: {
      bg: '#2F73E8',
      fg: '#fff'
    },
    amber: {
      bg: '#C77D12',
      fg: '#fff'
    },
    slate: {
      bg: '#46555F',
      fg: '#fff'
    },
    violet: {
      bg: '#6B57C2',
      fg: '#fff'
    }
  };
  const CLIENTS = [{
    id: 'c1',
    name: 'Clínica Vértice',
    initials: 'CV',
    tint: 'teal',
    segment: 'Saúde · Estética',
    pixels: [{
      id: '418•••2207',
      name: 'Vértice — Principal',
      status: 'ok'
    }, {
      id: '992•••1043',
      name: 'Vértice — Unidade Sul',
      status: 'ok'
    }],
    conversas: 1840,
    rastreadas: 1602,
    naoRastreadas: 238,
    conversoes: 612,
    investimento: 8420.00,
    receita: 41800.00,
    leads7d: 286,
    deltaConversas: 18,
    deltaRastreio: 4
  }, {
    id: 'c2',
    name: 'AutoPrime Veículos',
    initials: 'AP',
    tint: 'blue',
    segment: 'Automotivo',
    pixels: [{
      id: '551•••8890',
      name: 'AutoPrime — Seminovos',
      status: 'ok'
    }],
    conversas: 2470,
    rastreadas: 1980,
    naoRastreadas: 490,
    conversoes: 540,
    investimento: 12300.00,
    receita: 58900.00,
    leads7d: 402,
    deltaConversas: 9,
    deltaRastreio: -3
  }, {
    id: 'c3',
    name: 'EduMais Cursos',
    initials: 'EM',
    tint: 'amber',
    segment: 'Educação · Infoproduto',
    pixels: [{
      id: '203•••4471',
      name: 'EduMais — Lançamento',
      status: 'warn'
    }, {
      id: '203•••4480',
      name: 'EduMais — Perpétuo',
      status: 'ok'
    }],
    conversas: 3120,
    rastreadas: 2884,
    naoRastreadas: 236,
    conversoes: 988,
    investimento: 15600.00,
    receita: 92400.00,
    leads7d: 514,
    deltaConversas: 27,
    deltaRastreio: 6
  }, {
    id: 'c4',
    name: 'Studio Bloom',
    initials: 'SB',
    tint: 'violet',
    segment: 'Beleza · Franquia',
    pixels: [{
      id: '770•••6612',
      name: 'Bloom — Rede',
      status: 'ok'
    }],
    conversas: 980,
    rastreadas: 742,
    naoRastreadas: 238,
    conversoes: 214,
    investimento: 4200.00,
    receita: 18600.00,
    leads7d: 168,
    deltaConversas: -6,
    deltaRastreio: 2
  }, {
    id: 'c5',
    name: 'Imobiliária Norte',
    initials: 'IN',
    tint: 'slate',
    segment: 'Imobiliário',
    pixels: [{
      id: '634•••2218',
      name: 'Norte — Lançamentos',
      status: 'ok'
    }, {
      id: '634•••2230',
      name: 'Norte — Locação',
      status: 'err'
    }],
    conversas: 1530,
    rastreadas: 1180,
    naoRastreadas: 350,
    conversoes: 286,
    investimento: 9800.00,
    receita: 47200.00,
    leads7d: 242,
    deltaConversas: 12,
    deltaRastreio: -1
  }, {
    id: 'c6',
    name: 'FitPro Suplementos',
    initials: 'FP',
    tint: 'deep',
    segment: 'E-commerce',
    pixels: [{
      id: '845•••9904',
      name: 'FitPro — Catálogo',
      status: 'ok'
    }],
    conversas: 1290,
    rastreadas: 1166,
    naoRastreadas: 124,
    conversoes: 430,
    investimento: 6100.00,
    receita: 33500.00,
    leads7d: 208,
    deltaConversas: 15,
    deltaRastreio: 5
  }];

  // derive per-client rates + roas + cpl
  CLIENTS.forEach(c => {
    c.taxaRastreio = Math.round(c.rastreadas / c.conversas * 100);
    c.roas = +(c.receita / c.investimento).toFixed(2);
    c.cpl = +(c.investimento / c.conversas).toFixed(2);
  });
  const CAMPAIGNS = ['black-friday', 'remarketing-7d', 'prospeccao-frio', 'lookalike-2%', 'lancamento-abril', 'institucional'];
  const ADSETS = ['lookalike-2%', 'interesses-amplo', 'visitantes-site', 'engajou-ig', 'lookalike-1%', 'retargeting-vídeo'];
  const ADS = ['video-depoimento', 'carrossel-oferta', 'imagem-prova', 'reels-bastidor', 'video-curto', 'estatico-promo'];
  const STAGES = [['signal', 'Convertido'], ['success', 'Qualificado'], ['warning', 'Em conversa'], ['neutral', 'Novo'], ['danger', 'Perdido']];
  const FIRST = ['Marina', 'Rafael', 'Juliana', 'Diego', 'Camila', 'Bruno', 'Larissa', 'Thiago', 'Patrícia', 'Vinícius', 'Aline', 'Gustavo', 'Renata', 'Fernando', 'Beatriz', 'Leandro'];
  const LAST = ['Alves', 'Pinto', 'Costa', 'Martins', 'Souza', 'Ramos', 'Cardoso', 'Nogueira', 'Teixeira', 'Barbosa', 'Moraes', 'Lima', 'Freitas', 'Rocha'];

  // deterministic pseudo-random so the mock is stable across renders
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pick = a => a[Math.floor(rnd() * a.length)];
  function makeLeads(client, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const tracked = rnd() > 0.16;
      const stage = pick(STAGES);
      const hour = 8 + Math.floor(rnd() * 12);
      const min = Math.floor(rnd() * 60);
      out.push({
        id: client.id + '-l' + i,
        clientId: client.id,
        name: pick(FIRST) + ' ' + pick(LAST),
        phone: '+55 ' + (11 + Math.floor(rnd() * 80)) + ' 9•••• ' + (1000 + Math.floor(rnd() * 8999)),
        tracked,
        campaign: tracked ? pick(CAMPAIGNS) : null,
        adset: tracked ? pick(ADSETS) : null,
        ad: tracked ? pick(ADS) : null,
        pixel: pick(client.pixels),
        status: stage,
        time: String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0'),
        date: 'Hoje',
        utm: tracked ? {
          source: 'fb',
          medium: 'paid',
          campaign: pick(CAMPAIGNS),
          content: pick(ADS)
        } : null,
        ctwaClid: tracked ? 'CTWA.' + Math.random().toString(36).slice(2, 10) + '.' + Math.floor(rnd() * 9e7 + 1e7) : null,
        value: stage[1] === 'Convertido' ? 200 + Math.floor(rnd() * 1800) : 0
      });
    }
    return out;
  }
  CLIENTS.forEach(c => {
    c.leads = makeLeads(c, 12);
  });

  // agency-wide totals
  const TOTALS = CLIENTS.reduce((a, c) => ({
    conversas: a.conversas + c.conversas,
    rastreadas: a.rastreadas + c.rastreadas,
    naoRastreadas: a.naoRastreadas + c.naoRastreadas,
    conversoes: a.conversoes + c.conversoes,
    investimento: a.investimento + c.investimento,
    receita: a.receita + c.receita
  }), {
    conversas: 0,
    rastreadas: 0,
    naoRastreadas: 0,
    conversoes: 0,
    investimento: 0,
    receita: 0
  });
  TOTALS.taxaRastreio = Math.round(TOTALS.rastreadas / TOTALS.conversas * 100);
  TOTALS.roas = +(TOTALS.receita / TOTALS.investimento).toFixed(2);
  TOTALS.cpl = +(TOTALS.investimento / TOTALS.conversas).toFixed(2);
  TOTALS.clientes = CLIENTS.length;
  TOTALS.pixels = CLIENTS.reduce((a, c) => a + c.pixels.length, 0);

  // 14-day trend series (conversas, rastreadas, conversões) for BI
  const TREND = Array.from({
    length: 14
  }, (_, i) => {
    const base = 1180 + Math.round(Math.sin(i / 2) * 180 + i * 22);
    const tracked = Math.round(base * (0.78 + Math.sin(i / 3) * 0.06));
    return {
      day: i + 1,
      label: String(i + 12).padStart(2, '0') + '/06',
      conversas: base,
      rastreadas: tracked,
      conversoes: Math.round(tracked * 0.3),
      investimento: 3200 + Math.round(Math.cos(i / 2) * 600 + i * 40)
    };
  });

  // a sample WhatsApp-style conversation for the lead-detail chat panel
  const SAMPLE_CHAT = [{
    from: 'lead',
    text: 'Oi, vi o anúncio de vocês no Instagram. Ainda tá com a condição da Black Friday?',
    time: '14:12'
  }, {
    from: 'agent',
    text: 'Oi, Marina! Tudo bem? Sim, a condição é válida até sexta. Posso te explicar como funciona?',
    time: '14:13'
  }, {
    from: 'lead',
    text: 'Pode sim! Queria saber o valor e se parcela.',
    time: '14:15'
  }, {
    from: 'agent',
    text: 'Claro. O plano sai por R$ 1.240 e parcelamos em até 6x sem juros. Quer que eu já reserve sua vaga?',
    time: '14:16'
  }, {
    from: 'lead',
    text: 'Quero! Pode reservar pra mim 🙌',
    time: '14:21'
  }, {
    from: 'agent',
    text: 'Perfeito, reservado ✅ Vou te mandar o link de pagamento aqui.',
    time: '14:22'
  }];

  // ---- Meta events available for the message pixel (etiqueta → evento) ----
  const META_EVENTS = ['Purchase', 'LeadSubmitted', 'InitiateCheckout', 'AddToCart', 'ViewContent', 'OrderCreated', 'OrderShipped', 'OrderDelivered', 'OrderCanceled', 'OrderReturned', 'CartAbandoned', 'QualifiedLead', 'RatingProvided', 'ReviewProvided'];

  // ---- Business Managers → ad accounts → pixels (Marketing API) ----
  const BMS = [{
    id: 'bm1',
    name: 'Norte Performance',
    metaId: '178•••4420',
    status: 'ok',
    app: 'WppTrack Marketing API',
    accounts: [{
      id: 'act_88210447',
      name: 'Vértice — Conta principal',
      client: 'c1',
      spend30d: 8420,
      pixels: ['418•••2207', '992•••1043']
    }, {
      id: 'act_55190882',
      name: 'AutoPrime — Seminovos',
      client: 'c2',
      spend30d: 12300,
      pixels: ['551•••8890']
    }, {
      id: 'act_20344710',
      name: 'EduMais — Lançamento',
      client: 'c3',
      spend30d: 9400,
      pixels: ['203•••4471']
    }, {
      id: 'act_20344799',
      name: 'EduMais — Perpétuo',
      client: 'c3',
      spend30d: 6200,
      pixels: ['203•••4480']
    }]
  }, {
    id: 'bm2',
    name: 'Norte Clientes 02',
    metaId: '203•••9981',
    status: 'ok',
    app: 'WppTrack Marketing API',
    accounts: [{
      id: 'act_77066120',
      name: 'Studio Bloom — Rede',
      client: 'c4',
      spend30d: 4200,
      pixels: ['770•••6612']
    }, {
      id: 'act_63422180',
      name: 'Imobiliária Norte',
      client: 'c5',
      spend30d: 9800,
      pixels: ['634•••2218', '634•••2230']
    }, {
      id: 'act_84599040',
      name: 'FitPro — Catálogo',
      client: 'c6',
      spend30d: 6100,
      pixels: ['845•••9904']
    }]
  }];

  // ---- WhatsApp providers (modalidades) ----
  const WA_PROVIDERS = [{
    id: 'evolution',
    name: 'Evolution API',
    desc: 'Provedor oferecido pela WppTrack — conexão via QR Code.',
    icon: 'message-circle',
    status: 'connected',
    badge: 'Recomendado',
    instances: 5,
    fields: 'evolution'
  }, {
    id: 'node',
    name: 'NOD API',
    desc: 'API gerenciada da WppTrack, cobrada por instância/mês. O token informa quantas instâncias você pode usar.',
    icon: 'boxes',
    status: 'connected',
    badge: 'Por instância',
    instances: 1,
    instanceCap: 3,
    fields: 'node'
  }, {
    id: 'cloud',
    name: 'WhatsApp Cloud API',
    desc: 'API oficial da Meta — número verificado e webhooks.',
    icon: 'cloud',
    status: 'available',
    badge: 'Oficial',
    instances: 0,
    fields: 'cloud'
  }];

  // ---- AI providers (analisar conversa) ----
  const AI_PROVIDERS = [{
    id: 'anthropic',
    name: 'Anthropic · Claude',
    model: 'claude-sonnet',
    status: 'connected',
    icon: 'sparkles'
  }, {
    id: 'openai',
    name: 'OpenAI · GPT',
    model: 'gpt-4o',
    status: 'available',
    icon: 'bot'
  }, {
    id: 'gemini',
    name: 'Google · Gemini',
    model: 'gemini-1.5',
    status: 'available',
    icon: 'gem'
  }, {
    id: 'custom',
    name: 'Provedor customizado',
    model: 'endpoint próprio',
    status: 'available',
    icon: 'plug'
  }];

  // ---- Per-client configuration (ad account, WhatsApp, etiquetas, IA) ----
  const ETIQUETA_COLORS = ['#16A34A', '#E29410', '#2F73E8', '#6B57C2', '#E5484D', '#0E8C7A'];
  CLIENTS.forEach((c, ci) => {
    const acct = BMS.flatMap(b => b.accounts).find(a => a.client === c.id);
    c.config = {
      bm: BMS.find(b => b.accounts.some(a => a.client === c.id)),
      adAccount: acct ? acct.id : 'act_—',
      wa: {
        provider: ci % 3 === 1 ? 'cloud' : 'evolution',
        status: ci === 3 ? 'pending' : 'connected',
        number: '+55 ' + (11 + ci) + ' 9' + (8000 + ci * 137) + '-' + (1000 + ci * 7),
        instance: 'inst_' + c.id
      },
      etiquetas: [{
        label: 'Pago',
        color: ETIQUETA_COLORS[0],
        event: 'Purchase',
        value: 1240,
        count: Math.round(c.conversoes * 0.62)
      }, {
        label: 'Agendou',
        color: ETIQUETA_COLORS[1],
        event: 'LeadSubmitted',
        value: 0,
        count: Math.round(c.conversoes * 0.9)
      }, {
        label: 'Lead qualificado',
        color: ETIQUETA_COLORS[2],
        event: 'QualifiedLead',
        value: 0,
        count: Math.round(c.rastreadas * 0.4)
      }, {
        label: 'Em negociação',
        color: ETIQUETA_COLORS[3],
        event: ci === 0 ? 'InitiateCheckout' : null,
        value: 0,
        count: Math.round(c.conversoes * 0.5)
      }, {
        label: 'Sem interesse',
        color: ETIQUETA_COLORS[4],
        event: null,
        value: 0,
        count: Math.round(c.naoRastreadas * 0.3)
      }, {
        label: 'Novo',
        color: ETIQUETA_COLORS[5],
        event: null,
        value: 0,
        count: Math.round(c.conversas * 0.2)
      }],
      ai: {
        enabled: ci % 2 === 0,
        provider: 'anthropic',
        autoCampaign: ci % 2 === 0
      }
    };
    // vendas (Purchase) + faturamento estimado a partir do valor fixo da etiqueta "Pago"
    const pago = c.config.etiquetas[0];
    c.vendas = pago.count;
    c.faturamento = pago.count * pago.value;
    c.roasCampanha = +(c.faturamento / c.investimento).toFixed(2);
    c.custoLeadReal = +(c.investimento / c.rastreadas).toFixed(2);
  });

  // ---- Sample AI analysis for a lead (intent / quality / stage / summary) ----
  const SAMPLE_AI = {
    intent: 'Alta intenção de compra',
    quality: 'Quente',
    stage: 'Negociação',
    score: 86,
    summary: 'Lead chegou pelo anúncio de Black Friday, perguntou preço e parcelamento e pediu para reservar a vaga. Demonstrou decisão de compra; recomendável enviar o link de pagamento e fazer follow-up em 24h caso não conclua.',
    tags: ['preço', 'parcelamento', 'reserva', 'black-friday']
  };
  window.WT = {
    CLIENTS,
    TOTALS,
    TREND,
    SAMPLE_CHAT,
    SAMPLE_AI,
    BMS,
    WA_PROVIDERS,
    AI_PROVIDERS,
    META_EVENTS,
    fmt: {
      BRL,
      NUM
    }
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/data.js", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/modals.jsx
try { (() => {
/* WppTrack — modals: Conectar Pixel, Conectar WhatsApp (QR/link/código), Novo cliente (wizard). */
const {
  useState: mUS
} = React;

/* ============ Conectar Pixel ============ */
function ConectarPixelModal({
  onClose
}) {
  const {
    Modal,
    Field,
    TextField,
    TextArea,
    SelectField
  } = window;
  const {
    Button
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const [done, setDone] = mUS(false);
  const footer = done ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onClose
  }, "Concluir") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: onClose
  }, "Cancelar"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconLeft: "link",
    onClick: () => setDone(true)
  }, "Conectar pixel"));
  return /*#__PURE__*/React.createElement(Modal, {
    title: "Conectar Pixel da Meta",
    subtitle: "Vincule um pixel de mensagem a uma conta de an\xFAncio",
    icon: "activity",
    width: 540,
    onClose: onClose,
    footer: footer
  }, done ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '20px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      margin: '0 auto 14px',
      borderRadius: '50%',
      background: 'var(--success-subtle)',
      color: 'var(--success)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "check",
    size: 26
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Pixel conectado"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: 4
    }
  }, "O pixel j\xE1 pode enviar eventos usando o token permanente da BM.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "Nome de identifica\xE7\xE3o",
    required: true
  }, /*#__PURE__*/React.createElement(TextField, {
    placeholder: "Ex.: V\xE9rtice \u2014 Principal"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Pixel ID",
    required: true,
    hint: "Encontrado no Gerenciador de Eventos"
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "418\u2022\u2022\u20222207"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Cliente"
  }, /*#__PURE__*/React.createElement(SelectField, {
    defaultValue: ""
  }, /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, "Selecione\u2026"), WT.CLIENTS.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.name))))), /*#__PURE__*/React.createElement(Field, {
    label: "Conta de an\xFAncio",
    required: true,
    hint: "O pixel de mensagem pertence a uma conta de an\xFAncio."
  }, /*#__PURE__*/React.createElement(SelectField, {
    defaultValue: ""
  }, /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, "Selecione a conta\u2026"), WT.BMS.flatMap(b => b.accounts).map(a => /*#__PURE__*/React.createElement("option", {
    key: a.id,
    value: a.id
  }, a.name, " (", a.id, ")")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 'var(--radius-md)',
      background: 'var(--info-subtle)'
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "info",
    size: 18,
    color: "var(--info)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-secondary)'
    }
  }, "O ", /*#__PURE__*/React.createElement("b", null, "token permanente"), " \xE9 configurado na Business Manager (Conectar BM), n\xE3o no pixel."))));
}

/* ============ Conectar Business Manager ============ */
function ConectarBMModal({
  onClose
}) {
  const {
    Modal,
    Field,
    TextField,
    TextArea,
    Icon
  } = window;
  const {
    Button,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const [step, setStep] = mUS('form'); // form → syncing → done

  const sync = () => {
    setStep('syncing');
    setTimeout(() => setStep('done'), 1100);
  };
  const footer = step === 'done' ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onClose
  }, "Concluir") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: onClose
  }, "Cancelar"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconLeft: "refresh-cw",
    onClick: sync,
    disabled: step === 'syncing'
  }, step === 'syncing' ? 'Sincronizando…' : 'Conectar e puxar contas'));
  return /*#__PURE__*/React.createElement(Modal, {
    title: "Conectar Business Manager",
    subtitle: "Puxamos as contas de an\xFAncio e pixels automaticamente",
    icon: "building-2",
    width: 540,
    onClose: onClose,
    footer: footer
  }, step === 'done' ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '14px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      margin: '0 auto 12px',
      borderRadius: '50%',
      background: 'var(--success-subtle)',
      color: 'var(--success)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 26
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "BM conectada"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: 4,
      maxWidth: 360,
      marginInline: 'auto'
    }
  }, "Encontramos ", /*#__PURE__*/React.createElement("b", null, "4 contas de an\xFAncio"), " e ", /*#__PURE__*/React.createElement("b", null, "6 pixels"), ". O token permanente cobre todos os eventos dessas contas.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "ID da Business Manager",
    required: true,
    hint: "Business Settings \u2192 Informa\xE7\xF5es da empresa."
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "178\u2022\u2022\u2022\u20224420"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Token de acesso permanente",
    required: true,
    hint: "System User token com permiss\xE3o ads_management + business_management. Salvo criptografado, associado \xE0 BM."
  }, /*#__PURE__*/React.createElement(TextArea, {
    mono: true,
    rows: 3,
    placeholder: "EAAG\u2026 cole o token permanente da BM"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 'var(--radius-md)',
      background: 'var(--info-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield-check",
    size: 18,
    color: "var(--info)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-secondary)'
    }
  }, "Um endpoint puxa automaticamente as contas de an\xFAncio e os pixels desta BM. O token fica na BM e vale para todos os pixels dela."))));
}

/* ============ Conectar WhatsApp ============ */
function ConectarWhatsAppModal({
  client,
  onClose
}) {
  const {
    Modal,
    Field,
    TextField,
    SelectField,
    TabBar,
    QRCode,
    Icon
  } = window;
  const {
    Button,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const [provider, setProvider] = mUS('evolution');
  const [method, setMethod] = mUS('qr');
  const link = `https://app.wpptrack.com/wa/connect/${client && client.id || 'cli'}-7f3a9`;
  const code = 'WT-' + (client && client.id || 'CLI').toUpperCase() + '-4F9A2K';
  return /*#__PURE__*/React.createElement(Modal, {
    title: "Conectar WhatsApp",
    subtitle: client ? client.name : 'Vincular um número à operação',
    icon: "message-circle",
    width: 600,
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: onClose
    }, "Fechar"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      iconLeft: "refresh-cw"
    }, "Atualizar status"))
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Provedor de WhatsApp"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10
    }
  }, WT.WA_PROVIDERS.map(p => {
    const on = provider === p.id;
    return /*#__PURE__*/React.createElement("button", {
      key: p.id,
      onClick: () => setProvider(p.id),
      style: {
        textAlign: 'left',
        cursor: 'pointer',
        padding: 12,
        borderRadius: 'var(--radius-md)',
        border: `1.5px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
        background: on ? 'var(--brand-subtle)' : 'var(--bg-surface)',
        display: 'flex',
        gap: 10,
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 32,
        height: 32,
        borderRadius: 'var(--radius-sm)',
        background: on ? 'var(--brand)' : 'var(--bg-subtle)',
        color: on ? '#fff' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 32px'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: p.icon,
      size: 17
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)'
      }
    }, p.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)'
      }
    }, p.badge)));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(TabBar, {
    value: method,
    onChange: setMethod,
    tabs: [{
      value: 'qr',
      label: 'QR Code',
      icon: 'qr-code'
    }, {
      value: 'link',
      label: 'Enviar link',
      icon: 'link'
    }, {
      value: 'code',
      label: 'Código',
      icon: 'key-round'
    }]
  })), method === 'qr' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      background: '#fff',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement(QRCode, {
    size: 172,
    seed: code
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-base)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      marginBottom: 8
    }
  }, "Escaneie no WhatsApp"), /*#__PURE__*/React.createElement("ol", {
    style: {
      margin: 0,
      paddingLeft: 18,
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      lineHeight: 1.7
    }
  }, /*#__PURE__*/React.createElement("li", null, "Abra o WhatsApp no celular do cliente"), /*#__PURE__*/React.createElement("li", null, "Toque em ", /*#__PURE__*/React.createElement("b", null, "Aparelhos conectados")), /*#__PURE__*/React.createElement("li", null, "Aponte para este QR Code")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    dot: true
  }, "Aguardando leitura\u2026")))) : null, method === 'link' ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Field, {
    label: "Link de conex\xE3o",
    hint: "Envie para o cliente abrir e escanear pelo pr\xF3prio celular."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    readOnly: true,
    value: link,
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconLeft: "copy"
  }, "Copiar"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "message-circle"
  }, "Enviar por WhatsApp"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "mail"
  }, "Enviar por e-mail"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconLeft: "external-link"
  }, "Abrir p\xE1gina")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      padding: 12,
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-inset)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, "A p\xE1gina p\xFAblica mostra o QR Code com a marca da ag\xEAncia \u2014 o cliente n\xE3o precisa de acesso ao painel.")) : null, method === 'code' ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Field, {
    label: "C\xF3digo de integra\xE7\xE3o",
    hint: "O cliente insere este c\xF3digo no provedor para vincular a conex\xE3o."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    readOnly: true,
    value: code,
    style: {
      flex: 1,
      fontSize: 'var(--text-lg)',
      letterSpacing: 2,
      textAlign: 'center'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconLeft: "copy"
  }, "Copiar"))), /*#__PURE__*/React.createElement(Field, {
    label: "N\xFAmero do WhatsApp"
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "+55 11 9\u2022\u2022\u2022\u2022-\u2022\u2022\u2022\u2022"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 'var(--radius-md)',
      background: 'var(--info-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 17,
    color: "var(--info)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-secondary)'
    }
  }, "O c\xF3digo expira em 30 minutos. Gere um novo se necess\xE1rio."))) : null);
}

/* ============ Novo Cliente (wizard) ============ */
function NovoClienteModal({
  onClose
}) {
  const {
    Modal,
    Field,
    TextField,
    SelectField,
    QRCode,
    Icon,
    Switch
  } = window;
  const {
    Button,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const [step, setStep] = mUS(0);
  const steps = ['Dados', 'Conta & Pixel', 'WhatsApp', 'Etiquetas'];
  const next = () => setStep(s => Math.min(s + 1, steps.length));
  const back = () => setStep(s => Math.max(s - 1, 0));
  const done = step >= steps.length;
  const footer = done ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onClose
  }, "Ir para o cliente") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: step === 0 ? onClose : back
  }, step === 0 ? 'Cancelar' : 'Voltar'), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconRight: step === steps.length - 1 ? 'check' : 'arrow-right',
    onClick: next
  }, step === steps.length - 1 ? 'Criar cliente' : 'Continuar'));
  return /*#__PURE__*/React.createElement(Modal, {
    title: "Novo cliente",
    subtitle: done ? 'Cliente criado' : `Etapa ${step + 1} de ${steps.length} · ${steps[step]}`,
    icon: "user-plus",
    width: 600,
    onClose: onClose,
    footer: footer
  }, !done ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginBottom: 20
    }
  }, steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s,
    style: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      background: i <= step ? 'var(--brand)' : 'var(--bg-inset)'
    }
  }))) : null, done ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '16px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      margin: '0 auto 14px',
      borderRadius: '50%',
      background: 'var(--success-subtle)',
      color: 'var(--success)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 26
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Cliente criado com sucesso"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: 4,
      maxWidth: 360,
      marginInline: 'auto'
    }
  }, "Conta de an\xFAncio, pixel e WhatsApp vinculados. Configure as etiquetas a qualquer momento em Configura\xE7\xF5es do cliente.")) : step === 0 ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "Nome do cliente",
    required: true
  }, /*#__PURE__*/React.createElement(TextField, {
    placeholder: "Ex.: Cl\xEDnica V\xE9rtice"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Segmento"
  }, /*#__PURE__*/React.createElement(TextField, {
    placeholder: "Sa\xFAde \xB7 Est\xE9tica"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Business Manager",
    hint: "Onde a conta de an\xFAncio ser\xE1 gerenciada"
  }, /*#__PURE__*/React.createElement(SelectField, null, WT.BMS.map(b => /*#__PURE__*/React.createElement("option", {
    key: b.id
  }, b.name)))))) : step === 1 ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "ID da conta de an\xFAncio",
    required: true,
    hint: "Formato act_XXXXXXXXX"
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "act_88210447"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      margin: '6px 0 8px'
    }
  }, "Pixel de mensagem"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Pixel ID",
    required: true
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "418\u2022\u2022\u20222207"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Token permanente",
    required: true
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "EAAG\u2026"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-inset)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 16,
    color: "var(--text-muted)"
  }), "Voc\xEA tamb\xE9m pode cadastrar/trocar o pixel depois, em ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-secondary)'
    }
  }, "Conectar pixel"), " ou nas configura\xE7\xF5es do cliente.")) : step === 2 ? /*#__PURE__*/React.createElement(WAConnectStep, null) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginBottom: 14
    }
  }, "Mapeie cada etiqueta do WhatsApp a um evento da Meta. Voc\xEA pode ajustar isso depois nas configura\xE7\xF5es do cliente."), [{
    l: 'Pago',
    e: 'Purchase'
  }, {
    l: 'Agendou',
    e: 'LeadSubmitted'
  }, {
    l: 'Lead qualificado',
    e: 'QualifiedLead'
  }].map((row, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 3,
      background: ['#16A34A', '#E29410', '#2F73E8'][i]
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, row.l)), /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 15,
    color: "var(--text-muted)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(SelectField, {
    defaultValue: row.e
  }, WT.META_EVENTS.map(ev => /*#__PURE__*/React.createElement("option", {
    key: ev
  }, ev)))))), /*#__PURE__*/React.createElement("button", {
    style: {
      marginTop: 4,
      border: '1px dashed var(--border-strong)',
      background: 'none',
      borderRadius: 'var(--radius-md)',
      padding: '9px',
      width: '100%',
      cursor: 'pointer',
      color: 'var(--text-secondary)',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 15
  }), " Puxar etiquetas do WhatsApp")));
}
Object.assign(window, {
  ConectarPixelModal,
  ConectarWhatsAppModal,
  NovoClienteModal,
  ProvedorConfigModal,
  ConectarBMModal
});

/* ============ Etapa de conexão do WhatsApp (no wizard) ============ */
function WAConnectStep() {
  const {
    Field,
    TextField,
    QRCode,
    Icon,
    TabBar
  } = window;
  const {
    Button,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const [provider, setProvider] = mUS(null);
  const [method, setMethod] = mUS('qr');
  if (!provider) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        marginBottom: 14
      }
    }, "Escolha por qual provedor este cliente vai conectar o WhatsApp."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, WT.WA_PROVIDERS.map(p => {
      const full = p.fields === 'node' && p.instances >= p.instanceCap;
      return /*#__PURE__*/React.createElement("button", {
        key: p.id,
        disabled: full,
        onClick: () => setProvider(p.id),
        style: {
          textAlign: 'left',
          cursor: full ? 'not-allowed' : 'pointer',
          opacity: full ? 0.55 : 1,
          padding: 14,
          borderRadius: 'var(--radius-md)',
          border: '1.5px solid var(--border)',
          background: 'var(--bg-surface)',
          display: 'flex',
          gap: 12,
          alignItems: 'center'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 38,
          height: 38,
          flex: '0 0 38px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-subtle)',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: p.icon,
        size: 19
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--text-primary)'
        }
      }, p.name), /*#__PURE__*/React.createElement(Badge, {
        tone: p.id === 'evolution' ? 'brand' : p.id === 'node' ? 'signal' : 'info'
      }, p.badge), p.fields === 'node' ? /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-muted)'
        }
      }, p.instances, "/", p.instanceCap, " inst\xE2ncias") : null), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          marginTop: 2
        }
      }, p.desc)), /*#__PURE__*/React.createElement(Icon, {
        name: "chevron-right",
        size: 17,
        color: "var(--text-muted)"
      }));
    })));
  }
  const prov = WT.WA_PROVIDERS.find(p => p.id === provider);
  const code = 'WT-NOVO-4F9A2K';
  const link = 'https://app.wpptrack.com/wa/connect/novo-7f3a9';
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setProvider(null),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: 0,
      marginBottom: 12,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 13
  }), " ", prov.name), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(TabBar, {
    value: method,
    onChange: setMethod,
    tabs: [{
      value: 'qr',
      label: 'QR Code',
      icon: 'qr-code'
    }, {
      value: 'link',
      label: 'Enviar link',
      icon: 'link'
    }, {
      value: 'code',
      label: 'Código',
      icon: 'key-round'
    }]
  })), method === 'qr' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 18,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 10,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      background: '#fff',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement(QRCode, {
    size: 150,
    seed: "novocliente"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-base)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Escaneie no WhatsApp"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: 4,
      marginBottom: 10
    }
  }, "Aparelhos conectados \u2192 Conectar aparelho."), /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    dot: true
  }, "Aguardando conex\xE3o"))) : method === 'link' ? /*#__PURE__*/React.createElement(Field, {
    label: "Link de conex\xE3o",
    hint: "Envie para o cliente abrir e escanear."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    readOnly: true,
    value: link,
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconLeft: "copy"
  }, "Copiar"))) : /*#__PURE__*/React.createElement(Field, {
    label: "C\xF3digo de integra\xE7\xE3o",
    hint: "O cliente insere este c\xF3digo no provedor."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    readOnly: true,
    value: code,
    style: {
      flex: 1,
      textAlign: 'center',
      letterSpacing: 2
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconLeft: "copy"
  }, "Copiar"))));
}

/* ============ Configurar provedor de WhatsApp ============ */
function ProvedorConfigModal({
  providerId,
  onClose
}) {
  const {
    Modal,
    Field,
    TextField,
    TextArea,
    Icon
  } = window;
  const {
    Button,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const p = WT.WA_PROVIDERS.find(x => x.id === providerId) || WT.WA_PROVIDERS[0];
  const [done, setDone] = mUS(false);
  const footer = done ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onClose
  }, "Concluir") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: onClose
  }, "Cancelar"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconLeft: "check",
    onClick: () => setDone(true)
  }, "Salvar provedor"));
  return /*#__PURE__*/React.createElement(Modal, {
    title: `Configurar ${p.name}`,
    subtitle: p.badge,
    icon: p.icon,
    width: 540,
    onClose: onClose,
    footer: footer
  }, done ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '18px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 50,
      height: 50,
      margin: '0 auto 12px',
      borderRadius: '50%',
      background: 'var(--success-subtle)',
      color: 'var(--success)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 25
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Provedor configurado"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: 4
    }
  }, "Os clientes j\xE1 podem conectar o WhatsApp por ", p.name, ".")) : p.fields === 'evolution' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "URL da inst\xE2ncia",
    required: true,
    hint: "Endpoint do seu servidor Evolution."
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "https://evolution.suaagencia.com"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Token master",
    required: true,
    hint: "Chave de administra\xE7\xE3o (AUTHENTICATION_API_KEY)."
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
  })), /*#__PURE__*/React.createElement(Info, {
    text: "A URL e o token master ficam salvos na ag\xEAncia. Cada cliente gera sua pr\xF3pria inst\xE2ncia na conex\xE3o."
  })) : p.fields === 'node' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "Token da NOD API",
    required: true,
    hint: "Informe o token da sua assinatura. Validamos as inst\xE2ncias dispon\xEDveis automaticamente."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "nod_live_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    defaultValue: "nod_live_9f3a2207k",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconLeft: "refresh-cw"
  }, "Sincronizar"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-inset)',
      border: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      flex: '0 0 40px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-subtle)',
      color: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "boxes",
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Inst\xE2ncias do plano"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, "Retornado pelo webhook da assinatura")), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-xl)',
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, p.instances, "/", p.instanceCap), /*#__PURE__*/React.createElement(Badge, {
    tone: p.instances < p.instanceCap ? 'success' : 'warning'
  }, p.instances < p.instanceCap ? `${p.instanceCap - p.instances} livre(s)` : 'Esgotado'))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: 999,
      background: 'var(--bg-inset)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${p.instances / p.instanceCap * 100}%`,
      height: '100%',
      background: 'var(--brand)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)',
      marginTop: 6
    }
  }, "Cobran\xE7a por inst\xE2ncia/m\xEAs. Compre mais inst\xE2ncias e clique em ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-secondary)'
    }
  }, "Sincronizar"), " para liberar novas conex\xF5es."))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "ID do n\xFAmero de telefone",
    required: true
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    placeholder: "1098\u2022\u2022\u2022\u20222207"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Token de acesso permanente",
    required: true,
    hint: "Token do app da Meta com permiss\xE3o whatsapp_business_messaging."
  }, /*#__PURE__*/React.createElement(TextArea, {
    mono: true,
    rows: 3,
    placeholder: "EAAG\u2026 cole o token permanente"
  })), /*#__PURE__*/React.createElement(Info, {
    text: "O token permanente \xE9 salvo criptografado. Use um System User token para n\xE3o expirar."
  })));
}
function Info({
  text
}) {
  const {
    Icon
  } = window;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 'var(--radius-md)',
      background: 'var(--info-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield-check",
    size: 18,
    color: "var(--info)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-secondary)'
    }
  }, text));
}
Object.assign(window, {
  ProvedorConfigModal,
  Info
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/modals.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/screens/ClienteConfig.jsx
try { (() => {
/* WppTrack — ClienteConfig: per-client settings. Tabs: Conta & Pixels · WhatsApp · Etiquetas → eventos · IA. */
function ClienteConfig({
  clientId,
  theme,
  onNav,
  onToggleTheme,
  onBack,
  openModal
}) {
  const {
    useState
  } = React;
  const {
    Icon,
    AppShell,
    TabBar,
    Switch,
    ClientAvatar,
    Field,
    TextField,
    SelectField
  } = window;
  const {
    Button,
    Card,
    Badge,
    Tag
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const c = WT.CLIENTS.find(x => x.id === clientId) || WT.CLIENTS[0];
  const cfg = c.config;
  const [tab, setTab] = useState('conta');
  const [etq, setEtq] = useState(cfg.etiquetas);
  const [ai, setAi] = useState(cfg.ai);
  const provider = WT.WA_PROVIDERS.find(p => p.id === cfg.wa.provider);
  const breadcrumb = /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-muted)',
      letterSpacing: '.04em'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 13
  }), " ", c.name);
  const setEvent = (i, ev) => setEtq(arr => arr.map((e, idx) => idx === i ? {
    ...e,
    event: ev || null
  } : e));
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "clienteDetalhe",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    breadcrumb: breadcrumb,
    title: /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(ClientAvatar, {
      client: c,
      size: 28
    }), "Configura\xE7\xF5es \xB7 ", c.name)
  }, /*#__PURE__*/React.createElement(TabBar, {
    value: tab,
    onChange: setTab,
    tabs: [{
      value: 'conta',
      label: 'Conta & Pixels',
      icon: 'briefcase'
    }, {
      value: 'whatsapp',
      label: 'WhatsApp',
      icon: 'message-circle'
    }, {
      value: 'etiquetas',
      label: 'Etiquetas → eventos',
      icon: 'tags'
    }, {
      value: 'ia',
      label: 'IA',
      icon: 'sparkles'
    }]
  }), tab === 'conta' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      maxWidth: 560
    }
  }, "Cada pixel de mensagem pertence a uma conta de an\xFAncio. Um cliente pode ter mais de uma conta \u2014 cada uma com seu(s) pixel(s)."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "refresh-cw"
  }, "Sincronizar campanhas"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "plus",
    onClick: () => openModal({
      type: 'pixel'
    })
  }, "Conectar pixel"))), (() => {
    const accounts = WT.BMS.flatMap(b => b.accounts.map(a => ({
      ...a,
      bm: b
    }))).filter(a => a.client === c.id);
    const pixById = Object.fromEntries(c.pixels.map(p => [p.id, p]));
    return accounts.map(a => /*#__PURE__*/React.createElement(Card, {
      key: a.id,
      padding: "none"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        borderBottom: '1px solid var(--divider)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 38,
        height: 38,
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-subtle)',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 38px'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "briefcase",
      size: 18
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)'
      }
    }, a.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)'
      }
    }, a.id, " \xB7 ", a.bm.name)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-muted)'
      }
    }, a.pixels.length, " pixel(s)")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }
    }, a.pixels.map(pid => {
      const p = pixById[pid] || {
        id: pid,
        name: 'Pixel',
        status: 'ok'
      };
      return /*#__PURE__*/React.createElement("div", {
        key: pid,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)'
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: 30,
          height: 30,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--brand-subtle)',
          color: 'var(--brand)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 30px'
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "activity",
        size: 15
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--text-primary)'
        }
      }, p.name), /*#__PURE__*/React.createElement("div", {
        style: {
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)'
        }
      }, "ID ", p.id, " \xB7 token na BM")), /*#__PURE__*/React.createElement(Badge, {
        tone: p.status === 'ok' ? 'success' : p.status === 'warn' ? 'warning' : 'danger',
        dot: true
      }, p.status === 'ok' ? 'Ativo' : p.status === 'warn' ? 'Sincronizando' : 'Erro'));
    }))));
  })()) : null, tab === 'whatsapp' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.3fr 1fr',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Conex\xE3o",
    title: "WhatsApp do cliente"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 0',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 'var(--radius-md)',
      background: cfg.wa.status === 'connected' ? 'var(--brand)' : 'var(--warning-subtle)',
      color: cfg.wa.status === 'connected' ? '#fff' : 'var(--warning)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 44px'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "message-circle",
    size: 22
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, cfg.wa.number), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, provider ? provider.name : 'Evolution API', " \xB7 ", cfg.wa.instance)), /*#__PURE__*/React.createElement(Badge, {
    tone: cfg.wa.status === 'connected' ? 'success' : 'warning',
    dot: true
  }, cfg.wa.status === 'connected' ? 'Conectado' : 'Pendente')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "qr-code",
    onClick: () => openModal({
      type: 'whatsapp',
      client: c
    })
  }, cfg.wa.status === 'connected' ? 'Reconectar' : 'Conectar WhatsApp'), cfg.wa.status === 'connected' ? /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconLeft: "power"
  }, "Desconectar") : null)), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Provedor",
    title: "Modalidade"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 2
    }
  }, WT.WA_PROVIDERS.map(p => {
    const on = cfg.wa.provider === p.id;
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 'var(--radius-md)',
        border: `1.5px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
        background: on ? 'var(--brand-subtle)' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: p.icon,
      size: 18,
      color: on ? 'var(--brand)' : 'var(--text-muted)'
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)'
      }
    }, p.name), on ? /*#__PURE__*/React.createElement(Icon, {
      name: "check-circle",
      size: 17,
      color: "var(--brand)"
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)'
      }
    }, "Trocar"));
  })))) : null, tab === 'etiquetas' ? /*#__PURE__*/React.createElement(Card, {
    padding: "none"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '15px 18px',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Etiquetas \u2192 eventos da Meta"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: 2
    }
  }, "Cada etiqueta do WhatsApp dispara um evento no pixel de mensagem quando aplicada.")), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "refresh-cw"
  }, "Puxar etiquetas do WhatsApp")), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Etiqueta', '', 'Evento da Meta', 'Valor (R$)', 'Status'].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h + i,
    style: {
      ...window.thStyle,
      textAlign: i === 3 ? 'right' : 'left',
      width: i === 1 ? 40 : 'auto'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, etq.map((e, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      borderBottom: i < etq.length - 1 ? '1px solid var(--divider)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 18px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 11,
      height: 11,
      borderRadius: 3,
      background: e.color,
      flex: '0 0 11px'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, e.label))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 0',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 15,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px',
      maxWidth: 230
    }
  }, /*#__PURE__*/React.createElement(SelectField, {
    value: e.event || '',
    onChange: ev => setEvent(i, ev.target.value),
    style: {
      maxWidth: 230
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\u2014 N\xE3o enviar evento \u2014"), WT.META_EVENTS.map(ev => /*#__PURE__*/React.createElement("option", {
    key: ev,
    value: ev
  }, ev)))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px',
      width: 130
    }
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    defaultValue: e.value ? e.value : '',
    placeholder: "0,00",
    disabled: !e.event,
    style: {
      height: 'var(--control-sm)',
      textAlign: 'right',
      opacity: e.event ? 1 : 0.5
    }
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 18px'
    }
  }, e.event ? /*#__PURE__*/React.createElement(Badge, {
    tone: "signal",
    dot: true
  }, "Configurado") : /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, "Pendente")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 18px',
      borderTop: '1px solid var(--divider)',
      background: 'var(--bg-inset)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, etq.filter(e => e.event).length, " de ", etq.length, " etiquetas mapeadas \xB7 o valor \xE9 enviado junto ao evento (Purchase) e usado no ROAS"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "save"
  }, "Salvar mapeamento"))) : null, tab === 'ia' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "An\xE1lise de conversas",
    title: "Intelig\xEAncia artificial"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 0',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Analisar conversas com IA"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, "Inten\xE7\xE3o, qualidade e est\xE1gio do lead.")), /*#__PURE__*/React.createElement(Switch, {
    on: ai.enabled,
    onChange: v => setAi({
      ...ai,
      enabled: v
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 0',
      opacity: ai.enabled ? 1 : 0.5,
      pointerEvents: ai.enabled ? 'auto' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Apenas leads de campanha"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, "Analisa automaticamente todo lead que veio rastreado de an\xFAncio.")), /*#__PURE__*/React.createElement(Switch, {
    on: ai.autoCampaign,
    onChange: v => setAi({
      ...ai,
      autoCampaign: v
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      opacity: ai.enabled ? 1 : 0.5
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Provedor de IA",
    hint: "Gerencie as API Keys em Configura\xE7\xF5es \u2192 Intelig\xEAncia artificial."
  }, /*#__PURE__*/React.createElement(SelectField, {
    value: ai.provider,
    onChange: e => setAi({
      ...ai,
      provider: e.target.value
    })
  }, WT.AI_PROVIDERS.map(p => /*#__PURE__*/React.createElement("option", {
    key: p.id,
    value: p.id
  }, p.name)))))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Pr\xE9via",
    title: "Exemplo de an\xE1lise"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "signal",
    dot: true
  }, WT.SAMPLE_AI.intent), /*#__PURE__*/React.createElement(Badge, {
    tone: "warning"
  }, WT.SAMPLE_AI.quality), /*#__PURE__*/React.createElement(Badge, {
    tone: "brand"
  }, "Est\xE1gio: ", WT.SAMPLE_AI.stage)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      lineHeight: 1.55
    }
  }, WT.SAMPLE_AI.summary), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginTop: 12
    }
  }, WT.SAMPLE_AI.tags.map(t => /*#__PURE__*/React.createElement(Tag, {
    key: t,
    prefix: ""
  }, t))))) : null);
}
Object.assign(window, {
  ClienteConfig
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/screens/ClienteConfig.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/screens/ClienteDetalhe.jsx
try { (() => {
/* WppTrack — ClienteDetalhe: per-client overview + leads list. Click a lead → LeadDetalhe. */
function ClienteDetalhe({
  clientId,
  theme,
  onNav,
  onToggleTheme,
  onOpenLead,
  onBack
}) {
  const {
    useState
  } = React;
  const {
    Icon,
    Donut,
    LineChart,
    ClientAvatar,
    AppShell,
    Segmented
  } = window;
  const {
    Button,
    StatCard,
    Card,
    Badge,
    Tag
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT,
    fmt = WT.fmt;
  const c = WT.CLIENTS.find(x => x.id === clientId) || WT.CLIENTS[0];
  const [tab, setTab] = useState('todos');
  const [pixelFilter, setPixelFilter] = useState('todos');
  const [dateFilter, setDateFilter] = useState('hoje');
  const {
    PeriodFilter
  } = window;
  let leads = c.leads;
  if (tab === 'rastreados') leads = leads.filter(l => l.tracked);
  if (tab === 'naoRastreados') leads = leads.filter(l => !l.tracked);
  if (pixelFilter !== 'todos') leads = leads.filter(l => l.pixel.id === pixelFilter);
  const breadcrumb = /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-muted)',
      letterSpacing: '.04em'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 13
  }), " Clientes");
  const actions = /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(PeriodFilter, {
    value: dateFilter,
    onChange: setDateFilter
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "settings",
    onClick: () => onNav('clienteConfig', c.id)
  }, "Configura\xE7\xF5es"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "file-bar-chart",
    onClick: () => onNav('relatorioCliente', c.id)
  }, "Gerar relat\xF3rio"));
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "clienteDetalhe",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    breadcrumb: breadcrumb,
    title: /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(ClientAvatar, {
      client: c,
      size: 28
    }), c.name),
    actions: actions
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, c.segment), c.pixels.map(p => /*#__PURE__*/React.createElement(Tag, {
    key: p.id,
    prefix: "pixel:"
  }, p.id)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)',
      marginLeft: 4
    }
  }, c.pixels.length, " pixel(s) conectado(s)")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Conversas iniciadas",
    value: fmt.NUM(c.conversas),
    delta: `+${c.deltaConversas}%`,
    deltaDir: c.deltaConversas < 0 ? 'down' : 'up',
    hint: "vs. 7d",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "message-circle",
      size: 16
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Rastreadas",
    value: fmt.NUM(c.rastreadas),
    delta: `${c.taxaRastreio}%`,
    deltaDir: "up",
    hint: "da origem",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "git-branch",
      size: 16
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "N\xE3o rastreadas",
    value: fmt.NUM(c.naoRastreadas),
    delta: `${100 - c.taxaRastreio}%`,
    deltaDir: "down",
    hint: "sem origem",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "help-circle",
      size: 16
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Convers\xF5es enviadas",
    value: fmt.NUM(c.conversoes),
    delta: "+9%",
    accent: true,
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "send",
      size: 16,
      color: "#fff"
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(FinKpi, {
    icon: "wallet",
    label: "Investido total",
    value: fmt.BRL(c.investimento)
  }), /*#__PURE__*/React.createElement(FinKpi, {
    icon: "message-circle",
    label: "Custo por conversa",
    value: fmt.BRL(c.cpl),
    hint: "Meta"
  }), /*#__PURE__*/React.createElement(FinKpi, {
    icon: "user",
    label: "Custo por lead",
    value: fmt.BRL(c.investimento / c.conversoes)
  }), /*#__PURE__*/React.createElement(FinKpi, {
    icon: "target",
    label: "Custo por lead real",
    value: fmt.BRL(c.custoLeadReal),
    hint: "\xF7 rastreados",
    accent: true
  }), /*#__PURE__*/React.createElement(FinKpi, {
    icon: "trending-up",
    label: "ROAS de campanha",
    value: c.roasCampanha + 'x',
    hint: `${fmt.NUM(c.vendas)} vendas`
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.6fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Fechamento",
    title: "Vendas no per\xEDodo"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-4xl)',
      fontWeight: 700,
      color: 'var(--text-primary)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, fmt.NUM(c.vendas)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, "vendas")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      paddingTop: 12,
      borderTop: '1px solid var(--divider)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(window.LegendRow, {
    color: "var(--signal)",
    label: "Faturamento estimado",
    value: fmt.BRL(c.faturamento)
  }), /*#__PURE__*/React.createElement(window.LegendRow, {
    color: "var(--gray-300)",
    label: "Ticket m\xE9dio (fixo)",
    value: fmt.BRL(c.config.etiquetas[0].value)
  }))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Eventos enviados",
    title: "Por etiqueta",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      iconLeft: "settings",
      onClick: () => onNav('clienteConfig', c.id)
    }, "Configurar")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 4
    }
  }, c.config.etiquetas.filter(e => e.event).map((e, i) => {
    const max = Math.max(...c.config.etiquetas.filter(x => x.event).map(x => x.count));
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 130,
        flex: '0 0 130px',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: 3,
        background: e.color,
        flex: '0 0 10px'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, e.label)), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 8,
        borderRadius: 999,
        background: 'var(--bg-inset)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: `${e.count / max * 100}%`,
        height: '100%',
        borderRadius: 999,
        background: e.color
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 56,
        textAlign: 'right',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)'
      }
    }, fmt.NUM(e.count)), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 92,
        textAlign: 'right',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-muted)'
      }
    }, e.event));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.7fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Conversas \xB7 14 dias",
    title: "Evolu\xE7\xE3o",
    action: /*#__PURE__*/React.createElement(window.Legend, {
      items: [{
        c: 'var(--teal-500)',
        t: 'Iniciadas'
      }, {
        c: 'var(--signal)',
        t: 'Rastreadas'
      }]
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(LineChart, {
    height: 190,
    series: [{
      points: WT.TREND.map(d => Math.round(d.conversas * (c.conversas / WT.TOTALS.conversas) * 6)),
      color: 'var(--teal-500)',
      fill: 'var(--brand-subtle)'
    }, {
      points: WT.TREND.map(d => Math.round(d.rastreadas * (c.conversas / WT.TOTALS.conversas) * 6)),
      color: 'var(--signal)'
    }]
  }))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Qualidade do rastreio",
    title: "Origem"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(Donut, {
    size: 112,
    thickness: 16,
    segments: [{
      value: c.rastreadas,
      color: 'var(--teal-500)'
    }, {
      value: c.naoRastreadas,
      color: 'var(--bg-inset)'
    }]
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, c.taxaRastreio, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 11,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(window.LegendRow, {
    color: "var(--teal-500)",
    label: "Rastreadas",
    value: fmt.NUM(c.rastreadas)
  }), /*#__PURE__*/React.createElement(window.LegendRow, {
    color: "var(--gray-300)",
    label: "N\xE3o rastreadas",
    value: fmt.NUM(c.naoRastreadas)
  }), /*#__PURE__*/React.createElement(window.LegendRow, {
    color: "var(--signal)",
    label: "Convers\xF5es",
    value: fmt.NUM(c.conversoes)
  }))))), /*#__PURE__*/React.createElement(Card, {
    padding: "none"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 18px',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-brand)'
    }
  }, "Origem rastreada"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Leads recebidos")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Segmented, {
    value: tab,
    onChange: setTab,
    options: [{
      value: 'todos',
      label: 'Todos'
    }, {
      value: 'rastreados',
      label: 'Rastreados'
    }, {
      value: 'naoRastreados',
      label: 'Não rastr.'
    }]
  }), /*#__PURE__*/React.createElement("select", {
    value: pixelFilter,
    onChange: e => setPixelFilter(e.target.value),
    style: window.selStyle
  }, /*#__PURE__*/React.createElement("option", {
    value: "todos"
  }, "Todos os pixels"), c.pixels.map(p => /*#__PURE__*/React.createElement("option", {
    key: p.id,
    value: p.id
  }, p.name))))), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Lead', 'Origem', 'Pixel', 'Status', 'Horário', ''].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h + i,
    style: {
      ...window.thStyle,
      textAlign: i === 0 ? 'left' : i === 5 ? 'right' : 'left'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, leads.map((l, i) => /*#__PURE__*/React.createElement("tr", {
    key: l.id,
    onClick: () => onOpenLead(l.id),
    style: {
      borderBottom: i < leads.length - 1 ? '1px solid var(--divider)' : 'none',
      cursor: 'pointer'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--bg-hover)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, l.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, l.phone)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px'
    }
  }, l.tracked ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement(Tag, {
    prefix: ""
  }, l.campaign), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--text-muted)'
    }
  }, l.adset, " \xB7 ", l.ad)) : /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    dot: true
  }, "N\xE3o rastreado")), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-secondary)'
    }
  }, l.pixel.id), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: l.status[0],
    dot: true
  }, l.status[1])), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, l.time), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  })))))))));
}
Object.assign(window, {
  ClienteDetalhe
});
function FinKpi({
  icon,
  label,
  value,
  hint,
  accent
}) {
  const {
    Icon
  } = window;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: accent ? 'var(--brand-subtle)' : 'var(--bg-surface)',
      border: `1px solid ${accent ? 'var(--brand-border)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: '14px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 14,
    color: accent ? 'var(--brand)' : 'var(--text-muted)'
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      lineHeight: 1.2
    }
  }, label)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-xl)',
      fontWeight: 700,
      color: accent ? 'var(--text-brand)' : 'var(--text-primary)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, value), hint ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-muted)',
      marginTop: 2,
      fontFamily: 'var(--font-mono)'
    }
  }, hint) : null);
}
Object.assign(window, {
  FinKpi
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/screens/ClienteDetalhe.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/screens/Clientes.jsx
try { (() => {
/* WppTrack — Clientes: list of all agency clients with totals + filter by pixel. */
function Clientes({
  theme,
  onNav,
  onToggleTheme,
  onOpenClient,
  onNovoCliente,
  openModal
}) {
  const {
    useState
  } = React;
  const {
    Icon,
    ClientAvatar,
    AppShell,
    Spark
  } = window;
  const {
    Button,
    Card,
    Badge,
    Input
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT,
    fmt = WT.fmt;
  const [pixelFilter, setPixelFilter] = useState('todos');
  const [q, setQ] = useState('');
  const allPixels = WT.CLIENTS.flatMap(c => c.pixels.map(p => ({
    ...p,
    client: c.name
  })));
  let clients = WT.CLIENTS;
  if (pixelFilter !== 'todos') clients = clients.filter(c => c.pixels.some(p => p.id === pixelFilter));
  if (q.trim()) clients = clients.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
  const actions = /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: pixelFilter,
    onChange: e => setPixelFilter(e.target.value),
    style: window.selStyle
  }, /*#__PURE__*/React.createElement("option", {
    value: "todos"
  }, "Todos os pixels"), allPixels.map(p => /*#__PURE__*/React.createElement("option", {
    key: p.id,
    value: p.id
  }, p.name, " (", p.id, ")"))), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "plus",
    onClick: onNovoCliente
  }, "Novo cliente"));
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "clientes",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    title: "Clientes",
    actions: actions
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(MiniStat, {
    icon: "users",
    label: "Clientes ativos",
    value: WT.TOTALS.clientes
  }), /*#__PURE__*/React.createElement(MiniStat, {
    icon: "message-circle",
    label: "Conversas (todas)",
    value: fmt.NUM(WT.TOTALS.conversas)
  }), /*#__PURE__*/React.createElement(MiniStat, {
    icon: "git-branch",
    label: "Taxa m\xE9dia de rastreio",
    value: WT.TOTALS.taxaRastreio + '%'
  }), /*#__PURE__*/React.createElement(MiniStat, {
    icon: "plug",
    label: "Pixels conectados",
    value: WT.TOTALS.pixels
  })), /*#__PURE__*/React.createElement(Card, {
    padding: "none"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '14px 18px',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Todos os clientes"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 240
    }
  }, /*#__PURE__*/React.createElement(Input, {
    size: "sm",
    placeholder: "Buscar cliente\u2026",
    value: q,
    onChange: e => setQ(e.target.value),
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      name: "search",
      size: 15
    })
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Cliente', 'Pixels', 'Conversas', 'Rastreio', 'Conversões', 'Investimento', 'ROAS', 'Tendência', ''].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h + i,
    style: {
      ...window.thStyle,
      textAlign: i === 0 ? 'left' : i === 7 || i === 8 ? 'center' : 'right'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, clients.map((c, i) => /*#__PURE__*/React.createElement("tr", {
    key: c.id,
    onClick: () => onOpenClient(c.id),
    style: {
      borderBottom: i < clients.length - 1 ? '1px solid var(--divider)' : 'none',
      cursor: 'pointer'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--bg-hover)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(ClientAvatar, {
    client: c,
    size: 34
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, c.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, c.segment)))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-secondary)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plug",
    size: 13,
    color: "var(--text-muted)"
  }), c.pixels.length)), /*#__PURE__*/React.createElement("td", {
    style: window.tdNum
  }, fmt.NUM(c.conversas)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: c.taxaRastreio >= 80 ? 'success' : c.taxaRastreio >= 70 ? 'warning' : 'danger'
  }, c.taxaRastreio, "%")), /*#__PURE__*/React.createElement("td", {
    style: window.tdNum
  }, fmt.NUM(c.conversoes)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...window.tdNum,
      color: 'var(--text-secondary)',
      fontWeight: 500
    }
  }, fmt.BRL(c.investimento)), /*#__PURE__*/React.createElement("td", {
    style: window.tdNum
  }, c.roas, "x"), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Spark, {
    points: WT.TREND.slice(-8).map(d => d.conversas + c.deltaConversas * d.day),
    color: c.deltaConversas < 0 ? 'var(--danger)' : 'var(--signal)',
    width: 72,
    height: 26
  }))), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '12px 14px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  })))))))));
}
function MiniStat({
  icon,
  label,
  value
}) {
  const {
    Icon
  } = window;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      boxShadow: 'var(--shadow-sm)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      flex: '0 0 38px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-subtle)',
      color: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 18
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-2xl)',
      fontWeight: 700,
      color: 'var(--text-primary)',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums'
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)',
      marginTop: 3
    }
  }, label)));
}
Object.assign(window, {
  Clientes,
  MiniStat
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/screens/Clientes.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/screens/Configuracoes.jsx
try { (() => {
/* WppTrack — Configurações (agency): BMs → contas → pixels, WhatsApp providers, AI providers. */
function Configuracoes({
  theme,
  onNav,
  onToggleTheme,
  openModal
}) {
  const {
    useState
  } = React;
  const {
    Icon,
    AppShell,
    TabBar,
    Switch,
    ClientAvatar
  } = window;
  const {
    Button,
    Card,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT,
    fmt = WT.fmt;
  const [tab, setTab] = useState('bms');
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "configuracoes",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    title: "Configura\xE7\xF5es"
  }, /*#__PURE__*/React.createElement(TabBar, {
    value: tab,
    onChange: setTab,
    tabs: [{
      value: 'bms',
      label: 'Business Managers',
      icon: 'building-2'
    }, {
      value: 'whatsapp',
      label: 'WhatsApp',
      icon: 'message-circle'
    }, {
      value: 'ia',
      label: 'Inteligência artificial',
      icon: 'sparkles'
    }]
  }), tab === 'bms' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      maxWidth: 560
    }
  }, "Conecte uma ou mais Business Managers via API de Marketing. Cada BM agrupa contas de an\xFAncio e seus pixels."), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "plus",
    onClick: () => openModal({
      type: 'bm'
    })
  }, "Conectar BM")), WT.BMS.map(bm => /*#__PURE__*/React.createElement(Card, {
    key: bm.id,
    padding: "none"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 18px',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-subtle)',
      color: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "building-2",
    size: 19
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, bm.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, "BM ", bm.metaId, " \xB7 ", bm.app)), /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true
  }, "Conectada"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconLeft: "settings"
  }, "Gerenciar")), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Conta de anúncio', 'Cliente', 'Pixels', 'Investimento 30d', ''].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h + i,
    style: {
      ...window.thStyle,
      textAlign: i === 0 ? 'left' : i === 4 ? 'right' : 'right'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, bm.accounts.map((a, i) => {
    const cli = WT.CLIENTS.find(c => c.id === a.client);
    return /*#__PURE__*/React.createElement("tr", {
      key: a.id,
      style: {
        borderBottom: i < bm.accounts.length - 1 ? '1px solid var(--divider)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '11px 18px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)'
      }
    }, a.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)'
      }
    }, a.id)), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '11px 14px',
        textAlign: 'right'
      }
    }, cli ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7
      }
    }, /*#__PURE__*/React.createElement(ClientAvatar, {
      client: cli,
      size: 22
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)'
      }
    }, cli.name)) : '—'), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '11px 14px',
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 4,
        flexWrap: 'wrap',
        justifyContent: 'flex-end'
      }
    }, a.pixels.map(p => /*#__PURE__*/React.createElement("span", {
      key: p,
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 4,
        background: 'var(--bg-inset)',
        color: 'var(--text-secondary)'
      }
    }, p)))), /*#__PURE__*/React.createElement("td", {
      style: {
        ...window.tdNum,
        color: 'var(--text-secondary)',
        fontWeight: 500
      }
    }, fmt.BRL(a.spend30d)), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '11px 18px',
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      iconLeft: "activity",
      onClick: () => openModal({
        type: 'pixel'
      })
    }, "Pixel")));
  })))))) : null, tab === 'whatsapp' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      maxWidth: 600
    }
  }, "Escolha as modalidades de provedor que sua ag\xEAncia oferece. Cada cliente conecta o WhatsApp usando um destes provedores."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, WT.WA_PROVIDERS.map(p => /*#__PURE__*/React.createElement(Card, {
    key: p.id
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 'var(--radius-md)',
      background: p.status === 'connected' ? 'var(--brand)' : 'var(--bg-subtle)',
      color: p.status === 'connected' ? '#fff' : 'var(--text-muted)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 44px'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: p.icon,
    size: 22
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-base)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap'
    }
  }, p.name), /*#__PURE__*/React.createElement(Badge, {
    tone: p.id === 'evolution' ? 'brand' : p.id === 'node' ? 'signal' : 'info'
  }, p.badge)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: 4
    }
  }, p.desc))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
      paddingTop: 14,
      borderTop: '1px solid var(--divider)'
    }
  }, p.status === 'connected' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, p.fields === 'node' ? `${p.instances}/${p.instanceCap} instâncias usadas` : `${p.instances} instâncias ativas`), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, p.fields === 'node' ? /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconLeft: "refresh-cw"
  }, "Sincronizar") : null, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "settings",
    onClick: () => openModal({
      type: 'provedor',
      providerId: p.id
    })
  }, "Configurar"))) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, "Dispon\xEDvel"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "plug",
    onClick: () => openModal({
      type: 'provedor',
      providerId: p.id
    })
  }, "Configurar provedor"))))))) : null, tab === 'ia' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      maxWidth: 600
    }
  }, "Conecte um provedor de IA para analisar conversas \u2014 inten\xE7\xE3o, qualidade e est\xE1gio do lead. A an\xE1lise pode ser ativada por cliente."), /*#__PURE__*/React.createElement(Card, {
    padding: "none"
  }, WT.AI_PROVIDERS.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '15px 18px',
      borderBottom: i < WT.AI_PROVIDERS.length - 1 ? '1px solid var(--divider)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-md)',
      background: p.status === 'connected' ? 'var(--signal-subtle)' : 'var(--bg-subtle)',
      color: p.status === 'connected' ? 'var(--signal-500)' : 'var(--text-muted)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 40px'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: p.icon,
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, p.model)), p.status === 'connected' ? /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true
  }, "API Key salva") : /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, "N\xE3o conectado"), /*#__PURE__*/React.createElement(Button, {
    variant: p.status === 'connected' ? 'ghost' : 'secondary',
    size: "sm",
    iconLeft: p.status === 'connected' ? 'settings' : 'key-round'
  }, p.status === 'connected' ? 'Gerenciar' : 'Adicionar API Key'))))) : null);
}
Object.assign(window, {
  Configuracoes
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/screens/Configuracoes.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/screens/LeadDetalhe.jsx
try { (() => {
/* WppTrack — LeadDetalhe: full lead record + WhatsApp conversation panel (disabled by default). */
function LeadDetalhe({
  leadId,
  theme,
  onNav,
  onToggleTheme,
  onBack
}) {
  const {
    useState
  } = React;
  const {
    Icon,
    ClientAvatar,
    AppShell
  } = window;
  const {
    Button,
    Card,
    Badge,
    Tag
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT,
    fmt = WT.fmt;
  let lead, client;
  for (const c of WT.CLIENTS) {
    const f = c.leads.find(l => l.id === leadId);
    if (f) {
      lead = f;
      client = c;
      break;
    }
  }
  if (!lead) {
    lead = WT.CLIENTS[0].leads[0];
    client = WT.CLIENTS[0];
  }
  const [chatOn, setChatOn] = useState(false); // privacy: opt-in

  const breadcrumb = /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-muted)',
      letterSpacing: '.04em'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 13
  }), " ", client.name);
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "leadDetalhe",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    breadcrumb: breadcrumb,
    title: "Detalhe do lead"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--brand-subtle)',
      color: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 19
    }
  }, lead.name.split(' ').map(w => w[0]).slice(0, 2).join('')), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-xl)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, lead.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, lead.phone)), /*#__PURE__*/React.createElement(Badge, {
    tone: lead.status[0],
    dot: true
  }, lead.status[1])), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "external-link",
    fullWidth: true
  }, "Abrir no WhatsApp"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "send",
    fullWidth: true
  }, "Enviar convers\xE3o"))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Origem do clique",
    title: "Rastreamento"
  }, lead.tracked ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(JourneyRow, {
    icon: "megaphone",
    label: "Campanha",
    value: lead.campaign
  }), /*#__PURE__*/React.createElement(JourneyRow, {
    icon: "layers",
    label: "Conjunto",
    value: lead.adset
  }), /*#__PURE__*/React.createElement(JourneyRow, {
    icon: "image",
    label: "An\xFAncio",
    value: lead.ad
  }), /*#__PURE__*/React.createElement(JourneyRow, {
    icon: "mouse-pointer-click",
    label: "Clique (CTWA)",
    value: lead.ctwaClid ? lead.ctwaClid.slice(0, 18) + '…' : 'rastreado'
  }), /*#__PURE__*/React.createElement(JourneyRow, {
    icon: "message-circle",
    label: "WhatsApp",
    value: lead.pixel.name,
    last: true
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 8,
      padding: 14,
      borderRadius: 'var(--radius-md)',
      background: 'var(--warning-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "help-circle",
    size: 20,
    color: "var(--warning)"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Origem n\xE3o identificada"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-secondary)',
      marginTop: 3
    }
  }, "Esta conversa iniciou sem par\xE2metros de rastreamento \u2014 provavelmente tr\xE1fego org\xE2nico ou link direto.")))), lead.tracked ? /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Par\xE2metros",
    title: "Rastreamento do clique"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: 'var(--text-brand)'
    }
  }, "CTWA Clid"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      color: 'var(--text-brand)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, lead.ctwaClid)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(Tag, {
    prefix: "utm_source:"
  }, lead.utm.source), /*#__PURE__*/React.createElement(Tag, {
    prefix: "utm_medium:"
  }, lead.utm.medium), /*#__PURE__*/React.createElement(Tag, {
    prefix: "utm_campaign:"
  }, lead.utm.campaign), /*#__PURE__*/React.createElement(Tag, {
    prefix: "utm_content:"
  }, lead.utm.content)))) : null, /*#__PURE__*/React.createElement(AIAnalysis, {
    lead: lead,
    client: client
  })), /*#__PURE__*/React.createElement(Card, {
    padding: "none",
    style: {
      overflow: 'hidden',
      position: 'sticky',
      top: 76
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '14px 18px',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-brand)'
    }
  }, "Privacidade"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Conversa do WhatsApp")), /*#__PURE__*/React.createElement(Toggle, {
    on: chatOn,
    onChange: setChatOn,
    label: chatOn ? 'Visível' : 'Oculta'
  })), chatOn ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      background: 'var(--bg-inset)',
      maxHeight: 460,
      overflowY: 'auto'
    }
  }, WT.SAMPLE_CHAT.map((m, i) => /*#__PURE__*/React.createElement(Bubble, {
    key: i,
    m: m
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '48px 28px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "lock",
    size: 22,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Conversa oculta por padr\xE3o"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      maxWidth: 320
    }
  }, "Para proteger a privacidade do lead, o conte\xFAdo da conversa s\xF3 \xE9 exibido quando voc\xEA habilita a visualiza\xE7\xE3o."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "eye",
    onClick: () => setChatOn(true)
  }, "Habilitar visualiza\xE7\xE3o")))));
}
function JourneyRow({
  icon,
  label,
  value,
  last
}) {
  const {
    Icon
  } = window;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '9px 0',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-subtle)',
      color: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 15
  })), !last ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 30,
      width: 2,
      height: 18,
      background: 'var(--border)'
    }
  }) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      textAlign: 'right'
    }
  }, value)));
}
function Bubble({
  m
}) {
  const lead = m.from === 'lead';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: lead ? 'flex-start' : 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '78%',
      padding: '9px 12px',
      borderRadius: lead ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
      background: lead ? 'var(--bg-surface)' : 'var(--brand)',
      color: lead ? 'var(--text-primary)' : 'var(--on-brand)',
      border: lead ? '1px solid var(--border)' : 'none',
      boxShadow: 'var(--shadow-xs)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      lineHeight: 1.45
    }
  }, m.text), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      color: lead ? 'var(--text-muted)' : 'rgba(255,255,255,0.75)',
      textAlign: 'right',
      marginTop: 3
    }
  }, m.time)));
}
function Toggle({
  on,
  onChange,
  label
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(!on),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 9,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      color: on ? 'var(--text-brand)' : 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 22,
      borderRadius: 999,
      background: on ? 'var(--brand)' : 'var(--gray-300)',
      position: 'relative',
      transition: 'background var(--dur-base) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: on ? 19 : 3,
      width: 16,
      height: 16,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: 'var(--shadow-sm)',
      transition: 'left var(--dur-base) var(--ease-out)'
    }
  })));
}
function AIAnalysis({
  lead,
  client
}) {
  const {
    useState
  } = React;
  const {
    Icon
  } = window;
  const {
    Button,
    Card,
    Badge,
    Tag
  } = window.WppTrackDesignSystem_851504;
  const A = window.WT.SAMPLE_AI;
  const enabled = client && client.config && client.config.ai && client.config.ai.enabled;
  const [run, setRun] = useState(false);
  const analysed = enabled || run;
  if (!lead.tracked && !analysed) {
    return /*#__PURE__*/React.createElement(Card, {
      eyebrow: "Intelig\xEAncia",
      title: "An\xE1lise da IA"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)'
      }
    }, "A an\xE1lise autom\xE1tica est\xE1 restrita a leads de campanha. Voc\xEA pode analisar este lead manualmente."), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 12
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm",
      iconLeft: "sparkles",
      onClick: () => setRun(true)
    }, "Analisar conversa")));
  }
  if (!analysed) {
    return /*#__PURE__*/React.createElement(Card, {
      eyebrow: "Intelig\xEAncia",
      title: "An\xE1lise da IA"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        flex: 1
      }
    }, "Ative a an\xE1lise autom\xE1tica nas configura\xE7\xF5es do cliente, ou rode agora."), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm",
      iconLeft: "sparkles",
      onClick: () => setRun(true)
    }, "Analisar")));
  }
  return /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Intelig\xEAncia",
    title: /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8
      }
    }, "An\xE1lise da IA ", /*#__PURE__*/React.createElement(Badge, {
      tone: "signal",
      dot: true
    }, "auto")),
    action: /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-muted)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkles",
      size: 13,
      color: "var(--signal-500)"
    }), " ", client.config.ai.provider || 'claude')
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 56,
      height: 56,
      flex: '0 0 56px'
    }
  }, /*#__PURE__*/React.createElement(window.Donut, {
    size: 56,
    thickness: 7,
    segments: [{
      value: A.score,
      color: 'var(--signal)'
    }, {
      value: 100 - A.score,
      color: 'var(--bg-inset)'
    }]
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, A.score))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "signal",
    dot: true
  }, A.intent), /*#__PURE__*/React.createElement(Badge, {
    tone: "warning"
  }, "Qualidade: ", A.quality), /*#__PURE__*/React.createElement(Badge, {
    tone: "brand"
  }, "Est\xE1gio: ", A.stage))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      lineHeight: 1.55
    }
  }, A.summary), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginTop: 12
    }
  }, A.tags.map(t => /*#__PURE__*/React.createElement(Tag, {
    key: t,
    prefix: ""
  }, t))));
}
Object.assign(window, {
  LeadDetalhe,
  JourneyRow,
  Bubble,
  Toggle,
  AIAnalysis
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/screens/LeadDetalhe.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/screens/Overview.jsx
try { (() => {
/* WppTrack — Overview: agency-wide view across the whole operation. Filter by client + pixel. */
function Overview({
  theme,
  onNav,
  onToggleTheme,
  onOpenClient
}) {
  const {
    useState
  } = React;
  const {
    Icon,
    Donut,
    LineChart,
    ClientAvatar,
    AppShell,
    Segmented
  } = window;
  const {
    Button,
    StatCard,
    Card,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT,
    T = WT.TOTALS,
    fmt = WT.fmt;
  const [clientFilter, setClientFilter] = useState('todos');
  const [range, setRange] = useState('7d');
  const clients = clientFilter === 'todos' ? WT.CLIENTS : WT.CLIENTS.filter(c => c.id === clientFilter);
  const t = clients.reduce((a, c) => ({
    conversas: a.conversas + c.conversas,
    rastreadas: a.rastreadas + c.rastreadas,
    naoRastreadas: a.naoRastreadas + c.naoRastreadas,
    conversoes: a.conversoes + c.conversoes,
    investimento: a.investimento + c.investimento,
    receita: a.receita + c.receita
  }), {
    conversas: 0,
    rastreadas: 0,
    naoRastreadas: 0,
    conversoes: 0,
    investimento: 0,
    receita: 0
  });
  const taxa = Math.round(t.rastreadas / t.conversas * 100);
  const trendConversas = WT.TREND.map(d => d.conversas);
  const trendRastreadas = WT.TREND.map(d => d.rastreadas);
  const filters = /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: clientFilter,
    onChange: e => setClientFilter(e.target.value),
    style: selStyle
  }, /*#__PURE__*/React.createElement("option", {
    value: "todos"
  }, "Todos os clientes"), WT.CLIENTS.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.name))), /*#__PURE__*/React.createElement(Segmented, {
    options: [{
      value: '7d',
      label: '7d'
    }, {
      value: '30d',
      label: '30d'
    }, {
      value: '90d',
      label: '90d'
    }],
    value: range,
    onChange: setRange
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "download"
  }, "Exportar"));
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "overview",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    title: "Vis\xE3o geral",
    actions: filters
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Conversas iniciadas",
    value: fmt.NUM(t.conversas),
    delta: "+14%",
    hint: "vs. per\xEDodo",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "message-circle",
      size: 16
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Rastreadas",
    value: fmt.NUM(t.rastreadas),
    delta: `${taxa}%`,
    deltaDir: "up",
    hint: "da origem",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "git-branch",
      size: 16
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "N\xE3o rastreadas",
    value: fmt.NUM(t.naoRastreadas),
    delta: `${100 - taxa}%`,
    deltaDir: "down",
    hint: "sem origem",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "help-circle",
      size: 16
    })
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Convers\xF5es enviadas",
    value: fmt.NUM(t.conversoes),
    delta: "+9%",
    accent: true,
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "send",
      size: 16,
      color: "#fff"
    })
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.7fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Conversas \xB7 14 dias",
    title: "Volume rastreado",
    action: /*#__PURE__*/React.createElement(Legend, {
      items: [{
        c: 'var(--teal-500)',
        t: 'Iniciadas'
      }, {
        c: 'var(--signal)',
        t: 'Rastreadas'
      }]
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(LineChart, {
    height: 210,
    series: [{
      points: trendConversas,
      color: 'var(--teal-500)',
      fill: 'var(--brand-subtle)'
    }, {
      points: trendRastreadas,
      color: 'var(--signal)'
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 8
    }
  }, WT.TREND.filter((_, i) => i % 3 === 0).map(d => /*#__PURE__*/React.createElement("span", {
    key: d.day,
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--text-muted)'
    }
  }, d.label))))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Qualidade do rastreio",
    title: "Origem dos leads"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(Donut, {
    size: 120,
    thickness: 17,
    segments: [{
      value: t.rastreadas,
      color: 'var(--teal-500)'
    }, {
      value: t.naoRastreadas,
      color: 'var(--bg-inset)'
    }]
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 26,
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, taxa, "%"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--text-muted)'
    }
  }, "rastreado")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(LegendRow, {
    color: "var(--teal-500)",
    label: "Rastreadas",
    value: fmt.NUM(t.rastreadas)
  }), /*#__PURE__*/React.createElement(LegendRow, {
    color: "var(--gray-300)",
    label: "N\xE3o rastreadas",
    value: fmt.NUM(t.naoRastreadas)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--divider)'
    }
  }), /*#__PURE__*/React.createElement(LegendRow, {
    color: "var(--signal)",
    label: "Convers\xF5es",
    value: fmt.NUM(t.conversoes)
  }))))), /*#__PURE__*/React.createElement(Card, {
    padding: "none"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 18px',
      borderBottom: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-brand)'
    }
  }, "Opera\xE7\xE3o \xB7 ", clients.length, " clientes"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Desempenho por cliente")), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconRight: "arrow-right",
    onClick: () => onNav('clientes')
  }, "Ver clientes")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, ['Cliente', 'Conversas', 'Rastreadas', 'Não rastr.', 'Taxa', 'Conversões', ''].map((h, i) => /*#__PURE__*/React.createElement("th", {
    key: h + i,
    style: {
      ...thStyle,
      textAlign: i === 0 ? 'left' : i === 6 ? 'right' : 'right'
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, clients.map((c, i) => /*#__PURE__*/React.createElement("tr", {
    key: c.id,
    onClick: () => onOpenClient(c.id),
    style: {
      borderBottom: i < clients.length - 1 ? '1px solid var(--divider)' : 'none',
      cursor: 'pointer'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--bg-hover)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '11px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(ClientAvatar, {
    client: c,
    size: 30
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, c.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, c.segment)))), /*#__PURE__*/React.createElement("td", {
    style: tdNum
  }, fmt.NUM(c.conversas)), /*#__PURE__*/React.createElement("td", {
    style: tdNum
  }, fmt.NUM(c.rastreadas)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...tdNum,
      color: 'var(--text-muted)'
    }
  }, fmt.NUM(c.naoRastreadas)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '11px 14px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: c.taxaRastreio >= 80 ? 'success' : c.taxaRastreio >= 70 ? 'warning' : 'danger'
  }, c.taxaRastreio, "%")), /*#__PURE__*/React.createElement("td", {
    style: tdNum
  }, fmt.NUM(c.conversoes)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: '11px 14px',
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "var(--text-muted)"
  })))))))));
}
const selStyle = {
  height: 'var(--control-sm)',
  padding: '0 28px 0 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' fill=\'none\' stroke=\'%236B7775\' stroke-width=\'2\'><path d=\'M2 4l4 4 4-4\'/></svg>")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center'
};
const thStyle = {
  padding: '10px 14px',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 500,
  borderBottom: '1px solid var(--divider)',
  whiteSpace: 'nowrap'
};
const tdNum = {
  padding: '11px 14px',
  textAlign: 'right',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--text-primary)',
  fontVariantNumeric: 'tabular-nums'
};
function Legend({
  items
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 'var(--text-xs)',
      color: 'var(--text-secondary)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: 3,
      background: it.c
    }
  }), it.t)));
}
function LegendRow({
  color,
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: 3,
      background: color,
      flex: '0 0 auto'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      flex: 1
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, value));
}
Object.assign(window, {
  Overview,
  Legend,
  LegendRow,
  selStyle,
  thStyle,
  tdNum
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/screens/Overview.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/screens/RelatorioCliente.jsx
try { (() => {
/* WppTrack — RelatorioCliente: agency configures a white-label, read-only report + shareable link. */
function RelatorioCliente({
  clientId,
  theme,
  onNav,
  onToggleTheme,
  onBack
}) {
  const {
    useState
  } = React;
  const {
    Icon,
    AppShell,
    Switch,
    ClientAvatar,
    Donut
  } = window;
  const {
    Button,
    Card,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT,
    fmt = WT.fmt;
  const c = WT.CLIENTS.find(x => x.id === clientId) || WT.CLIENTS[0];
  const ALL = [{
    id: 'conversas',
    label: 'Conversas iniciadas',
    icon: 'message-circle'
  }, {
    id: 'rastreadas',
    label: 'Rastreadas / Não rastreadas',
    icon: 'git-branch'
  }, {
    id: 'investimento',
    label: 'Investimento',
    icon: 'wallet'
  }, {
    id: 'custoReal',
    label: 'Custo por lead real',
    icon: 'target'
  }, {
    id: 'vendas',
    label: 'Vendas e faturamento',
    icon: 'badge-dollar-sign'
  }, {
    id: 'roas',
    label: 'ROAS de campanha',
    icon: 'trending-up'
  }, {
    id: 'eventos',
    label: 'Eventos por etiqueta',
    icon: 'tags'
  }];
  const [vis, setVis] = useState({
    conversas: true,
    rastreadas: true,
    investimento: true,
    custoReal: true,
    vendas: true,
    roas: true,
    eventos: true
  });
  const toggle = id => setVis(v => ({
    ...v,
    [id]: !v[id]
  }));
  const breadcrumb = /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      padding: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-muted)',
      letterSpacing: '.04em'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 13
  }), " ", c.name);
  const link = `https://relatorio.wpptrack.com/${c.id}-7f3a9e`;
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "relatorios",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    breadcrumb: breadcrumb,
    title: "Relat\xF3rio do cliente"
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 12,
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-subtle)',
      color: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 36px'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "link",
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, "Link do relat\xF3rio (read-only)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, link))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "copy"
  }, "Copiar link"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconLeft: "download"
  }, "Exportar PDF"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "external-link"
  }, "Abrir como cliente")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '300px 1fr',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Configurar",
    title: "O que o cliente v\xEA"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, ALL.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: m.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '11px 0',
      borderBottom: i < ALL.length - 1 ? '1px solid var(--divider)' : 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: m.icon,
    size: 16,
    color: vis[m.id] ? 'var(--brand)' : 'var(--text-muted)'
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 'var(--text-sm)',
      fontWeight: 500,
      color: vis[m.id] ? 'var(--text-primary)' : 'var(--text-muted)'
    }
  }, m.label), /*#__PURE__*/React.createElement(Switch, {
    on: vis[m.id],
    onChange: () => toggle(m.id),
    size: 20
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xl)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)',
      background: 'var(--bg-surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'linear-gradient(120deg, var(--teal-700), var(--teal-900))',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 'var(--radius-md)',
      background: 'rgba(255,255,255,0.16)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 13
    }
  }, "AN"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.7)'
    }
  }, "Relat\xF3rio de performance"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-xl)',
      fontWeight: 700
    }
  }, c.name))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      fontSize: 'var(--text-xs)',
      color: 'rgba(255,255,255,0.8)'
    }
  }, "12/06 \u2014 25/06 \xB7 2026", /*#__PURE__*/React.createElement("br", null), "por Ag\xEAncia Norte")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 22,
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 12
    }
  }, vis.conversas ? /*#__PURE__*/React.createElement(PvCard, {
    label: "Conversas iniciadas",
    value: fmt.NUM(c.conversas)
  }) : null, vis.rastreadas ? /*#__PURE__*/React.createElement(PvCard, {
    label: "Rastreadas",
    value: fmt.NUM(c.rastreadas),
    sub: `${c.taxaRastreio}% da origem`
  }) : null, vis.rastreadas ? /*#__PURE__*/React.createElement(PvCard, {
    label: "N\xE3o rastreadas",
    value: fmt.NUM(c.naoRastreadas)
  }) : null, vis.investimento ? /*#__PURE__*/React.createElement(PvCard, {
    label: "Investimento",
    value: fmt.BRL(c.investimento)
  }) : null, vis.custoReal ? /*#__PURE__*/React.createElement(PvCard, {
    label: "Custo por lead real",
    value: fmt.BRL(c.custoLeadReal)
  }) : null, vis.vendas ? /*#__PURE__*/React.createElement(PvCard, {
    label: "Vendas",
    value: fmt.NUM(c.vendas),
    sub: fmt.BRL(c.faturamento) + ' faturado',
    accent: true
  }) : null), vis.roas ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '16px 18px',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--brand-border)',
      background: 'var(--brand-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-brand)'
    }
  }, "ROAS de campanha"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: 2
    }
  }, fmt.BRL(c.faturamento), " de retorno sobre ", fmt.BRL(c.investimento))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-4xl)',
      fontWeight: 700,
      color: 'var(--text-brand)'
    }
  }, c.roasCampanha, "x")) : null, vis.eventos ? /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-base)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      marginBottom: 12
    }
  }, "Eventos por etiqueta"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, c.config.etiquetas.filter(e => e.event).map((e, i) => {
    const max = Math.max(...c.config.etiquetas.filter(x => x.event).map(x => x.count));
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 120,
        flex: '0 0 120px',
        display: 'flex',
        alignItems: 'center',
        gap: 7
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 9,
        height: 9,
        borderRadius: 3,
        background: e.color
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-sm)',
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, e.label)), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 7,
        borderRadius: 999,
        background: 'var(--bg-inset)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: `${e.count / max * 100}%`,
        height: '100%',
        borderRadius: 999,
        background: e.color
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 50,
        textAlign: 'right',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)'
      }
    }, fmt.NUM(e.count)));
  }))) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      fontSize: 10,
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)',
      paddingTop: 4
    }
  }, "Powered by WppTrack \xB7 dados de rastreamento de campanhas Meta Ads")))));
}
function PvCard({
  label,
  value,
  sub,
  accent
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 16px',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${accent ? 'var(--brand-border)' : 'var(--border)'}`,
      background: accent ? 'var(--brand-subtle)' : 'var(--bg-surface)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-2xl)',
      fontWeight: 700,
      color: accent ? 'var(--text-brand)' : 'var(--text-primary)',
      marginTop: 4,
      fontVariantNumeric: 'tabular-nums'
    }
  }, value), sub ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, sub) : null);
}
Object.assign(window, {
  RelatorioCliente,
  PvCard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/screens/RelatorioCliente.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/screens/Relatorios.jsx
try { (() => {
/* WppTrack — Relatorios: BI view (trend, ROAS, media investment) + per-client report generation/export. */
function Relatorios({
  theme,
  onNav,
  onToggleTheme,
  onOpenReport
}) {
  const {
    useState
  } = React;
  const {
    Icon,
    LineChart,
    BarMini,
    Donut,
    ClientAvatar,
    AppShell,
    Segmented
  } = window;
  const {
    Button,
    Card,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const WT = window.WT,
    fmt = WT.fmt,
    T = WT.TOTALS;
  const [clientId, setClientId] = useState('todos');
  const [range, setRange] = useState('14d');
  const scope = clientId === 'todos' ? null : WT.CLIENTS.find(c => c.id === clientId);
  const scale = scope ? scope.conversas / T.conversas : 1;
  const invest = scope ? scope.investimento : T.investimento;
  const receita = scope ? scope.receita : T.receita;
  const roas = scope ? scope.roas : T.roas;
  const cpl = scope ? scope.cpl : T.cpl;
  const conversoes = scope ? scope.conversoes : T.conversoes;
  const trendConversas = WT.TREND.map(d => Math.round(d.conversas * (scope ? scale * 6 : 1)));
  const trendInvest = WT.TREND.map(d => Math.round(d.investimento * (scope ? scale * 6 : 1)));
  const actions = /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: clientId,
    onChange: e => setClientId(e.target.value),
    style: window.selStyle
  }, /*#__PURE__*/React.createElement("option", {
    value: "todos"
  }, "Toda a opera\xE7\xE3o"), WT.CLIENTS.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.name))), /*#__PURE__*/React.createElement(Segmented, {
    value: range,
    onChange: setRange,
    options: [{
      value: '7d',
      label: '7d'
    }, {
      value: '14d',
      label: '14d'
    }, {
      value: '30d',
      label: '30d'
    }]
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "download"
  }, "Exportar PDF"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "share-2",
    onClick: () => onOpenReport && onOpenReport(scope ? scope.id : null)
  }, "Gerar p/ cliente"));
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "relatorios",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    title: "Relat\xF3rios",
    actions: actions
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
      padding: '18px 20px',
      borderRadius: 'var(--radius-lg)',
      background: 'linear-gradient(120deg, var(--teal-700), var(--teal-900))',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, scope ? /*#__PURE__*/React.createElement(ClientAvatar, {
    client: scope,
    size: 40
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-md)',
      background: 'rgba(255,255,255,0.16)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "building-2",
    size: 20,
    color: "#fff"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.7)'
    }
  }, "Relat\xF3rio de performance"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-2xl)',
      fontWeight: 700
    }
  }, scope ? scope.name : 'Toda a operação'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'rgba(255,255,255,0.75)'
    }
  }, "12/06 \u2014 25/06 \xB7 2026 \xB7 gerado por Ag\xEAncia Norte"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 28
    }
  }, /*#__PURE__*/React.createElement(BandStat, {
    label: "ROAS",
    value: roas + 'x'
  }), /*#__PURE__*/React.createElement(BandStat, {
    label: "Investimento",
    value: fmt.BRL(invest)
  }), /*#__PURE__*/React.createElement(BandStat, {
    label: "Receita atribu\xEDda",
    value: fmt.BRL(receita)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(BIStat, {
    icon: "trending-up",
    label: "ROAS",
    value: roas + 'x',
    delta: "+0.4x",
    up: true
  }), /*#__PURE__*/React.createElement(BIStat, {
    icon: "dollar-sign",
    label: "Custo por conversa",
    value: fmt.BRL(cpl),
    delta: "\u22126%",
    up: true
  }), /*#__PURE__*/React.createElement(BIStat, {
    icon: "send",
    label: "Convers\xF5es enviadas",
    value: fmt.NUM(conversoes),
    delta: "+9%",
    up: true
  }), /*#__PURE__*/React.createElement(BIStat, {
    icon: "badge-percent",
    label: "Receita / investimento",
    value: fmt.BRL(receita - invest),
    delta: "+12%",
    up: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.6fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Conversas iniciadas",
    title: "Tend\xEAncia do per\xEDodo",
    action: /*#__PURE__*/React.createElement(window.Legend, {
      items: [{
        c: 'var(--teal-500)',
        t: 'Conversas'
      }]
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(LineChart, {
    height: 210,
    series: [{
      points: trendConversas,
      color: 'var(--teal-500)',
      fill: 'var(--brand-subtle)'
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 8
    }
  }, WT.TREND.filter((_, i) => i % 3 === 0).map(d => /*#__PURE__*/React.createElement("span", {
    key: d.day,
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--text-muted)'
    }
  }, d.label))))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "M\xEDdia \xB7 Meta Ads",
    title: "Investimento di\xE1rio"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(BarMini, {
    data: trendInvest,
    height: 150,
    colorFn: i => i === trendInvest.length - 1 ? 'var(--signal)' : 'var(--teal-400)'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTop: '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, "Total investido"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)',
      fontWeight: 700,
      color: 'var(--text-primary)'
    }
  }, fmt.BRL(invest)))))), !scope ? /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Comparativo",
    title: "Ranking por ROAS",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      iconRight: "arrow-right",
      onClick: () => onNav('clientes')
    }, "Ver clientes")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      marginTop: 6
    }
  }, [...WT.CLIENTS].sort((a, b) => b.roas - a.roas).map(c => {
    const maxRoas = Math.max(...WT.CLIENTS.map(x => x.roas));
    return /*#__PURE__*/React.createElement("div", {
      key: c.id,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 150,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        flex: '0 0 150px'
      }
    }, /*#__PURE__*/React.createElement(ClientAvatar, {
      client: c,
      size: 26
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-sm)',
        fontWeight: 500,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, c.name)), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 10,
        borderRadius: 999,
        background: 'var(--bg-inset)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: `${c.roas / maxRoas * 100}%`,
        height: '100%',
        borderRadius: 999,
        background: 'linear-gradient(90deg,var(--teal-400),var(--teal-600))'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 48,
        textAlign: 'right',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        fontWeight: 700,
        color: 'var(--text-primary)'
      }
    }, c.roas, "x"), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 92,
        textAlign: 'right',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)'
      }
    }, fmt.BRL(c.investimento)));
  }))) : null);
}
function BandStat({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.7)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-2xl)',
      fontWeight: 700,
      color: '#fff',
      fontVariantNumeric: 'tabular-nums'
    }
  }, value));
}
function BIStat({
  icon,
  label,
  value,
  delta,
  up
}) {
  const {
    Icon
  } = window;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: '16px 18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16,
    color: "var(--text-muted)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-3xl)',
      fontWeight: 700,
      color: 'var(--text-primary)',
      marginTop: 8,
      fontVariantNumeric: 'tabular-nums'
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      marginTop: 6,
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      color: up ? 'var(--success)' : 'var(--danger)'
    }
  }, up ? '▴' : '▾', " ", delta));
}
Object.assign(window, {
  Relatorios,
  BandStat,
  BIStat
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/screens/Relatorios.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/screens/Sistema.jsx
try { (() => {
/* WppTrack — Sistema: perfil do usuário + white-label (marca, cores, logo SVG). */
function Sistema({
  theme,
  onNav,
  onToggleTheme
}) {
  const {
    useState
  } = React;
  const {
    Icon,
    AppShell,
    TabBar,
    Field,
    TextField,
    Switch
  } = window;
  const {
    Button,
    Card,
    Badge
  } = window.WppTrackDesignSystem_851504;
  const [tab, setTab] = useState('marca');
  const [accent, setAccent] = useState(() => {
    try {
      return localStorage.getItem('wt_accent') || 'teal';
    } catch (e) {
      return 'teal';
    }
  });
  const [logoName, setLogoName] = useState(null);
  const PALETTES = window.WT_PALETTES;
  React.useEffect(() => {
    window.applyAccent(accent);
  }, [accent]);
  return /*#__PURE__*/React.createElement(AppShell, {
    active: "sistema",
    onNav: onNav,
    theme: theme,
    onToggleTheme: onToggleTheme,
    title: "Configura\xE7\xF5es da conta"
  }, /*#__PURE__*/React.createElement(TabBar, {
    value: tab,
    onChange: setTab,
    tabs: [{
      value: 'marca',
      label: 'Marca & sistema',
      icon: 'palette'
    }, {
      value: 'perfil',
      label: 'Perfil',
      icon: 'user'
    }]
  }), tab === 'marca' ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "White-label",
    title: "Logo da ag\xEAncia"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginBottom: 14
    }
  }, "Suba o logo da sua ag\xEAncia (SVG) \u2014 ele aparece no painel, nos relat\xF3rios do cliente e na p\xE1gina de conex\xE3o."), /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '28px 18px',
      borderRadius: 'var(--radius-lg)',
      border: '1.5px dashed var(--border-strong)',
      background: 'var(--bg-inset)',
      cursor: 'pointer',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: ".svg,image/svg+xml",
    style: {
      display: 'none'
    },
    onChange: e => setLogoName(e.target.files[0] && e.target.files[0].name)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-subtle)',
      color: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: logoName ? 'check' : 'upload-cloud',
    size: 22
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, logoName || 'Arraste o SVG ou clique para enviar'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, "SVG \xB7 at\xE9 1 MB \xB7 fundo transparente")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "image"
  }, "Trocar favicon"), logoName ? /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconLeft: "trash-2",
    onClick: () => setLogoName(null)
  }, "Remover") : null)), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "White-label",
    title: "Cor de destaque"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginBottom: 14
    }
  }, "Aplica os bot\xF5es, gr\xE1ficos e destaques do painel e dos relat\xF3rios \u2014 em todas as tonalidades."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap'
    }
  }, Object.entries(PALETTES).map(([key, p]) => {
    const on = accent === key;
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      onClick: () => setAccent(key),
      "aria-label": p.name,
      title: p.name,
      style: {
        width: 40,
        height: 40,
        borderRadius: 'var(--radius-md)',
        background: p.swatch,
        border: on ? '2px solid var(--text-primary)' : '2px solid transparent',
        boxShadow: on ? 'var(--shadow-sm)' : 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, on ? /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 18,
      color: "#fff"
    }) : null);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      gap: 4
    }
  }, ['subtle', 'border', 't500', 't600', 't700'].map(k => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      flex: 1,
      height: 22,
      borderRadius: 5,
      background: PALETTES[accent][k]
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      padding: 16,
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      background: 'var(--bg-inset)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: 8
    }
  }, "Pr\xE9via"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      height: 34,
      alignItems: 'center',
      padding: '0 16px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand)',
      color: 'var(--on-brand)',
      fontWeight: 600,
      fontSize: 'var(--text-sm)'
    }
  }, "Enviar convers\xE3o"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 9px',
      borderRadius: 999,
      background: 'var(--brand-subtle)',
      color: 'var(--text-brand)',
      fontSize: 'var(--text-xs)',
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--brand)'
    }
  }), "Conectado"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)'
    }
  }, "Tema escuro por padr\xE3o"), /*#__PURE__*/React.createElement(Switch, {
    on: theme === 'dark',
    onChange: onToggleTheme
  })))) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Conta",
    title: "Seu perfil"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 52,
      height: 52,
      borderRadius: 'var(--radius-lg)',
      background: 'linear-gradient(135deg,var(--teal-500),var(--teal-700))',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 18
    }
  }, "RM"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconLeft: "image"
  }, "Trocar foto")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Nome"
  }, /*#__PURE__*/React.createElement(TextField, {
    defaultValue: "Rafael Moreira"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Cargo"
  }, /*#__PURE__*/React.createElement(TextField, {
    defaultValue: "Gestor de tr\xE1fego"
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "E-mail"
  }, /*#__PURE__*/React.createElement(TextField, {
    mono: true,
    defaultValue: "rafael@agencianorte.com"
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconLeft: "save"
  }, "Salvar perfil")), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Seguran\xE7a",
    title: "Prefer\xEAncias"
  }, /*#__PURE__*/React.createElement(Row, {
    label: "Senha",
    hint: "\xDAltima troca h\xE1 3 meses",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, "Alterar")
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Verifica\xE7\xE3o em 2 fatores",
    hint: "Proteja o acesso \xE0 opera\xE7\xE3o",
    action: /*#__PURE__*/React.createElement(Switch, {
      on: true,
      onChange: () => {}
    })
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Notifica\xE7\xF5es por e-mail",
    hint: "Resumo di\xE1rio de leads",
    action: /*#__PURE__*/React.createElement(Switch, {
      on: false,
      onChange: () => {}
    }),
    last: true
  }))));
}
function Row({
  label,
  hint,
  action,
  last
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 0',
      borderBottom: last ? 'none' : '1px solid var(--divider)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, hint)), action);
}
Object.assign(window, {
  Sistema
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/screens/Sistema.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/shared.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* WppTrack dashboard — shared UI helpers (Icon + lightweight inline-SVG charts).
   Exposes window.WTUI = { Icon, Donut, LineChart, BarMini, Spark }. */
const {
  useState: _uS,
  useEffect: _uE,
  useRef: _uR
} = React;
function Icon({
  name,
  size = 18,
  color = 'currentColor',
  stroke = 2,
  style
}) {
  const [svg, setSvg] = _uS('');
  _uE(() => {
    let on = true;
    fetch(`https://unpkg.com/lucide-static@latest/icons/${name}.svg`).then(r => r.ok ? r.text() : '').then(t => on && setSvg(t)).catch(() => {});
    return () => {
      on = false;
    };
  }, [name]);
  if (!svg) return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: size,
      height: size,
      ...style
    }
  });
  return /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      display: 'inline-flex',
      width: size,
      height: size,
      color,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: svg.replace('<svg', `<svg width="${size}" height="${size}" stroke-width="${stroke}"`)
    }
  });
}

/* Donut — segments: [{value, color}] */
function Donut({
  segments,
  size = 116,
  thickness = 16,
  children
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: 'rotate(-90deg)'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "var(--bg-inset)",
    strokeWidth: thickness
  }), segments.map((s, i) => {
    const len = s.value / total * c;
    const el = /*#__PURE__*/React.createElement("circle", {
      key: i,
      cx: size / 2,
      cy: size / 2,
      r: r,
      fill: "none",
      stroke: s.color,
      strokeWidth: thickness,
      strokeDasharray: `${len} ${c - len}`,
      strokeDashoffset: -offset,
      strokeLinecap: "butt"
    });
    offset += len;
    return el;
  })), children ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, children) : null);
}

/* LineChart — multiple series over the same x. series: [{points:[n], color, fill}] */
function LineChart({
  series,
  width = 560,
  height = 200,
  pad = 10,
  max
}) {
  const n = series[0].points.length;
  const hi = max || Math.max(...series.flatMap(s => s.points)) * 1.1;
  const x = i => pad + i / (n - 1) * (width - pad * 2);
  const y = v => height - pad - v / hi * (height - pad * 2);
  const path = pts => pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = pts => `${path(pts)} L${x(n - 1).toFixed(1)} ${height - pad} L${x(0).toFixed(1)} ${height - pad} Z`;
  return /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "none",
    style: {
      display: 'block'
    }
  }, [0.25, 0.5, 0.75].map(g => /*#__PURE__*/React.createElement("line", {
    key: g,
    x1: pad,
    x2: width - pad,
    y1: pad + g * (height - pad * 2),
    y2: pad + g * (height - pad * 2),
    stroke: "var(--divider)",
    strokeWidth: "1"
  })), series.map((s, i) => /*#__PURE__*/React.createElement("g", {
    key: i
  }, s.fill ? /*#__PURE__*/React.createElement("path", {
    d: area(s.points),
    fill: s.fill,
    opacity: "0.5"
  }) : null, /*#__PURE__*/React.createElement("path", {
    d: path(s.points),
    fill: "none",
    stroke: s.color,
    strokeWidth: "2.4",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }))));
}

/* BarMini — vertical bars. data: [n]; colorFn(i)->color */
function BarMini({
  data,
  height = 120,
  colorFn,
  gap = 5
}) {
  const hi = Math.max(...data) * 1.05 || 1;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap,
      height
    }
  }, data.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: `${v / hi * 100}%`,
      minHeight: 3,
      borderRadius: '4px 4px 0 0',
      background: colorFn ? colorFn(i) : 'var(--brand)'
    }
  })));
}

/* Spark — tiny inline sparkline */
function Spark({
  points,
  color = 'var(--brand)',
  width = 92,
  height = 30
}) {
  const hi = Math.max(...points),
    lo = Math.min(...points),
    rng = hi - lo || 1;
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${i / (points.length - 1) * width} ${height - (v - lo) / rng * height}`).join(' ');
  return /*#__PURE__*/React.createElement("svg", {
    width: width,
    height: height,
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: d,
    fill: "none",
    stroke: color,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
Object.assign(window, {
  Icon,
  Donut,
  LineChart,
  BarMini,
  Spark
});
window.WTUI = {
  Icon,
  Donut,
  LineChart,
  BarMini,
  Spark
};

/* ---- White-label accent: global palette + persistent apply (charts included) ---- */
window.WT_PALETTES = {
  teal: {
    name: 'Teal',
    swatch: '#0E8C7A',
    t300: '#59B9A7',
    t400: '#259E89',
    t500: '#0E8C7A',
    t600: '#0B7567',
    t700: '#0A5E53',
    subtle: '#E6F4F1',
    border: '#93D2C6',
    signal: '#12B884',
    signal4: '#20CF98',
    ring: 'rgba(14,140,122,0.45)'
  },
  orange: {
    name: 'Laranja',
    swatch: '#EA580C',
    t300: '#FDBA74',
    t400: '#FB923C',
    t500: '#EA580C',
    t600: '#C2410C',
    t700: '#9A3412',
    subtle: '#FDEEE3',
    border: '#F8C9A6',
    signal: '#F59E0B',
    signal4: '#FBBF24',
    ring: 'rgba(234,88,12,0.4)'
  },
  blue: {
    name: 'Azul',
    swatch: '#2563EB',
    t300: '#93C5FD',
    t400: '#60A5FA',
    t500: '#2563EB',
    t600: '#1D4ED8',
    t700: '#1E40AF',
    subtle: '#E6EEFD',
    border: '#AFC8F7',
    signal: '#0EA5E9',
    signal4: '#38BDF8',
    ring: 'rgba(37,99,235,0.4)'
  },
  violet: {
    name: 'Violeta',
    swatch: '#7C3AED',
    t300: '#C4B5FD',
    t400: '#A78BFA',
    t500: '#7C3AED',
    t600: '#6D28D9',
    t700: '#5B21B6',
    subtle: '#F0E9FD',
    border: '#CDB8F6',
    signal: '#A855F7',
    signal4: '#C084FC',
    ring: 'rgba(124,58,237,0.4)'
  },
  green: {
    name: 'Verde',
    swatch: '#16A34A',
    t300: '#86EFAC',
    t400: '#4ADE80',
    t500: '#16A34A',
    t600: '#15803D',
    t700: '#166534',
    subtle: '#E5F6EB',
    border: '#A6E0BB',
    signal: '#22C55E',
    signal4: '#4ADE80',
    ring: 'rgba(22,163,74,0.4)'
  },
  rose: {
    name: 'Rosa',
    swatch: '#E11D63',
    t300: '#FDA4C4',
    t400: '#F472A6',
    t500: '#E11D63',
    t600: '#BE185D',
    t700: '#9D174D',
    subtle: '#FCE7F0',
    border: '#F6B6CF',
    signal: '#FB7185',
    signal4: '#FB91A1',
    ring: 'rgba(225,29,99,0.4)'
  }
};
window.applyAccent = function (key) {
  const p = window.WT_PALETTES[key];
  if (!p) return;
  const r = document.documentElement.style;
  const set = {
    '--brand': p.t500,
    '--brand-hover': p.t600,
    '--brand-active': p.t700,
    '--brand-subtle': p.subtle,
    '--brand-border': p.border,
    '--text-brand': p.t600,
    '--on-brand': '#fff',
    '--ring': p.ring,
    '--teal-300': p.t300,
    '--teal-400': p.t400,
    '--teal-500': p.t500,
    '--teal-600': p.t600,
    '--teal-700': p.t700,
    '--teal-800': p.t700,
    '--teal-900': p.t700,
    '--signal': p.signal,
    '--signal-300': p.signal4,
    '--signal-400': p.signal4,
    '--signal-500': p.signal,
    '--chart-1': p.t500,
    '--chart-2': p.signal4,
    '--chart-5': p.t300
  };
  Object.entries(set).forEach(([k, v]) => r.setProperty(k, v));
  try {
    localStorage.setItem('wt_accent', key);
  } catch (e) {}
};
// apply persisted accent immediately at load (before any screen renders)
try {
  const a = localStorage.getItem('wt_accent');
  if (a) window.applyAccent(a);
} catch (e) {}

/* ---- Modal: overlay + centered card with header/footer ---- */
function Modal({
  title,
  subtitle,
  icon,
  onClose,
  footer,
  width = 560,
  children
}) {
  _uE(() => {
    const k = e => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return /*#__PURE__*/React.createElement("div", {
    onMouseDown: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      background: 'rgba(13,20,19,0.5)',
      backdropFilter: 'blur(2px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    onMouseDown: e => e.stopPropagation(),
    style: {
      width,
      maxWidth: '100%',
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '18px 20px',
      borderBottom: '1px solid var(--divider)'
    }
  }, icon ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      flex: '0 0 38px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-subtle)',
      color: 'var(--brand)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 19
  })) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--text-lg)',
      fontWeight: 600,
      color: 'var(--text-primary)'
    }
  }, title), subtitle ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, subtitle) : null), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Fechar",
    style: {
      width: 30,
      height: 30,
      flex: '0 0 30px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-sm)',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      overflowY: 'auto'
    }
  }, children), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 10,
      padding: '14px 20px',
      borderTop: '1px solid var(--divider)',
      background: 'var(--bg-inset)'
    }
  }, footer) : null));
}

/* ---- Field: label + control wrapper ---- */
function Field({
  label,
  hint,
  children,
  required
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      marginBottom: 16
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-secondary)'
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--danger)'
    }
  }, " *") : null) : null, children, hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, hint) : null);
}

/* ---- TextField / TextArea / SelectField: native controls, brand-styled ---- */
const ctrlBase = {
  width: '100%',
  height: 'var(--control-md)',
  padding: '0 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-strong)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  outline: 'none',
  boxSizing: 'border-box'
};
function TextField({
  mono,
  ...p
}) {
  return /*#__PURE__*/React.createElement("input", _extends({}, p, {
    style: {
      ...ctrlBase,
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
      ...(p.style || {})
    },
    onFocus: e => {
      e.target.style.borderColor = 'var(--brand)';
      e.target.style.boxShadow = 'var(--shadow-focus)';
    },
    onBlur: e => {
      e.target.style.borderColor = 'var(--border-strong)';
      e.target.style.boxShadow = 'none';
    }
  }));
}
function TextArea({
  mono,
  rows = 3,
  ...p
}) {
  return /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows
  }, p, {
    style: {
      ...ctrlBase,
      height: 'auto',
      padding: '10px 12px',
      resize: 'vertical',
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
      fontSize: mono ? 'var(--text-sm)' : 'var(--text-base)',
      lineHeight: 1.5,
      ...(p.style || {})
    },
    onFocus: e => {
      e.target.style.borderColor = 'var(--brand)';
      e.target.style.boxShadow = 'var(--shadow-focus)';
    },
    onBlur: e => {
      e.target.style.borderColor = 'var(--border-strong)';
      e.target.style.boxShadow = 'none';
    }
  }));
}
function SelectField({
  children,
  ...p
}) {
  return /*#__PURE__*/React.createElement("select", _extends({}, p, {
    style: {
      ...ctrlBase,
      cursor: 'pointer',
      appearance: 'none',
      paddingRight: 30,
      backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' fill=\'none\' stroke=\'%236B7775\' stroke-width=\'2\'><path d=\'M2 4l4 4 4-4\'/></svg>")',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 11px center',
      ...(p.style || {})
    }
  }), children);
}

/* ---- TabBar: underline tabs ---- */
function TabBar({
  tabs,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      borderBottom: '1px solid var(--divider)'
    }
  }, tabs.map(t => {
    const on = t.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: t.value,
      onClick: () => onChange(t.value),
      style: {
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        padding: '10px 12px',
        position: 'relative',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-sm)',
        fontWeight: on ? 600 : 500,
        color: on ? 'var(--text-brand)' : 'var(--text-secondary)',
        boxShadow: on ? 'inset 0 -2px 0 var(--brand)' : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7
      }
    }, t.icon ? /*#__PURE__*/React.createElement(Icon, {
      name: t.icon,
      size: 15
    }) : null, t.label);
  }));
}

/* ---- Switch toggle ---- */
function Switch({
  on,
  onChange,
  size = 22
}) {
  const w = size * 1.73;
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(!on),
    style: {
      width: w,
      height: size,
      flex: `0 0 ${w}px`,
      borderRadius: 999,
      border: 'none',
      cursor: 'pointer',
      background: on ? 'var(--brand)' : 'var(--gray-300)',
      position: 'relative',
      transition: 'background var(--dur-base) var(--ease-out)',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: on ? w - size + 3 : 3,
      width: size - 6,
      height: size - 6,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: 'var(--shadow-sm)',
      transition: 'left var(--dur-base) var(--ease-out)'
    }
  }));
}

/* ---- QR placeholder: deterministic module grid (not a real scannable code) ---- */
function QRCode({
  size = 200,
  seed = 'wpptrack',
  light = '#fff',
  dark = '#0D1413'
}) {
  const n = 25;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = h * 31 + seed.charCodeAt(i) >>> 0;
  const rand = i => {
    const x = Math.sin(h + i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const cell = size / n;
  const finder = (cx, cy) => [0, 1, 2, 3, 4, 5, 6].flatMap(y => [0, 1, 2, 3, 4, 5, 6].map(x => {
    const on = x === 0 || x === 6 || y === 0 || y === 6 || x >= 2 && x <= 4 && y >= 2 && y <= 4;
    return on ? /*#__PURE__*/React.createElement("rect", {
      key: `f${cx}${cy}${x}${y}`,
      x: (cx + x) * cell,
      y: (cy + y) * cell,
      width: cell,
      height: cell,
      fill: dark
    }) : null;
  }));
  const isFinder = (x, y) => x < 7 && y < 7 || x > n - 8 && y < 7 || x < 7 && y > n - 8;
  const cells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (isFinder(x, y)) continue;
    if (rand(y * n + x) > 0.52) cells.push(/*#__PURE__*/React.createElement("rect", {
      key: `c${x}${y}`,
      x: x * cell,
      y: y * cell,
      width: cell,
      height: cell,
      fill: dark
    }));
  }
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      display: 'block',
      borderRadius: 8
    }
  }, /*#__PURE__*/React.createElement("rect", {
    width: size,
    height: size,
    fill: light
  }), cells, finder(0, 0), finder(n - 7, 0), finder(0, n - 7));
}
Object.assign(window, {
  Modal,
  Field,
  TextField,
  TextArea,
  SelectField,
  TabBar,
  Switch,
  QRCode
});

/* ---- PeriodFilter: Hoje / Ontem / Personalizado (calendar popover) ---- */
function PeriodFilter({
  value,
  onChange
}) {
  const [open, setOpen] = _uS(false);
  const [view, setView] = _uS(new Date(2026, 5, 1)); // June 2026
  const ref = _uR(null);
  _uE(() => {
    const h = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const presets = [{
    id: 'hoje',
    label: 'Hoje'
  }, {
    id: 'ontem',
    label: 'Ontem'
  }, {
    id: '7d',
    label: 'Últimos 7 dias'
  }, {
    id: 'mes',
    label: 'Este mês'
  }];
  const cur = presets.find(p => p.id === value);
  const label = cur ? cur.label : value && value.label || 'Personalizado';
  const y = view.getFullYear(),
    m = view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const monthName = view.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(o => !o),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: 'var(--control-sm)',
      padding: '0 12px',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      color: 'var(--text-secondary)',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-sm)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar",
    size: 14,
    color: "var(--text-muted)"
  }), label, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-down",
    size: 13,
    color: "var(--text-muted)"
  })), open ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      right: 0,
      zIndex: 30,
      width: 300,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      padding: 10,
      flexWrap: 'wrap',
      borderBottom: '1px solid var(--divider)'
    }
  }, presets.map(p => {
    const on = value === p.id;
    return /*#__PURE__*/React.createElement("button", {
      key: p.id,
      onClick: () => {
        onChange(p.id);
        setOpen(false);
      },
      style: {
        border: 'none',
        cursor: 'pointer',
        padding: '5px 10px',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        color: on ? 'var(--on-brand)' : 'var(--text-secondary)',
        background: on ? 'var(--brand)' : 'var(--bg-subtle)'
      }
    }, p.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setView(new Date(y, m - 1, 1)),
    style: navBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-left",
    size: 15
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      textTransform: 'capitalize'
    }
  }, monthName), /*#__PURE__*/React.createElement("button", {
    onClick: () => setView(new Date(y, m + 1, 1)),
    style: navBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 15
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7,1fr)',
      gap: 2,
      textAlign: 'center'
    }
  }, ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      color: 'var(--text-muted)',
      padding: '4px 0'
    }
  }, d)), Array.from({
    length: first
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: 'e' + i
  })), Array.from({
    length: days
  }).map((_, i) => {
    const d = i + 1;
    const sel = d === 14;
    return /*#__PURE__*/React.createElement("button", {
      key: d,
      onClick: () => {
        onChange({
          label: `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}`
        });
        setOpen(false);
      },
      style: {
        border: 'none',
        cursor: 'pointer',
        padding: '6px 0',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-xs)',
        color: sel ? 'var(--on-brand)' : 'var(--text-primary)',
        background: sel ? 'var(--brand)' : 'transparent'
      }
    }, d);
  })))) : null);
}
const navBtn = {
  width: 26,
  height: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-surface)',
  cursor: 'pointer',
  color: 'var(--text-secondary)'
};
Object.assign(window, {
  PeriodFilter
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/shared.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Tag = __ds_scope.Tag;

})();
