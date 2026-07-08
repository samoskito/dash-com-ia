/* WppTrack — Sistema: perfil do usuário + white-label (marca, cores, logo SVG). */
function Sistema({ theme, onNav, onToggleTheme }) {
  const { useState } = React;
  const { Icon, AppShell, TabBar, Field, TextField, Switch } = window;
  const { Button, Card, Badge } = window.WppTrackDesignSystem_851504;
  const [tab, setTab] = useState('marca');
  const [accent, setAccent] = useState(() => { try { return localStorage.getItem('wt_accent') || 'teal'; } catch (e) { return 'teal'; } });
  const [logoName, setLogoName] = useState(null);

  const PALETTES = window.WT_PALETTES;
  React.useEffect(() => { window.applyAccent(accent); }, [accent]);

  return (
    <AppShell active="sistema" onNav={onNav} theme={theme} onToggleTheme={onToggleTheme} title="Configurações da conta">
      <TabBar value={tab} onChange={setTab} tabs={[
        { value: 'marca', label: 'Marca & sistema', icon: 'palette' },
        { value: 'perfil', label: 'Perfil', icon: 'user' },
      ]} />

      {tab === 'marca' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <Card eyebrow="White-label" title="Logo da agência">
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 14 }}>Suba o logo da sua agência (SVG) — ele aparece no painel, nos relatórios do cliente e na página de conexão.</div>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '28px 18px', borderRadius: 'var(--radius-lg)', border: '1.5px dashed var(--border-strong)', background: 'var(--bg-inset)', cursor: 'pointer', textAlign: 'center' }}>
              <input type="file" accept=".svg,image/svg+xml" style={{ display: 'none' }} onChange={(e) => setLogoName(e.target.files[0] && e.target.files[0].name)} />
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={logoName ? 'check' : 'upload-cloud'} size={22} /></div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{logoName || 'Arraste o SVG ou clique para enviar'}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>SVG · até 1 MB · fundo transparente</div>
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button variant="secondary" size="sm" iconLeft="image">Trocar favicon</Button>
              {logoName ? <Button variant="ghost" size="sm" iconLeft="trash-2" onClick={() => setLogoName(null)}>Remover</Button> : null}
            </div>
          </Card>

          <Card eyebrow="White-label" title="Cor de destaque">
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 14 }}>Aplica os botões, gráficos e destaques do painel e dos relatórios — em todas as tonalidades.</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(PALETTES).map(([key, p]) => {
                const on = accent === key;
                return (
                  <button key={key} onClick={() => setAccent(key)} aria-label={p.name} title={p.name} style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: p.swatch, border: on ? '2px solid var(--text-primary)' : '2px solid transparent', boxShadow: on ? 'var(--shadow-sm)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <Icon name="check" size={18} color="#fff" /> : null}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 4 }}>
              {['subtle', 'border', 't500', 't600', 't700'].map((k) => (
                <div key={k} style={{ flex: 1, height: 22, borderRadius: 5, background: PALETTES[accent][k] }} />
              ))}
            </div>
            <div style={{ marginTop: 16, padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-inset)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Prévia</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-flex', height: 34, alignItems: 'center', padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--brand)', color: 'var(--on-brand)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>Enviar conversão</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 999, background: 'var(--brand-subtle)', color: 'var(--text-brand)', fontSize: 'var(--text-xs)', fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)' }} />Conectado</span>
              </div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Tema escuro por padrão</span>
              <Switch on={theme === 'dark'} onChange={onToggleTheme} />
            </div>
          </Card>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <Card eyebrow="Conta" title="Seu perfil">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-lg)', background: 'linear-gradient(135deg,var(--teal-500),var(--teal-700))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>RM</div>
              <Button variant="secondary" size="sm" iconLeft="image">Trocar foto</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Nome"><TextField defaultValue="Rafael Moreira" /></Field>
              <Field label="Cargo"><TextField defaultValue="Gestor de tráfego" /></Field>
            </div>
            <Field label="E-mail"><TextField mono defaultValue="rafael@agencianorte.com" /></Field>
            <Button variant="primary" size="sm" iconLeft="save">Salvar perfil</Button>
          </Card>
          <Card eyebrow="Segurança" title="Preferências">
            <Row label="Senha" hint="Última troca há 3 meses" action={<Button variant="secondary" size="sm">Alterar</Button>} />
            <Row label="Verificação em 2 fatores" hint="Proteja o acesso à operação" action={<Switch on={true} onChange={() => {}} />} />
            <Row label="Notificações por e-mail" hint="Resumo diário de leads" action={<Switch on={false} onChange={() => {}} />} last />
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Row({ label, hint, action, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--divider)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
      </div>
      {action}
    </div>
  );
}

Object.assign(window, { Sistema });
