/* WppTrack — AppShell: sidebar (agency nav) + topbar. Wraps every screen. */
function AppShell({ active, onNav, theme, onToggleTheme, title, subtitle, breadcrumb, actions, children }) {
  const Icon = window.Icon;
  const NAV = [
    { id: 'overview', label: 'Visão geral', icon: 'layout-dashboard' },
    { id: 'clientes', label: 'Clientes', icon: 'users' },
    { id: 'leads', label: 'Leads', icon: 'message-circle' },
    { id: 'relatorios', label: 'Relatórios', icon: 'bar-chart-3' },
    { id: 'integracoes', label: 'Integrações', icon: 'plug' },
    { id: 'configuracoes', label: 'Configurações', icon: 'settings' },
  ];
  const logo = theme === 'dark' ? '../../assets/logo-horizontal-light.svg' : '../../assets/logo-horizontal.svg';
  const navActive = ['clienteDetalhe'].includes(active) ? 'clientes' : ['leadDetalhe'].includes(active) ? 'clientes' : active;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-app)' }}>
      <aside style={{
        width: 'var(--sidebar-w)', flex: '0 0 var(--sidebar-w)', borderRight: '1px solid var(--border)',
        background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ height: 'var(--topbar-h)', display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid var(--border)' }}>
          <img src={logo} alt="WppTrack" style={{ height: 22 }} />
        </div>
        <nav style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '10px 10px 6px' }}>Operação</div>
          {NAV.map((n) => {
            const on = navActive === n.id;
            return (
              <button key={n.id} onClick={() => onNav(n.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 'var(--radius-md)',
                border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)', fontWeight: on ? 'var(--fw-semibold)' : 'var(--fw-medium)',
                color: on ? 'var(--text-brand)' : 'var(--text-secondary)', background: on ? 'var(--brand-subtle)' : 'transparent',
              }}>
                <Icon name={n.icon} size={18} color={on ? 'var(--brand)' : 'var(--text-muted)'} />
                {n.label}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <button onClick={() => onNav('sistema')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', width: '100%', border: 'none', background: navActive === 'sistema' ? 'var(--brand-subtle)' : 'transparent', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,var(--teal-500),var(--teal-700))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, letterSpacing: '-0.5' }}>AN</div>
            <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Agência Norte</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>6 clientes · 9 pixels</div>
            </div>
            <Icon name="settings" size={15} color="var(--text-muted)" />
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          minHeight: 'var(--topbar-h)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          padding: '0 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
          position: 'sticky', top: 0, zIndex: 5,
        }}>
          <div style={{ minWidth: 0 }}>
            {breadcrumb ? <div style={{ marginBottom: 1 }}>{breadcrumb}</div> : null}
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, letterSpacing: 'var(--tracking-tight)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
            {actions}
            <button onClick={onToggleTheme} aria-label="Alternar tema" style={{ width: 'var(--control-sm)', height: 'var(--control-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
            </button>
          </div>
        </header>
        <main style={{ padding: 'var(--content-pad)', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</main>
      </div>
    </div>
  );
}

/* Small shared pieces used across screens */
function ClientAvatar({ client, size = 34 }) {
  const TINTS = { teal: '#0E8C7A', deep: '#0A5E53', blue: '#2F73E8', amber: '#C77D12', slate: '#46555F', violet: '#6B57C2' };
  return (
    <div style={{ width: size, height: size, flex: `0 0 ${size}px`, borderRadius: 'var(--radius-md)', background: TINTS[client.tint] || '#0E8C7A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: size * 0.36, letterSpacing: '-0.3' }}>
      {client.initials}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, gap: 2, background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            border: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: on ? 600 : 500,
            color: on ? 'var(--text-brand)' : 'var(--text-secondary)', background: on ? 'var(--bg-surface)' : 'transparent',
            boxShadow: on ? 'var(--shadow-xs)' : 'none',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

Object.assign(window, { AppShell, ClientAvatar, Segmented });
