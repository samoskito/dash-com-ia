/* WppTrack — ClienteDetalhe: per-client overview + leads list. Click a lead → LeadDetalhe. */
function ClienteDetalhe({ clientId, theme, onNav, onToggleTheme, onOpenLead, onBack }) {
  const { useState } = React;
  const { Icon, Donut, LineChart, ClientAvatar, AppShell, Segmented } = window;
  const { Button, StatCard, Card, Badge, Tag } = window.WppTrackDesignSystem_851504;
  const WT = window.WT, fmt = WT.fmt;
  const c = WT.CLIENTS.find((x) => x.id === clientId) || WT.CLIENTS[0];

  const [tab, setTab] = useState('todos');
  const [pixelFilter, setPixelFilter] = useState('todos');
  const [dateFilter, setDateFilter] = useState('hoje');
  const { PeriodFilter } = window;

  let leads = c.leads;
  if (tab === 'rastreados') leads = leads.filter((l) => l.tracked);
  if (tab === 'naoRastreados') leads = leads.filter((l) => !l.tracked);
  if (pixelFilter !== 'todos') leads = leads.filter((l) => l.pixel.id === pixelFilter);

  const breadcrumb = (
    <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.04em' }}>
      <Icon name="arrow-left" size={13} /> Clientes
    </button>
  );
  const actions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <PeriodFilter value={dateFilter} onChange={setDateFilter} />
      <Button variant="secondary" size="sm" iconLeft="settings" onClick={() => onNav('clienteConfig', c.id)}>Configurações</Button>
      <Button variant="primary" size="sm" iconLeft="file-bar-chart" onClick={() => onNav('relatorioCliente', c.id)}>Gerar relatório</Button>
    </div>
  );

  return (
    <AppShell active="clienteDetalhe" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme}
      breadcrumb={breadcrumb}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><ClientAvatar client={c} size={28} />{c.name}</span>}
      actions={actions}>

      {/* client meta strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Badge tone="neutral">{c.segment}</Badge>
        {c.pixels.map((p) => (
          <Tag key={p.id} prefix="pixel:">{p.id}</Tag>
        ))}
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 4 }}>{c.pixels.length} pixel(s) conectado(s)</span>
      </div>

      {/* KPIs — conversas iniciadas / rastreadas / não rastreadas / conversões */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard label="Conversas iniciadas" value={fmt.NUM(c.conversas)} delta={`+${c.deltaConversas}%`} deltaDir={c.deltaConversas < 0 ? 'down' : 'up'} hint="vs. 7d" icon={<Icon name="message-circle" size={16} />} />
        <StatCard label="Rastreadas" value={fmt.NUM(c.rastreadas)} delta={`${c.taxaRastreio}%`} deltaDir="up" hint="da origem" icon={<Icon name="git-branch" size={16} />} />
        <StatCard label="Não rastreadas" value={fmt.NUM(c.naoRastreadas)} delta={`${100 - c.taxaRastreio}%`} deltaDir="down" hint="sem origem" icon={<Icon name="help-circle" size={16} />} />
        <StatCard label="Conversões enviadas" value={fmt.NUM(c.conversoes)} delta="+9%" accent icon={<Icon name="send" size={16} color="#fff" />} />
      </div>

      {/* 2nd KPI row — financeiro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        <FinKpi icon="wallet" label="Investido total" value={fmt.BRL(c.investimento)} />
        <FinKpi icon="message-circle" label="Custo por conversa" value={fmt.BRL(c.cpl)} hint="Meta" />
        <FinKpi icon="user" label="Custo por lead" value={fmt.BRL(c.investimento / c.conversoes)} />
        <FinKpi icon="target" label="Custo por lead real" value={fmt.BRL(c.custoLeadReal)} hint="÷ rastreados" accent />
        <FinKpi icon="trending-up" label="ROAS de campanha" value={c.roasCampanha + 'x'} hint={`${fmt.NUM(c.vendas)} vendas`} />
      </div>

      {/* Vendas + eventos por etiqueta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16 }}>
        <Card eyebrow="Fechamento" title="Vendas no período">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt.NUM(c.vendas)}</span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>vendas</span>
          </div>
          <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <window.LegendRow color="var(--signal)" label="Faturamento estimado" value={fmt.BRL(c.faturamento)} />
            <window.LegendRow color="var(--gray-300)" label="Ticket médio (fixo)" value={fmt.BRL(c.config.etiquetas[0].value)} />
          </div>
        </Card>
        <Card eyebrow="Eventos enviados" title="Por etiqueta"
          action={<Button variant="ghost" size="sm" iconLeft="settings" onClick={() => onNav('clienteConfig', c.id)}>Configurar</Button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {c.config.etiquetas.filter((e) => e.event).map((e, i) => {
              const max = Math.max(...c.config.etiquetas.filter((x) => x.event).map((x) => x.count));
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 130, flex: '0 0 130px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: e.color, flex: '0 0 10px' }} />
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label}</span>
                  </span>
                  <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--bg-inset)', overflow: 'hidden' }}>
                    <div style={{ width: `${(e.count / max) * 100}%`, height: '100%', borderRadius: 999, background: e.color }} />
                  </div>
                  <span style={{ width: 56, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt.NUM(e.count)}</span>
                  <span style={{ width: 92, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{e.event}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 }}>
        <Card eyebrow="Conversas · 14 dias" title="Evolução"
          action={<window.Legend items={[{ c: 'var(--teal-500)', t: 'Iniciadas' }, { c: 'var(--signal)', t: 'Rastreadas' }]} />}>
          <div style={{ marginTop: 8 }}>
            <LineChart height={190}
              series={[
                { points: WT.TREND.map((d) => Math.round(d.conversas * (c.conversas / WT.TOTALS.conversas) * 6)), color: 'var(--teal-500)', fill: 'var(--brand-subtle)' },
                { points: WT.TREND.map((d) => Math.round(d.rastreadas * (c.conversas / WT.TOTALS.conversas) * 6)), color: 'var(--signal)' },
              ]} />
          </div>
        </Card>

        <Card eyebrow="Qualidade do rastreio" title="Origem">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6 }}>
            <Donut size={112} thickness={16}
              segments={[{ value: c.rastreadas, color: 'var(--teal-500)' }, { value: c.naoRastreadas, color: 'var(--bg-inset)' }]}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{c.taxaRastreio}%</span>
            </Donut>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1 }}>
              <window.LegendRow color="var(--teal-500)" label="Rastreadas" value={fmt.NUM(c.rastreadas)} />
              <window.LegendRow color="var(--gray-300)" label="Não rastreadas" value={fmt.NUM(c.naoRastreadas)} />
              <window.LegendRow color="var(--signal)" label="Conversões" value={fmt.NUM(c.conversoes)} />
            </div>
          </div>
        </Card>
      </div>

      {/* Leads list */}
      <Card padding="none">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-brand)' }}>Origem rastreada</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Leads recebidos</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Segmented value={tab} onChange={setTab}
              options={[{ value: 'todos', label: 'Todos' }, { value: 'rastreados', label: 'Rastreados' }, { value: 'naoRastreados', label: 'Não rastr.' }]} />
            <select value={pixelFilter} onChange={(e) => setPixelFilter(e.target.value)} style={window.selStyle}>
              <option value="todos">Todos os pixels</option>
              {c.pixels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Lead', 'Origem', 'Pixel', 'Status', 'Horário', ''].map((h, i) => (
                  <th key={h + i} style={{ ...window.thStyle, textAlign: i === 0 ? 'left' : i === 5 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l, i) => (
                <tr key={l.id} onClick={() => onOpenLead(l.id)} style={{ borderBottom: i < leads.length - 1 ? '1px solid var(--divider)' : 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{l.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{l.phone}</div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {l.tracked ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Tag prefix="">{l.campaign}</Tag>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{l.adset} · {l.ad}</span>
                      </div>
                    ) : (
                      <Badge tone="warning" dot>Não rastreado</Badge>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{l.pixel.id}</td>
                  <td style={{ padding: '12px 14px' }}><Badge tone={l.status[0]} dot>{l.status[1]}</Badge></td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{l.time}</td>
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

Object.assign(window, { ClienteDetalhe });

function FinKpi({ icon, label, value, hint, accent }) {
  const { Icon } = window;
  return (
    <div style={{ background: accent ? 'var(--brand-subtle)' : 'var(--bg-surface)', border: `1px solid ${accent ? 'var(--brand-border)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <Icon name={icon} size={14} color={accent ? 'var(--brand)' : 'var(--text-muted)'} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', lineHeight: 1.2 }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: accent ? 'var(--text-brand)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint ? <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{hint}</div> : null}
    </div>
  );
}

Object.assign(window, { FinKpi });
