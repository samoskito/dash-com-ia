/* WppTrack — ClienteConfig: per-client settings. Tabs: Conta & Pixels · WhatsApp · Etiquetas → eventos · IA. */
function ClienteConfig({ clientId, theme, onNav, onToggleTheme, onBack, openModal }) {
  const { useState } = React;
  const { Icon, AppShell, TabBar, Switch, ClientAvatar, Field, TextField, SelectField } = window;
  const { Button, Card, Badge, Tag } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const c = WT.CLIENTS.find((x) => x.id === clientId) || WT.CLIENTS[0];
  const cfg = c.config;
  const [tab, setTab] = useState('conta');
  const [etq, setEtq] = useState(cfg.etiquetas);
  const [ai, setAi] = useState(cfg.ai);
  const provider = WT.WA_PROVIDERS.find((p) => p.id === cfg.wa.provider);

  const breadcrumb = (
    <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.04em' }}>
      <Icon name="arrow-left" size={13} /> {c.name}
    </button>
  );

  const setEvent = (i, ev) => setEtq((arr) => arr.map((e, idx) => idx === i ? { ...e, event: ev || null } : e));

  return (
    <AppShell active="clienteDetalhe" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme}
      breadcrumb={breadcrumb}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><ClientAvatar client={c} size={28} />Configurações · {c.name}</span>}>

      <TabBar value={tab} onChange={setTab} tabs={[
        { value: 'conta', label: 'Conta & Pixels', icon: 'briefcase' },
        { value: 'whatsapp', label: 'WhatsApp', icon: 'message-circle' },
        { value: 'etiquetas', label: 'Etiquetas → eventos', icon: 'tags' },
        { value: 'ia', label: 'IA', icon: 'sparkles' },
      ]} />

      {/* ---- Conta & Pixels (agrupado por conta de anúncio) ---- */}
      {tab === 'conta' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: 560 }}>Cada pixel de mensagem pertence a uma conta de anúncio. Um cliente pode ter mais de uma conta — cada uma com seu(s) pixel(s).</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" iconLeft="refresh-cw">Sincronizar campanhas</Button>
              <Button variant="primary" size="sm" iconLeft="plus" onClick={() => openModal({ type: 'pixel' })}>Conectar pixel</Button>
            </div>
          </div>
          {(() => {
            const accounts = WT.BMS.flatMap((b) => b.accounts.map((a) => ({ ...a, bm: b }))).filter((a) => a.client === c.id);
            const pixById = Object.fromEntries(c.pixels.map((p) => [p.id, p]));
            return accounts.map((a) => (
              <Card key={a.id} padding="none">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--bg-subtle)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 38px' }}><Icon name="briefcase" size={18} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{a.id} · {a.bm.name}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{a.pixels.length} pixel(s)</span>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {a.pixels.map((pid) => {
                    const p = pixById[pid] || { id: pid, name: 'Pixel', status: 'ok' };
                    return (
                      <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                        <div style={{ width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 30px' }}><Icon name="activity" size={15} /></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>ID {p.id} · token na BM</div>
                        </div>
                        <Badge tone={p.status === 'ok' ? 'success' : p.status === 'warn' ? 'warning' : 'danger'} dot>{p.status === 'ok' ? 'Ativo' : p.status === 'warn' ? 'Sincronizando' : 'Erro'}</Badge>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ));
          })()}
        </div>
      ) : null}

      {/* ---- WhatsApp ---- */}
      {tab === 'whatsapp' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
          <Card eyebrow="Conexão" title="WhatsApp do cliente">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--divider)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: cfg.wa.status === 'connected' ? 'var(--brand)' : 'var(--warning-subtle)', color: cfg.wa.status === 'connected' ? '#fff' : 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 44px' }}><Icon name="message-circle" size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>{cfg.wa.number}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{provider ? provider.name : 'Evolution API'} · {cfg.wa.instance}</div>
              </div>
              <Badge tone={cfg.wa.status === 'connected' ? 'success' : 'warning'} dot>{cfg.wa.status === 'connected' ? 'Conectado' : 'Pendente'}</Badge>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button variant="primary" size="sm" iconLeft="qr-code" onClick={() => openModal({ type: 'whatsapp', client: c })}>{cfg.wa.status === 'connected' ? 'Reconectar' : 'Conectar WhatsApp'}</Button>
              {cfg.wa.status === 'connected' ? <Button variant="ghost" size="sm" iconLeft="power">Desconectar</Button> : null}
            </div>
          </Card>
          <Card eyebrow="Provedor" title="Modalidade">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}>
              {WT.WA_PROVIDERS.map((p) => {
                const on = cfg.wa.provider === p.id;
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', border: `1.5px solid ${on ? 'var(--brand)' : 'var(--border)'}`, background: on ? 'var(--brand-subtle)' : 'transparent' }}>
                    <Icon name={p.icon} size={18} color={on ? 'var(--brand)' : 'var(--text-muted)'} />
                    <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</span>
                    {on ? <Icon name="check-circle" size={17} color="var(--brand)" /> : <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Trocar</span>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}

      {/* ---- Etiquetas → eventos ---- */}
      {tab === 'etiquetas' ? (
        <Card padding="none">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--divider)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Etiquetas → eventos da Meta</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 2 }}>Cada etiqueta do WhatsApp dispara um evento no pixel de mensagem quando aplicada.</div>
            </div>
            <Button variant="secondary" size="sm" iconLeft="refresh-cw">Puxar etiquetas do WhatsApp</Button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Etiqueta', '', 'Evento da Meta', 'Valor (R$)', 'Status'].map((h, i) => (
                <th key={h + i} style={{ ...window.thStyle, textAlign: i === 3 ? 'right' : 'left', width: i === 1 ? 40 : 'auto' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {etq.map((e, i) => (
                <tr key={i} style={{ borderBottom: i < etq.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                  <td style={{ padding: '12px 18px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: e.color, flex: '0 0 11px' }} />
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{e.label}</span>
                    </span>
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'center' }}><Icon name="arrow-right" size={15} color="var(--text-muted)" /></td>
                  <td style={{ padding: '12px 14px', maxWidth: 230 }}>
                    <SelectField value={e.event || ''} onChange={(ev) => setEvent(i, ev.target.value)} style={{ maxWidth: 230 }}>
                      <option value="">— Não enviar evento —</option>
                      {WT.META_EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                    </SelectField>
                  </td>
                  <td style={{ padding: '12px 14px', width: 130 }}>
                    <TextField mono defaultValue={e.value ? e.value : ''} placeholder="0,00" disabled={!e.event}
                      style={{ height: 'var(--control-sm)', textAlign: 'right', opacity: e.event ? 1 : 0.5 }} />
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    {e.event ? <Badge tone="signal" dot>Configurado</Badge> : <Badge tone="neutral">Pendente</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderTop: '1px solid var(--divider)', background: 'var(--bg-inset)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{etq.filter((e) => e.event).length} de {etq.length} etiquetas mapeadas · o valor é enviado junto ao evento (Purchase) e usado no ROAS</span>
            <Button variant="primary" size="sm" iconLeft="save">Salvar mapeamento</Button>
          </div>
        </Card>
      ) : null}

      {/* ---- IA ---- */}
      {tab === 'ia' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <Card eyebrow="Análise de conversas" title="Inteligência artificial">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--divider)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Analisar conversas com IA</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>Intenção, qualidade e estágio do lead.</div>
              </div>
              <Switch on={ai.enabled} onChange={(v) => setAi({ ...ai, enabled: v })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', opacity: ai.enabled ? 1 : 0.5, pointerEvents: ai.enabled ? 'auto' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Apenas leads de campanha</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>Analisa automaticamente todo lead que veio rastreado de anúncio.</div>
              </div>
              <Switch on={ai.autoCampaign} onChange={(v) => setAi({ ...ai, autoCampaign: v })} />
            </div>
            <div style={{ marginTop: 14, opacity: ai.enabled ? 1 : 0.5 }}>
              <Field label="Provedor de IA" hint="Gerencie as API Keys em Configurações → Inteligência artificial.">
                <SelectField value={ai.provider} onChange={(e) => setAi({ ...ai, provider: e.target.value })}>
                  {WT.AI_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </SelectField>
              </Field>
            </div>
          </Card>
          <Card eyebrow="Prévia" title="Exemplo de análise">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge tone="signal" dot>{WT.SAMPLE_AI.intent}</Badge>
              <Badge tone="warning">{WT.SAMPLE_AI.quality}</Badge>
              <Badge tone="brand">Estágio: {WT.SAMPLE_AI.stage}</Badge>
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{WT.SAMPLE_AI.summary}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {WT.SAMPLE_AI.tags.map((t) => <Tag key={t} prefix="">{t}</Tag>)}
            </div>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}

Object.assign(window, { ClienteConfig });
