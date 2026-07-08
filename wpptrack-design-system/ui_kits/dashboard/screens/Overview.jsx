/* WppTrack — Overview: agency-wide view across the whole operation. Filter by client + pixel. */
function Overview({ theme, onNav, onToggleTheme, onOpenClient }) {
  const { useState } = React;
  const { Icon, Donut, LineChart, ClientAvatar, AppShell, Segmented } = window;
  const { Button, StatCard, Card, Badge } = window.WppTrackDesignSystem_851504;
  const WT = window.WT, T = WT.TOTALS, fmt = WT.fmt;

  const [clientFilter, setClientFilter] = useState('todos');
  const [range, setRange] = useState('7d');

  const clients = clientFilter === 'todos' ? WT.CLIENTS : WT.CLIENTS.filter((c) => c.id === clientFilter);
  const t = clients.reduce((a, c) => ({
    conversas: a.conversas + c.conversas, rastreadas: a.rastreadas + c.rastreadas,
    naoRastreadas: a.naoRastreadas + c.naoRastreadas, conversoes: a.conversoes + c.conversoes,
    investimento: a.investimento + c.investimento, receita: a.receita + c.receita,
  }), { conversas: 0, rastreadas: 0, naoRastreadas: 0, conversoes: 0, investimento: 0, receita: 0 });
  const taxa = Math.round((t.rastreadas / t.conversas) * 100);

  const trendConversas = WT.TREND.map((d) => d.conversas);
  const trendRastreadas = WT.TREND.map((d) => d.rastreadas);

  const filters = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={selStyle}>
        <option value="todos">Todos os clientes</option>
        {WT.CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Segmented options={[{ value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: '90d', label: '90d' }]} value={range} onChange={setRange} />
      <Button variant="secondary" size="sm" iconLeft="download">Exportar</Button>
    </div>
  );

  return (
    <AppShell active="overview" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme}
      title="Visão geral" actions={filters}>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard label="Conversas iniciadas" value={fmt.NUM(t.conversas)} delta="+14%" hint="vs. período" icon={<Icon name="message-circle" size={16} />} />
        <StatCard label="Rastreadas" value={fmt.NUM(t.rastreadas)} delta={`${taxa}%`} deltaDir="up" hint="da origem" icon={<Icon name="git-branch" size={16} />} />
        <StatCard label="Não rastreadas" value={fmt.NUM(t.naoRastreadas)} delta={`${100 - taxa}%`} deltaDir="down" hint="sem origem" icon={<Icon name="help-circle" size={16} />} />
        <StatCard label="Conversões enviadas" value={fmt.NUM(t.conversoes)} delta="+9%" accent icon={<Icon name="send" size={16} color="#fff" />} />
      </div>

      {/* Trend + rastreio donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 }}>
        <Card eyebrow="Conversas · 14 dias" title="Volume rastreado"
          action={<Legend items={[{ c: 'var(--teal-500)', t: 'Iniciadas' }, { c: 'var(--signal)', t: 'Rastreadas' }]} />}>
          <div style={{ marginTop: 8 }}>
            <LineChart height={210}
              series={[
                { points: trendConversas, color: 'var(--teal-500)', fill: 'var(--brand-subtle)' },
                { points: trendRastreadas, color: 'var(--signal)' },
              ]} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              {WT.TREND.filter((_, i) => i % 3 === 0).map((d) => (
                <span key={d.day} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{d.label}</span>
              ))}
            </div>
          </div>
        </Card>

        <Card eyebrow="Qualidade do rastreio" title="Origem dos leads">
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 6 }}>
            <Donut size={120} thickness={17}
              segments={[{ value: t.rastreadas, color: 'var(--teal-500)' }, { value: t.naoRastreadas, color: 'var(--bg-inset)' }]}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{taxa}%</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>rastreado</span>
            </Donut>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              <LegendRow color="var(--teal-500)" label="Rastreadas" value={fmt.NUM(t.rastreadas)} />
              <LegendRow color="var(--gray-300)" label="Não rastreadas" value={fmt.NUM(t.naoRastreadas)} />
              <div style={{ height: 1, background: 'var(--divider)' }} />
              <LegendRow color="var(--signal)" label="Conversões" value={fmt.NUM(t.conversoes)} />
            </div>
          </div>
        </Card>
      </div>

      {/* Clients table */}
      <Card padding="none">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-brand)' }}>Operação · {clients.length} clientes</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Desempenho por cliente</div>
          </div>
          <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => onNav('clientes')}>Ver clientes</Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Cliente', 'Conversas', 'Rastreadas', 'Não rastr.', 'Taxa', 'Conversões', ''].map((h, i) => (
                  <th key={h + i} style={{ ...thStyle, textAlign: i === 0 ? 'left' : i === 6 ? 'right' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={c.id} onClick={() => onOpenClient(c.id)} style={{ borderBottom: i < clients.length - 1 ? '1px solid var(--divider)' : 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ClientAvatar client={c} size={30} />
                      <div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{c.segment}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdNum}>{fmt.NUM(c.conversas)}</td>
                  <td style={tdNum}>{fmt.NUM(c.rastreadas)}</td>
                  <td style={{ ...tdNum, color: 'var(--text-muted)' }}>{fmt.NUM(c.naoRastreadas)}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                    <Badge tone={c.taxaRastreio >= 80 ? 'success' : c.taxaRastreio >= 70 ? 'warning' : 'danger'}>{c.taxaRastreio}%</Badge>
                  </td>
                  <td style={tdNum}>{fmt.NUM(c.conversoes)}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}><Icon name="chevron-right" size={16} color="var(--text-muted)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

const selStyle = {
  height: 'var(--control-sm)', padding: '0 28px 0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
  background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' fill=\'none\' stroke=\'%236B7775\' stroke-width=\'2\'><path d=\'M2 4l4 4 4-4\'/></svg>")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
};
const thStyle = { padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--divider)', whiteSpace: 'nowrap' };
const tdNum = { padding: '11px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' };

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: it.c }} />{it.t}
        </span>
      ))}
    </div>
  );
}
function LegendRow({ color, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: '0 0 auto' }} />
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

Object.assign(window, { Overview, Legend, LegendRow, selStyle, thStyle, tdNum });
