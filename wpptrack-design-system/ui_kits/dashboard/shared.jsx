/* WppTrack dashboard — shared UI helpers (Icon + lightweight inline-SVG charts).
   Exposes window.WTUI = { Icon, Donut, LineChart, BarMini, Spark }. */
const { useState: _uS, useEffect: _uE, useRef: _uR } = React;

function Icon({ name, size = 18, color = 'currentColor', stroke = 2, style }) {
  const [svg, setSvg] = _uS('');
  _uE(() => {
    let on = true;
    fetch(`https://unpkg.com/lucide-static@latest/icons/${name}.svg`)
      .then((r) => (r.ok ? r.text() : '')).then((t) => on && setSvg(t)).catch(() => {});
    return () => { on = false; };
  }, [name]);
  if (!svg) return <span style={{ display: 'inline-block', width: size, height: size, ...style }} />;
  return <span aria-hidden style={{ display: 'inline-flex', width: size, height: size, color, ...style }}
    dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${size}" height="${size}" stroke-width="${stroke}"`) }} />;
}

/* Donut — segments: [{value, color}] */
function Donut({ segments, size = 116, thickness = 16, children }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-inset)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
              strokeWidth={thickness} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
              strokeLinecap="butt" />
          );
          offset += len;
          return el;
        })}
      </svg>
      {children ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
      ) : null}
    </div>
  );
}

/* LineChart — multiple series over the same x. series: [{points:[n], color, fill}] */
function LineChart({ series, width = 560, height = 200, pad = 10, max }) {
  const n = series[0].points.length;
  const hi = max || Math.max(...series.flatMap((s) => s.points)) * 1.1;
  const x = (i) => pad + (i / (n - 1)) * (width - pad * 2);
  const y = (v) => height - pad - (v / hi) * (height - pad * 2);
  const path = (pts) => pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = (pts) => `${path(pts)} L${x(n - 1).toFixed(1)} ${height - pad} L${x(0).toFixed(1)} ${height - pad} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={width - pad} y1={pad + g * (height - pad * 2)} y2={pad + g * (height - pad * 2)} stroke="var(--divider)" strokeWidth="1" />
      ))}
      {series.map((s, i) => (
        <g key={i}>
          {s.fill ? <path d={area(s.points)} fill={s.fill} opacity="0.5" /> : null}
          <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

/* BarMini — vertical bars. data: [n]; colorFn(i)->color */
function BarMini({ data, height = 120, colorFn, gap = 5 }) {
  const hi = Math.max(...data) * 1.05 || 1;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap, height }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, height: `${(v / hi) * 100}%`, minHeight: 3, borderRadius: '4px 4px 0 0', background: colorFn ? colorFn(i) : 'var(--brand)' }} />
      ))}
    </div>
  );
}

/* Spark — tiny inline sparkline */
function Spark({ points, color = 'var(--brand)', width = 92, height = 30 }) {
  const hi = Math.max(...points), lo = Math.min(...points), rng = hi - lo || 1;
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${(i / (points.length - 1)) * width} ${height - ((v - lo) / rng) * height}`).join(' ');
  return <svg width={width} height={height} style={{ display: 'block' }}><path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

Object.assign(window, { Icon, Donut, LineChart, BarMini, Spark });
window.WTUI = { Icon, Donut, LineChart, BarMini, Spark };

/* ---- White-label accent: global palette + persistent apply (charts included) ---- */
window.WT_PALETTES = {
  teal:   { name: 'Teal', swatch: '#0E8C7A', t300: '#59B9A7', t400: '#259E89', t500: '#0E8C7A', t600: '#0B7567', t700: '#0A5E53', subtle: '#E6F4F1', border: '#93D2C6', signal: '#12B884', signal4: '#20CF98', ring: 'rgba(14,140,122,0.45)' },
  orange: { name: 'Laranja', swatch: '#EA580C', t300: '#FDBA74', t400: '#FB923C', t500: '#EA580C', t600: '#C2410C', t700: '#9A3412', subtle: '#FDEEE3', border: '#F8C9A6', signal: '#F59E0B', signal4: '#FBBF24', ring: 'rgba(234,88,12,0.4)' },
  blue:   { name: 'Azul', swatch: '#2563EB', t300: '#93C5FD', t400: '#60A5FA', t500: '#2563EB', t600: '#1D4ED8', t700: '#1E40AF', subtle: '#E6EEFD', border: '#AFC8F7', signal: '#0EA5E9', signal4: '#38BDF8', ring: 'rgba(37,99,235,0.4)' },
  violet: { name: 'Violeta', swatch: '#7C3AED', t300: '#C4B5FD', t400: '#A78BFA', t500: '#7C3AED', t600: '#6D28D9', t700: '#5B21B6', subtle: '#F0E9FD', border: '#CDB8F6', signal: '#A855F7', signal4: '#C084FC', ring: 'rgba(124,58,237,0.4)' },
  green:  { name: 'Verde', swatch: '#16A34A', t300: '#86EFAC', t400: '#4ADE80', t500: '#16A34A', t600: '#15803D', t700: '#166534', subtle: '#E5F6EB', border: '#A6E0BB', signal: '#22C55E', signal4: '#4ADE80', ring: 'rgba(22,163,74,0.4)' },
  rose:   { name: 'Rosa', swatch: '#E11D63', t300: '#FDA4C4', t400: '#F472A6', t500: '#E11D63', t600: '#BE185D', t700: '#9D174D', subtle: '#FCE7F0', border: '#F6B6CF', signal: '#FB7185', signal4: '#FB91A1', ring: 'rgba(225,29,99,0.4)' },
};
window.applyAccent = function (key) {
  const p = window.WT_PALETTES[key]; if (!p) return;
  const r = document.documentElement.style;
  const set = {
    '--brand': p.t500, '--brand-hover': p.t600, '--brand-active': p.t700, '--brand-subtle': p.subtle,
    '--brand-border': p.border, '--text-brand': p.t600, '--on-brand': '#fff', '--ring': p.ring,
    '--teal-300': p.t300, '--teal-400': p.t400, '--teal-500': p.t500, '--teal-600': p.t600,
    '--teal-700': p.t700, '--teal-800': p.t700, '--teal-900': p.t700,
    '--signal': p.signal, '--signal-300': p.signal4, '--signal-400': p.signal4, '--signal-500': p.signal,
    '--chart-1': p.t500, '--chart-2': p.signal4, '--chart-5': p.t300,
  };
  Object.entries(set).forEach(([k, v]) => r.setProperty(k, v));
  try { localStorage.setItem('wt_accent', key); } catch (e) {}
};
// apply persisted accent immediately at load (before any screen renders)
try { const a = localStorage.getItem('wt_accent'); if (a) window.applyAccent(a); } catch (e) {}

/* ---- Modal: overlay + centered card with header/footer ---- */
function Modal({ title, subtitle, icon, onClose, footer, width = 560, children }) {
  _uE(() => {
    const k = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(13,20,19,0.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width, maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--divider)' }}>
          {icon ? <div style={{ width: 38, height: 38, flex: '0 0 38px', borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={19} /></div> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div> : null}
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ width: 30, height: 30, flex: '0 0 30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
        {footer ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--divider)', background: 'var(--bg-inset)' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---- Field: label + control wrapper ---- */
function Field({ label, hint, children, required }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
      {label ? <label style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}{required ? <span style={{ color: 'var(--danger)' }}> *</span> : null}</label> : null}
      {children}
      {hint ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{hint}</span> : null}
    </div>
  );
}

/* ---- TextField / TextArea / SelectField: native controls, brand-styled ---- */
const ctrlBase = {
  width: '100%', height: 'var(--control-md)', padding: '0 12px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-strong)', background: 'var(--bg-surface)', color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', outline: 'none', boxSizing: 'border-box',
};
function TextField({ mono, ...p }) {
  return <input {...p} style={{ ...ctrlBase, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)', ...(p.style || {}) }}
    onFocus={(e) => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = 'var(--shadow-focus)'; }}
    onBlur={(e) => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none'; }} />;
}
function TextArea({ mono, rows = 3, ...p }) {
  return <textarea rows={rows} {...p} style={{ ...ctrlBase, height: 'auto', padding: '10px 12px', resize: 'vertical', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)', fontSize: mono ? 'var(--text-sm)' : 'var(--text-base)', lineHeight: 1.5, ...(p.style || {}) }}
    onFocus={(e) => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = 'var(--shadow-focus)'; }}
    onBlur={(e) => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none'; }} />;
}
function SelectField({ children, ...p }) {
  return <select {...p} style={{ ...ctrlBase, cursor: 'pointer', appearance: 'none', paddingRight: 30, backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' fill=\'none\' stroke=\'%236B7775\' stroke-width=\'2\'><path d=\'M2 4l4 4 4-4\'/></svg>")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 11px center', ...(p.style || {}) }}>{children}</select>;
}

/* ---- TabBar: underline tabs ---- */
function TabBar({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--divider)' }}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button key={t.value} onClick={() => onChange(t.value)} style={{
            border: 'none', background: 'none', cursor: 'pointer', padding: '10px 12px', position: 'relative',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: on ? 600 : 500,
            color: on ? 'var(--text-brand)' : 'var(--text-secondary)',
            boxShadow: on ? 'inset 0 -2px 0 var(--brand)' : 'none', display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>{t.icon ? <Icon name={t.icon} size={15} /> : null}{t.label}</button>
        );
      })}
    </div>
  );
}

/* ---- Switch toggle ---- */
function Switch({ on, onChange, size = 22 }) {
  const w = size * 1.73;
  return (
    <button onClick={() => onChange(!on)} style={{ width: w, height: size, flex: `0 0 ${w}px`, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'var(--brand)' : 'var(--gray-300)', position: 'relative', transition: 'background var(--dur-base) var(--ease-out)', padding: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? w - size + 3 : 3, width: size - 6, height: size - 6, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)', transition: 'left var(--dur-base) var(--ease-out)' }} />
    </button>
  );
}

/* ---- QR placeholder: deterministic module grid (not a real scannable code) ---- */
function QRCode({ size = 200, seed = 'wpptrack', light = '#fff', dark = '#0D1413' }) {
  const n = 25;
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = (i) => { const x = Math.sin(h + i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const cell = size / n;
  const finder = (cx, cy) => [0, 1, 2, 3, 4, 5, 6].flatMap((y) => [0, 1, 2, 3, 4, 5, 6].map((x) => {
    const on = x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
    return on ? <rect key={`f${cx}${cy}${x}${y}`} x={(cx + x) * cell} y={(cy + y) * cell} width={cell} height={cell} fill={dark} /> : null;
  }));
  const isFinder = (x, y) => (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
  const cells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (isFinder(x, y)) continue;
    if (rand(y * n + x) > 0.52) cells.push(<rect key={`c${x}${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={dark} />);
  }
  return (
    <svg width={size} height={size} style={{ display: 'block', borderRadius: 8 }}>
      <rect width={size} height={size} fill={light} />
      {cells}{finder(0, 0)}{finder(n - 7, 0)}{finder(0, n - 7)}
    </svg>
  );
}

Object.assign(window, { Modal, Field, TextField, TextArea, SelectField, TabBar, Switch, QRCode });

/* ---- PeriodFilter: Hoje / Ontem / Personalizado (calendar popover) ---- */
function PeriodFilter({ value, onChange }) {
  const [open, setOpen] = _uS(false);
  const [view, setView] = _uS(new Date(2026, 5, 1)); // June 2026
  const ref = _uR(null);
  _uE(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const presets = [
    { id: 'hoje', label: 'Hoje' }, { id: 'ontem', label: 'Ontem' },
    { id: '7d', label: 'Últimos 7 dias' }, { id: 'mes', label: 'Este mês' },
  ];
  const cur = presets.find((p) => p.id === value);
  const label = cur ? cur.label : (value && value.label) || 'Personalizado';

  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const monthName = view.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 'var(--control-sm)', padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
        <Icon name="calendar" size={14} color="var(--text-muted)" />{label}<Icon name="chevron-down" size={13} color="var(--text-muted)" />
      </button>
      {open ? (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, width: 300, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--divider)' }}>
            {presets.map((p) => {
              const on = value === p.id;
              return <button key={p.id} onClick={() => { onChange(p.id); setOpen(false); }} style={{ border: 'none', cursor: 'pointer', padding: '5px 10px', borderRadius: 'var(--radius-pill)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: on ? 'var(--on-brand)' : 'var(--text-secondary)', background: on ? 'var(--brand)' : 'var(--bg-subtle)' }}>{p.label}</button>;
            })}
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <button onClick={() => setView(new Date(y, m - 1, 1))} style={navBtn}><Icon name="chevron-left" size={15} /></button>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{monthName}</span>
              <button onClick={() => setView(new Date(y, m + 1, 1))} style={navBtn}><Icon name="chevron-right" size={15} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, textAlign: 'center' }}>
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>)}
              {Array.from({ length: first }).map((_, i) => <div key={'e' + i} />)}
              {Array.from({ length: days }).map((_, i) => {
                const d = i + 1; const sel = d === 14;
                return <button key={d} onClick={() => { onChange({ label: `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}` }); setOpen(false); }} style={{ border: 'none', cursor: 'pointer', padding: '6px 0', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: sel ? 'var(--on-brand)' : 'var(--text-primary)', background: sel ? 'var(--brand)' : 'transparent' }}>{d}</button>;
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
const navBtn = { width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-secondary)' };

Object.assign(window, { PeriodFilter });
