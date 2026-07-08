/* WppTrack — Clientes: list of all agency clients with totals + filter by pixel. */
function Clientes({ theme, onNav, onToggleTheme, onOpenClient, onNovoCliente, openModal }) {
  const { useState } = React;
  const { Icon, ClientAvatar, AppShell, Spark } = window;
  const { Button, Card, Badge, Input } = window.WppTrackDesignSystem_851504;
  const WT = window.WT, fmt = WT.fmt;

  const [pixelFilter, setPixelFilter] = useState('todos');
  const [q, setQ] = useState('');

  const allPixels = WT.CLIENTS.flatMap((c) => c.pixels.map((p) => ({ ...p, client: c.name })));
  let clients = WT.CLIENTS;
  if (pixelFilter !== 'todos') clients = clients.filter((c) => c.pixels.some((p) => p.id === pixelFilter));
  if (q.trim()) clients = clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  const actions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select value={pixelFilter} onChange={(e) => setPixelFilter(e.target.value)} style={window.selStyle}>
        <option value="todos">Todos os pixels</option>
        {allPixels.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
      </select>
      <Button variant="primary" size="sm" iconLeft="plus" onClick={onNovoCliente}>Novo cliente</Button>
    </div>
  );

  return (
    <AppShell active="clientes" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme}
      title="Clientes" actions={actions}>

      {/* summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        <MiniStat icon="users" label="Clientes ativos" value={WT.TOTALS.clientes} />
        <MiniStat icon="message-circle" label="Conversas (todas)" value={fmt.NUM(WT.TOTALS.conversas)} />
        <MiniStat icon="git-branch" label="Taxa média de rastreio" value={WT.TOTALS.taxaRastreio + '%'} />
        <MiniStat icon="plug" label="Pixels conectados" value={WT.TOTALS.pixels} />
      </div>

      <Card padding="none">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Todos os clientes</div>
          <div style={{ width: 240 }}>
            <Input size="sm" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} iconLeft={<Icon name="search" size={15} />} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Cliente', 'Pixels', 'Conversas', 'Rastreio', 'Conversões', 'Investimento', 'ROAS', 'Tendência', ''].map((h, i) => (
                  <th key={h + i} style={{ ...window.thStyle, textAlign: i === 0 ? 'left' : i === 7 || i === 8 ? 'center' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.id} onClick={() => onOpenClient(c.id)} style={{ borderBottom: i < clients.length - 1 ? '1px solid var(--divider)' : 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ClientAvatar client={c} size={34} />
                      <div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{c.segment}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      <Icon name="plug" size={13} color="var(--text-muted)" />{c.pixels.length}
                    </span>
                  </td>
                  <td style={window.tdNum}>{fmt.NUM(c.conversas)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <Badge tone={c.taxaRastreio >= 80 ? 'success' : c.taxaRastreio >= 70 ? 'warning' : 'danger'}>{c.taxaRastreio}%</Badge>
                  </td>
                  <td style={window.tdNum}>{fmt.NUM(c.conversoes)}</td>
                  <td style={{ ...window.tdNum, color: 'var(--text-secondary)', fontWeight: 500 }}>{fmt.BRL(c.investimento)}</td>
                  <td style={window.tdNum}>{c.roas}x</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <Spark points={WT.TREND.slice(-8).map((d) => d.conversas + (c.deltaConversas * d.day))} color={c.deltaConversas < 0 ? 'var(--danger)' : 'var(--signal)'} width={72} height={26} />
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}><Icon name="chevron-right" size={16} color="var(--text-muted)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

function MiniStat({ icon, label, value }) {
  const { Icon } = window;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ width: 38, height: 38, flex: '0 0 38px', borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} />
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

Object.assign(window, { Clientes, MiniStat });
