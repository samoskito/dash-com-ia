/* WppTrack — Integrações: Meta Pixel connections across clients. */
function Integracoes({ theme, onNav, onToggleTheme, openModal }) {
  const { Icon, ClientAvatar, AppShell, MiniStat } = window;
  const { Button, Card, Badge } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const pixels = WT.CLIENTS.flatMap((c) => c.pixels.map((p) => ({ ...p, client: c })));
  const tone = { ok: 'success', warn: 'warning', err: 'danger' };
  const txt = { ok: 'Conectado', warn: 'Sincronizando', err: 'Erro' };

  const actions = (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button variant="secondary" size="sm" iconLeft="message-circle" onClick={() => openModal({ type: 'whatsapp' })}>Conectar WhatsApp</Button>
      <Button variant="primary" size="sm" iconLeft="plus" onClick={() => openModal({ type: 'pixel' })}>Conectar pixel</Button>
    </div>
  );

  return (
    <AppShell active="integracoes" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme}
      title="Integrações" actions={actions}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        <window.MiniStat icon="plug" label="Pixels conectados" value={WT.TOTALS.pixels} />
        <window.MiniStat icon="send" label="Eventos enviados hoje" value="1.284" />
        <window.MiniStat icon="check-circle" label="Saúde da integração" value="98%" />
      </div>

      <Card padding="none">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Pixels da Meta</div>
        <div>
          {pixels.map((p, i) => (
            <div key={p.id + i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i < pixels.length - 1 ? '1px solid var(--divider)' : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="activity" size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>ID {p.id}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClientAvatar client={p.client} size={24} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', width: 130 }}>{p.client.name}</span>
              </div>
              <Badge tone={tone[p.status]} dot>{txt[p.status]}</Badge>
              <Button variant="ghost" size="sm" iconLeft="settings">Gerenciar</Button>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}

/* Router — owns navigation + theme + modals, renders the active screen. */
function App() {
  const { useState, useEffect } = React;
  const [theme, setTheme] = useState('light');
  const [route, setRoute] = useState({ screen: 'overview' });
  const [modal, setModal] = useState(null);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { window.scrollTo(0, 0); }, [route]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const nav = (screen, clientId) => setRoute(clientId ? { screen, clientId } : { screen });
  const openClient = (clientId) => setRoute({ screen: 'clienteDetalhe', clientId });
  const openLead = (leadId) => setRoute({ screen: 'leadDetalhe', leadId, clientId: route.clientId });
  const openModal = (m) => setModal(m);
  const closeModal = () => setModal(null);
  const common = { theme, onNav: nav, onToggleTheme: toggle, openModal };

  let screen;
  switch (route.screen) {
    case 'overview':       screen = <window.Overview {...common} onOpenClient={openClient} />; break;
    case 'clientes':       screen = <window.Clientes {...common} onOpenClient={openClient} onNovoCliente={() => openModal({ type: 'cliente' })} />; break;
    case 'clienteDetalhe': screen = <window.ClienteDetalhe {...common} clientId={route.clientId} onOpenLead={openLead} onBack={() => nav('clientes')} />; break;
    case 'clienteConfig':  screen = <window.ClienteConfig {...common} clientId={route.clientId} onBack={() => openClient(route.clientId)} />; break;
    case 'leadDetalhe':    screen = <window.LeadDetalhe {...common} leadId={route.leadId} onBack={() => route.clientId ? openClient(route.clientId) : nav('clientes')} />; break;
    case 'leads':          screen = <window.Clientes {...common} onOpenClient={openClient} onNovoCliente={() => openModal({ type: 'cliente' })} />; break;
    case 'relatorios':     screen = <window.Relatorios {...common} onOpenReport={(id) => setRoute({ screen: 'relatorioCliente', clientId: id || (window.WT.CLIENTS[0].id) })} />; break;
    case 'relatorioCliente': screen = <window.RelatorioCliente {...common} clientId={route.clientId} onBack={() => nav('relatorios')} />; break;
    case 'integracoes':    screen = <window.Integracoes {...common} />; break;
    case 'configuracoes':  screen = <window.Configuracoes {...common} />; break;
    case 'sistema':        screen = <window.Sistema {...common} />; break;
    default:               screen = <window.Overview {...common} onOpenClient={openClient} />;
  }

  return (
    <>
      {screen}
      {modal && modal.type === 'pixel' ? <window.ConectarPixelModal onClose={closeModal} /> : null}
      {modal && modal.type === 'whatsapp' ? <window.ConectarWhatsAppModal client={modal.client} onClose={closeModal} /> : null}
      {modal && modal.type === 'cliente' ? <window.NovoClienteModal onClose={closeModal} /> : null}
      {modal && modal.type === 'provedor' ? <window.ProvedorConfigModal providerId={modal.providerId} onClose={closeModal} /> : null}
      {modal && modal.type === 'bm' ? <window.ConectarBMModal onClose={closeModal} /> : null}
    </>
  );
}

Object.assign(window, { Integracoes, WppApp: App });
