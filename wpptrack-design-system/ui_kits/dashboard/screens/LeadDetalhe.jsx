/* WppTrack — LeadDetalhe: full lead record + WhatsApp conversation panel (disabled by default). */
function LeadDetalhe({ leadId, theme, onNav, onToggleTheme, onBack }) {
  const { useState } = React;
  const { Icon, ClientAvatar, AppShell } = window;
  const { Button, Card, Badge, Tag } = window.WppTrackDesignSystem_851504;
  const WT = window.WT, fmt = WT.fmt;

  let lead, client;
  for (const c of WT.CLIENTS) { const f = c.leads.find((l) => l.id === leadId); if (f) { lead = f; client = c; break; } }
  if (!lead) { lead = WT.CLIENTS[0].leads[0]; client = WT.CLIENTS[0]; }

  const [chatOn, setChatOn] = useState(false); // privacy: opt-in

  const breadcrumb = (
    <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.04em' }}>
      <Icon name="arrow-left" size={13} /> {client.name}
    </button>
  );

  return (
    <AppShell active="leadDetalhe" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme}
      breadcrumb={breadcrumb} title="Detalhe do lead">

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* LEFT — identity + tracking + journey */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-lg)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19 }}>
                {lead.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)' }}>{lead.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{lead.phone}</div>
              </div>
              <Badge tone={lead.status[0]} dot>{lead.status[1]}</Badge>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button variant="secondary" size="sm" iconLeft="external-link" fullWidth>Abrir no WhatsApp</Button>
              <Button variant="primary" size="sm" iconLeft="send" fullWidth>Enviar conversão</Button>
            </div>
          </Card>

          <Card eyebrow="Origem do clique" title="Rastreamento">
            {lead.tracked ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 6 }}>
                <JourneyRow icon="megaphone" label="Campanha" value={lead.campaign} />
                <JourneyRow icon="layers" label="Conjunto" value={lead.adset} />
                <JourneyRow icon="image" label="Anúncio" value={lead.ad} />
                <JourneyRow icon="mouse-pointer-click" label="Clique (CTWA)" value={lead.ctwaClid ? lead.ctwaClid.slice(0, 18) + '…' : 'rastreado'} />
                <JourneyRow icon="message-circle" label="WhatsApp" value={lead.pixel.name} last />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 8, padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--warning-subtle)' }}>
                <Icon name="help-circle" size={20} color="var(--warning)" />
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Origem não identificada</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 3 }}>Esta conversa iniciou sem parâmetros de rastreamento — provavelmente tráfego orgânico ou link direto.</div>
                </div>
              </div>
            )}
          </Card>

          {lead.tracked ? (
            <Card eyebrow="Parâmetros" title="Rastreamento do clique">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-brand)' }}>CTWA Clid</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-brand)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.ctwaClid}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                  <Tag prefix="utm_source:">{lead.utm.source}</Tag>
                  <Tag prefix="utm_medium:">{lead.utm.medium}</Tag>
                  <Tag prefix="utm_campaign:">{lead.utm.campaign}</Tag>
                  <Tag prefix="utm_content:">{lead.utm.content}</Tag>
                </div>
              </div>
            </Card>
          ) : null}

          {/* AI analysis */}
          <AIAnalysis lead={lead} client={client} />
        </div>

        {/* RIGHT — conversation, gated behind an opt-in toggle */}
        <Card padding="none" style={{ overflow: 'hidden', position: 'sticky', top: 76 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--divider)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-brand)' }}>Privacidade</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Conversa do WhatsApp</div>
            </div>
            <Toggle on={chatOn} onChange={setChatOn} label={chatOn ? 'Visível' : 'Oculta'} />
          </div>

          {chatOn ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-inset)', maxHeight: 460, overflowY: 'auto' }}>
              {WT.SAMPLE_CHAT.map((m, i) => <Bubble key={i} m={m} />)}
            </div>
          ) : (
            <div style={{ padding: '48px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-lg)', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="lock" size={22} color="var(--text-muted)" />
              </div>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>Conversa oculta por padrão</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: 320 }}>Para proteger a privacidade do lead, o conteúdo da conversa só é exibido quando você habilita a visualização.</div>
              <Button variant="secondary" size="sm" iconLeft="eye" onClick={() => setChatOn(true)}>Habilitar visualização</Button>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function JourneyRow({ icon, label, value, last }) {
  const { Icon } = window;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          <Icon name={icon} size={15} />
        </div>
        {!last ? <div style={{ position: 'absolute', top: 30, width: 2, height: 18, background: 'var(--border)' }} /> : null}
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
      </div>
    </div>
  );
}

function Bubble({ m }) {
  const lead = m.from === 'lead';
  return (
    <div style={{ display: 'flex', justifyContent: lead ? 'flex-start' : 'flex-end' }}>
      <div style={{ maxWidth: '78%', padding: '9px 12px', borderRadius: lead ? '4px 14px 14px 14px' : '14px 4px 14px 14px', background: lead ? 'var(--bg-surface)' : 'var(--brand)', color: lead ? 'var(--text-primary)' : 'var(--on-brand)', border: lead ? '1px solid var(--border)' : 'none', boxShadow: 'var(--shadow-xs)' }}>
        <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.45 }}>{m.text}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: lead ? 'var(--text-muted)' : 'rgba(255,255,255,0.75)', textAlign: 'right', marginTop: 3 }}>{m.time}</div>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button onClick={() => onChange(!on)} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: on ? 'var(--text-brand)' : 'var(--text-muted)' }}>{label}</span>
      <span style={{ width: 38, height: 22, borderRadius: 999, background: on ? 'var(--brand)' : 'var(--gray-300)', position: 'relative', transition: 'background var(--dur-base) var(--ease-out)' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)', transition: 'left var(--dur-base) var(--ease-out)' }} />
      </span>
    </button>
  );
}

function AIAnalysis({ lead, client }) {
  const { useState } = React;
  const { Icon } = window;
  const { Button, Card, Badge, Tag } = window.WppTrackDesignSystem_851504;
  const A = window.WT.SAMPLE_AI;
  const enabled = client && client.config && client.config.ai && client.config.ai.enabled;
  const [run, setRun] = useState(false);
  const analysed = enabled || run;

  if (!lead.tracked && !analysed) {
    return (
      <Card eyebrow="Inteligência" title="Análise da IA">
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>A análise automática está restrita a leads de campanha. Você pode analisar este lead manualmente.</div>
        <div style={{ marginTop: 12 }}><Button variant="secondary" size="sm" iconLeft="sparkles" onClick={() => setRun(true)}>Analisar conversa</Button></div>
      </Card>
    );
  }

  if (!analysed) {
    return (
      <Card eyebrow="Inteligência" title="Análise da IA">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', flex: 1 }}>Ative a análise automática nas configurações do cliente, ou rode agora.</div>
          <Button variant="secondary" size="sm" iconLeft="sparkles" onClick={() => setRun(true)}>Analisar</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card eyebrow="Inteligência" title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Análise da IA <Badge tone="signal" dot>auto</Badge></span>}
      action={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}><Icon name="sparkles" size={13} color="var(--signal-500)" /> {(client.config.ai.provider || 'claude')}</span>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div style={{ position: 'relative', width: 56, height: 56, flex: '0 0 56px' }}>
          <window.Donut size={56} thickness={7} segments={[{ value: A.score, color: 'var(--signal)' }, { value: 100 - A.score, color: 'var(--bg-inset)' }]}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{A.score}</span>
          </window.Donut>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Badge tone="signal" dot>{A.intent}</Badge>
          <Badge tone="warning">Qualidade: {A.quality}</Badge>
          <Badge tone="brand">Estágio: {A.stage}</Badge>
        </div>
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{A.summary}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        {A.tags.map((t) => <Tag key={t} prefix="">{t}</Tag>)}
      </div>
    </Card>
  );
}

Object.assign(window, { LeadDetalhe, JourneyRow, Bubble, Toggle, AIAnalysis });
