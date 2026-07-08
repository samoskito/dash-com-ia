/* WppTrack — RelatorioCliente: agency configures a white-label, read-only report + shareable link. */
function RelatorioCliente({ clientId, theme, onNav, onToggleTheme, onBack }) {
  const { useState } = React;
  const { Icon, AppShell, Switch, ClientAvatar, Donut } = window;
  const { Button, Card, Badge } = window.WppTrackDesignSystem_851504;
  const WT = window.WT, fmt = WT.fmt;
  const c = WT.CLIENTS.find((x) => x.id === clientId) || WT.CLIENTS[0];

  const ALL = [
    { id: 'conversas', label: 'Conversas iniciadas', icon: 'message-circle' },
    { id: 'rastreadas', label: 'Rastreadas / Não rastreadas', icon: 'git-branch' },
    { id: 'investimento', label: 'Investimento', icon: 'wallet' },
    { id: 'custoReal', label: 'Custo por lead real', icon: 'target' },
    { id: 'vendas', label: 'Vendas e faturamento', icon: 'badge-dollar-sign' },
    { id: 'roas', label: 'ROAS de campanha', icon: 'trending-up' },
    { id: 'eventos', label: 'Eventos por etiqueta', icon: 'tags' },
  ];
  const [vis, setVis] = useState({ conversas: true, rastreadas: true, investimento: true, custoReal: true, vendas: true, roas: true, eventos: true });
  const toggle = (id) => setVis((v) => ({ ...v, [id]: !v[id] }));

  const breadcrumb = (
    <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.04em' }}>
      <Icon name="arrow-left" size={13} /> {c.name}
    </button>
  );
  const link = `https://relatorio.wpptrack.com/${c.id}-7f3a9e`;

  return (
    <AppShell active="relatorios" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme}
      breadcrumb={breadcrumb} title="Relatório do cliente">

      {/* shareable link */}
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 36px' }}><Icon name="link" size={18} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Link do relatório (read-only)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" iconLeft="copy">Copiar link</Button>
            <Button variant="ghost" size="sm" iconLeft="download">Exportar PDF</Button>
            <Button variant="primary" size="sm" iconLeft="external-link">Abrir como cliente</Button>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        {/* config: which metrics the client sees */}
        <Card eyebrow="Configurar" title="O que o cliente vê">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ALL.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: i < ALL.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                <Icon name={m.icon} size={16} color={vis[m.id] ? 'var(--brand)' : 'var(--text-muted)'} />
                <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 500, color: vis[m.id] ? 'var(--text-primary)' : 'var(--text-muted)' }}>{m.label}</span>
                <Switch on={vis[m.id]} onChange={() => toggle(m.id)} size={20} />
              </div>
            ))}
          </div>
        </Card>

        {/* live preview of the client-facing report */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: 'var(--shadow-md)', background: 'var(--bg-surface)' }}>
          {/* white-label header */}
          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(120deg, var(--teal-700), var(--teal-900))', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>AN</div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>Relatório de performance</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700 }}>{c.name}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.8)' }}>12/06 — 25/06 · 2026<br />por Agência Norte</div>
          </div>

          <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* metric cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {vis.conversas ? <PvCard label="Conversas iniciadas" value={fmt.NUM(c.conversas)} /> : null}
              {vis.rastreadas ? <PvCard label="Rastreadas" value={fmt.NUM(c.rastreadas)} sub={`${c.taxaRastreio}% da origem`} /> : null}
              {vis.rastreadas ? <PvCard label="Não rastreadas" value={fmt.NUM(c.naoRastreadas)} /> : null}
              {vis.investimento ? <PvCard label="Investimento" value={fmt.BRL(c.investimento)} /> : null}
              {vis.custoReal ? <PvCard label="Custo por lead real" value={fmt.BRL(c.custoLeadReal)} /> : null}
              {vis.vendas ? <PvCard label="Vendas" value={fmt.NUM(c.vendas)} sub={fmt.BRL(c.faturamento) + ' faturado'} accent /> : null}
            </div>

            {vis.roas ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--brand-border)', background: 'var(--brand-subtle)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-brand)' }}>ROAS de campanha</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>{fmt.BRL(c.faturamento)} de retorno sobre {fmt.BRL(c.investimento)}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)', fontWeight: 700, color: 'var(--text-brand)' }}>{c.roasCampanha}x</div>
              </div>
            ) : null}

            {vis.eventos ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Eventos por etiqueta</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {c.config.etiquetas.filter((e) => e.event).map((e, i) => {
                    const max = Math.max(...c.config.etiquetas.filter((x) => x.event).map((x) => x.count));
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 120, flex: '0 0 120px', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 3, background: e.color }} />
                          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label}</span>
                        </span>
                        <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'var(--bg-inset)', overflow: 'hidden' }}>
                          <div style={{ width: `${(e.count / max) * 100}%`, height: '100%', borderRadius: 999, background: e.color }} />
                        </div>
                        <span style={{ width: 50, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt.NUM(e.count)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', paddingTop: 4 }}>Powered by WppTrack · dados de rastreamento de campanhas Meta Ads</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function PvCard({ label, value, sub, accent }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', border: `1px solid ${accent ? 'var(--brand-border)' : 'var(--border)'}`, background: accent ? 'var(--brand-subtle)' : 'var(--bg-surface)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 700, color: accent ? 'var(--text-brand)' : 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub ? <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

Object.assign(window, { RelatorioCliente, PvCard });
