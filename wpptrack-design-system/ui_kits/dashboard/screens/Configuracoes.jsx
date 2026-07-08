/* WppTrack — Configurações (agency): BMs → contas → pixels, WhatsApp providers, AI providers. */
function Configuracoes({ theme, onNav, onToggleTheme, openModal }) {
  const { useState } = React;
  const { Icon, AppShell, TabBar, Switch, ClientAvatar } = window;
  const { Button, Card, Badge } = window.WppTrackDesignSystem_851504;
  const WT = window.WT, fmt = WT.fmt;
  const [tab, setTab] = useState('bms');

  return (
    <AppShell active="configuracoes" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme} title="Configurações">
      <TabBar value={tab} onChange={setTab} tabs={[
        { value: 'bms', label: 'Business Managers', icon: 'building-2' },
        { value: 'whatsapp', label: 'WhatsApp', icon: 'message-circle' },
        { value: 'ia', label: 'Inteligência artificial', icon: 'sparkles' },
      ]} />

      {tab === 'bms' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: 560 }}>Conecte uma ou mais Business Managers via API de Marketing. Cada BM agrupa contas de anúncio e seus pixels.</div>
            <Button variant="primary" size="sm" iconLeft="plus" onClick={() => openModal({ type: 'bm' })}>Conectar BM</Button>
          </div>
          {WT.BMS.map((bm) => (
            <Card key={bm.id} padding="none">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="building-2" size={19} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>{bm.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>BM {bm.metaId} · {bm.app}</div>
                </div>
                <Badge tone="success" dot>Conectada</Badge>
                <Button variant="ghost" size="sm" iconLeft="settings">Gerenciar</Button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Conta de anúncio', 'Cliente', 'Pixels', 'Investimento 30d', ''].map((h, i) => (
                    <th key={h + i} style={{ ...window.thStyle, textAlign: i === 0 ? 'left' : i === 4 ? 'right' : 'right' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {bm.accounts.map((a, i) => {
                    const cli = WT.CLIENTS.find((c) => c.id === a.client);
                    return (
                      <tr key={a.id} style={{ borderBottom: i < bm.accounts.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                        <td style={{ padding: '11px 18px' }}>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{a.id}</div>
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                          {cli ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ClientAvatar client={cli} size={22} /><span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{cli.name}</span></span> : '—'}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {a.pixels.map((p) => <span key={p} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-inset)', color: 'var(--text-secondary)' }}>{p}</span>)}
                          </span>
                        </td>
                        <td style={{ ...window.tdNum, color: 'var(--text-secondary)', fontWeight: 500 }}>{fmt.BRL(a.spend30d)}</td>
                        <td style={{ padding: '11px 18px', textAlign: 'right' }}><Button variant="ghost" size="sm" iconLeft="activity" onClick={() => openModal({ type: 'pixel' })}>Pixel</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'whatsapp' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: 600 }}>Escolha as modalidades de provedor que sua agência oferece. Cada cliente conecta o WhatsApp usando um destes provedores.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {WT.WA_PROVIDERS.map((p) => (
              <Card key={p.id}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: p.status === 'connected' ? 'var(--brand)' : 'var(--bg-subtle)', color: p.status === 'connected' ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 44px' }}><Icon name={p.icon} size={22} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <Badge tone={p.id === 'evolution' ? 'brand' : p.id === 'node' ? 'signal' : 'info'}>{p.badge}</Badge>
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>{p.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--divider)' }}>
                  {p.status === 'connected' ? (
                    <><span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{p.fields === 'node' ? `${p.instances}/${p.instanceCap} instâncias usadas` : `${p.instances} instâncias ativas`}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {p.fields === 'node' ? <Button variant="ghost" size="sm" iconLeft="refresh-cw">Sincronizar</Button> : null}
                        <Button variant="secondary" size="sm" iconLeft="settings" onClick={() => openModal({ type: 'provedor', providerId: p.id })}>Configurar</Button>
                      </div></>
                  ) : (
                    <><Badge tone="neutral">Disponível</Badge><Button variant="primary" size="sm" iconLeft="plug" onClick={() => openModal({ type: 'provedor', providerId: p.id })}>Configurar provedor</Button></>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'ia' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: 600 }}>Conecte um provedor de IA para analisar conversas — intenção, qualidade e estágio do lead. A análise pode ser ativada por cliente.</div>
          <Card padding="none">
            {WT.AI_PROVIDERS.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px', borderBottom: i < WT.AI_PROVIDERS.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: p.status === 'connected' ? 'var(--signal-subtle)' : 'var(--bg-subtle)', color: p.status === 'connected' ? 'var(--signal-500)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 40px' }}><Icon name={p.icon} size={20} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{p.model}</div>
                </div>
                {p.status === 'connected'
                  ? <Badge tone="success" dot>API Key salva</Badge>
                  : <Badge tone="neutral">Não conectado</Badge>}
                <Button variant={p.status === 'connected' ? 'ghost' : 'secondary'} size="sm" iconLeft={p.status === 'connected' ? 'settings' : 'key-round'}>
                  {p.status === 'connected' ? 'Gerenciar' : 'Adicionar API Key'}
                </Button>
              </div>
            ))}
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}

Object.assign(window, { Configuracoes });
