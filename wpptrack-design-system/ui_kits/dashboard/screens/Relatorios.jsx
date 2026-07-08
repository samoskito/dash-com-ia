/* WppTrack — Relatorios: BI view (trend, ROAS, media investment) + per-client report generation/export. */
function Relatorios({ theme, onNav, onToggleTheme, onOpenReport }) {
  const { useState } = React;
  const { Icon, LineChart, BarMini, Donut, ClientAvatar, AppShell, Segmented } = window;
  const { Button, Card, Badge } = window.WppTrackDesignSystem_851504;
  const WT = window.WT, fmt = WT.fmt, T = WT.TOTALS;

  const [clientId, setClientId] = useState('todos');
  const [range, setRange] = useState('14d');

  const scope = clientId === 'todos' ? null : WT.CLIENTS.find((c) => c.id === clientId);
  const scale = scope ? scope.conversas / T.conversas : 1;
  const invest = scope ? scope.investimento : T.investimento;
  const receita = scope ? scope.receita : T.receita;
  const roas = scope ? scope.roas : T.roas;
  const cpl = scope ? scope.cpl : T.cpl;
  const conversoes = scope ? scope.conversoes : T.conversoes;

  const trendConversas = WT.TREND.map((d) => Math.round(d.conversas * (scope ? scale * 6 : 1)));
  const trendInvest = WT.TREND.map((d) => Math.round(d.investimento * (scope ? scale * 6 : 1)));

  const actions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={window.selStyle}>
        <option value="todos">Toda a operação</option>
        {WT.CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Segmented value={range} onChange={setRange} options={[{ value: '7d', label: '7d' }, { value: '14d', label: '14d' }, { value: '30d', label: '30d' }]} />
      <Button variant="secondary" size="sm" iconLeft="download">Exportar PDF</Button>
      <Button variant="primary" size="sm" iconLeft="share-2" onClick={() => onOpenReport && onOpenReport(scope ? scope.id : null)}>Gerar p/ cliente</Button>
    </div>
  );

  return (
    <AppShell active="relatorios" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme}
      title="Relatórios" actions={actions}>

      {/* report header band */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 20px', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(120deg, var(--teal-700), var(--teal-900))', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {scope ? <ClientAvatar client={scope} size={40} /> : (
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="building-2" size={20} color="#fff" /></div>
          )}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>Relatório de performance</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{scope ? scope.name : 'Toda a operação'}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.75)' }}>12/06 — 25/06 · 2026 · gerado por Agência Norte</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          <BandStat label="ROAS" value={roas + 'x'} />
          <BandStat label="Investimento" value={fmt.BRL(invest)} />
          <BandStat label="Receita atribuída" value={fmt.BRL(receita)} />
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        <BIStat icon="trending-up" label="ROAS" value={roas + 'x'} delta="+0.4x" up />
        <BIStat icon="dollar-sign" label="Custo por conversa" value={fmt.BRL(cpl)} delta="−6%" up />
        <BIStat icon="send" label="Conversões enviadas" value={fmt.NUM(conversoes)} delta="+9%" up />
        <BIStat icon="badge-percent" label="Receita / investimento" value={fmt.BRL(receita - invest)} delta="+12%" up />
      </div>

      {/* trend + invest */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <Card eyebrow="Conversas iniciadas" title="Tendência do período"
          action={<window.Legend items={[{ c: 'var(--teal-500)', t: 'Conversas' }]} />}>
          <div style={{ marginTop: 8 }}>
            <LineChart height={210} series={[{ points: trendConversas, color: 'var(--teal-500)', fill: 'var(--brand-subtle)' }]} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              {WT.TREND.filter((_, i) => i % 3 === 0).map((d) => (
                <span key={d.day} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{d.label}</span>
              ))}
            </div>
          </div>
        </Card>
        <Card eyebrow="Mídia · Meta Ads" title="Investimento diário">
          <div style={{ marginTop: 10 }}>
            <BarMini data={trendInvest} height={150} colorFn={(i) => i === trendInvest.length - 1 ? 'var(--signal)' : 'var(--teal-400)'} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Total investido</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt.BRL(invest)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* per-client comparison (only on whole-operation scope) */}
      {!scope ? (
        <Card eyebrow="Comparativo" title="Ranking por ROAS"
          action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => onNav('clientes')}>Ver clientes</Button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
            {[...WT.CLIENTS].sort((a, b) => b.roas - a.roas).map((c) => {
              const maxRoas = Math.max(...WT.CLIENTS.map((x) => x.roas));
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 150, display: 'flex', alignItems: 'center', gap: 9, flex: '0 0 150px' }}>
                    <ClientAvatar client={c} size={26} />
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  </div>
                  <div style={{ flex: 1, height: 10, borderRadius: 999, background: 'var(--bg-inset)', overflow: 'hidden' }}>
                    <div style={{ width: `${(c.roas / maxRoas) * 100}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,var(--teal-400),var(--teal-600))' }} />
                  </div>
                  <span style={{ width: 48, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>{c.roas}x</span>
                  <span style={{ width: 92, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{fmt.BRL(c.investimento)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </AppShell>
  );
}

function BandStat({ label, value }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function BIStat({ icon, label, value, delta, up }) {
  const { Icon } = window;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
        <Icon name={icon} size={16} color="var(--text-muted)" />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--text-primary)', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600, color: up ? 'var(--success)' : 'var(--danger)' }}>
        {up ? '▴' : '▾'} {delta}
      </div>
    </div>
  );
}

Object.assign(window, { Relatorios, BandStat, BIStat });
