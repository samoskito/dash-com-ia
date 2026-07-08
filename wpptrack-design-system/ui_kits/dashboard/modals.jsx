/* WppTrack — modals: Conectar Pixel, Conectar WhatsApp (QR/link/código), Novo cliente (wizard). */
const { useState: mUS } = React;

/* ============ Conectar Pixel ============ */
function ConectarPixelModal({ onClose }) {
  const { Modal, Field, TextField, TextArea, SelectField } = window;
  const { Button } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const [done, setDone] = mUS(false);

  const footer = done ? (
    <Button variant="primary" onClick={onClose}>Concluir</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" iconLeft="link" onClick={() => setDone(true)}>Conectar pixel</Button>
    </>
  );

  return (
    <Modal title="Conectar Pixel da Meta" subtitle="Vincule um pixel de mensagem a uma conta de anúncio" icon="activity" width={540} onClose={onClose} footer={footer}>
      {done ? (
        <div style={{ textAlign: 'center', padding: '20px 10px' }}>
          <div style={{ width: 52, height: 52, margin: '0 auto 14px', borderRadius: '50%', background: 'var(--success-subtle)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><window.Icon name="check" size={26} /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Pixel conectado</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>O pixel já pode enviar eventos usando o token permanente da BM.</div>
        </div>
      ) : (
        <>
          <Field label="Nome de identificação" required>
            <TextField placeholder="Ex.: Vértice — Principal" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Pixel ID" required hint="Encontrado no Gerenciador de Eventos">
              <TextField mono placeholder="418•••2207" />
            </Field>
            <Field label="Cliente">
              <SelectField defaultValue="">
                <option value="" disabled>Selecione…</option>
                {WT.CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
            </Field>
          </div>
          <Field label="Conta de anúncio" required hint="O pixel de mensagem pertence a uma conta de anúncio.">
            <SelectField defaultValue="">
              <option value="" disabled>Selecione a conta…</option>
              {WT.BMS.flatMap((b) => b.accounts).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
            </SelectField>
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--info-subtle)' }}>
            <window.Icon name="info" size={18} color="var(--info)" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>O <b>token permanente</b> é configurado na Business Manager (Conectar BM), não no pixel.</span>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ============ Conectar Business Manager ============ */
function ConectarBMModal({ onClose }) {
  const { Modal, Field, TextField, TextArea, Icon } = window;
  const { Button, Badge } = window.WppTrackDesignSystem_851504;
  const [step, setStep] = mUS('form'); // form → syncing → done

  const sync = () => { setStep('syncing'); setTimeout(() => setStep('done'), 1100); };

  const footer = step === 'done'
    ? <Button variant="primary" onClick={onClose}>Concluir</Button>
    : (<><Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" iconLeft="refresh-cw" onClick={sync} disabled={step === 'syncing'}>{step === 'syncing' ? 'Sincronizando…' : 'Conectar e puxar contas'}</Button></>);

  return (
    <Modal title="Conectar Business Manager" subtitle="Puxamos as contas de anúncio e pixels automaticamente" icon="building-2" width={540} onClose={onClose} footer={footer}>
      {step === 'done' ? (
        <div style={{ textAlign: 'center', padding: '14px 10px' }}>
          <div style={{ width: 52, height: 52, margin: '0 auto 12px', borderRadius: '50%', background: 'var(--success-subtle)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={26} /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>BM conectada</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 4, maxWidth: 360, marginInline: 'auto' }}>Encontramos <b>4 contas de anúncio</b> e <b>6 pixels</b>. O token permanente cobre todos os eventos dessas contas.</div>
        </div>
      ) : (
        <>
          <Field label="ID da Business Manager" required hint="Business Settings → Informações da empresa.">
            <TextField mono placeholder="178••••4420" />
          </Field>
          <Field label="Token de acesso permanente" required hint="System User token com permissão ads_management + business_management. Salvo criptografado, associado à BM.">
            <TextArea mono rows={3} placeholder="EAAG… cole o token permanente da BM" />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--info-subtle)' }}>
            <Icon name="shield-check" size={18} color="var(--info)" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Um endpoint puxa automaticamente as contas de anúncio e os pixels desta BM. O token fica na BM e vale para todos os pixels dela.</span>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ============ Conectar WhatsApp ============ */
function ConectarWhatsAppModal({ client, onClose }) {
  const { Modal, Field, TextField, SelectField, TabBar, QRCode, Icon } = window;
  const { Button, Badge } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const [provider, setProvider] = mUS('evolution');
  const [method, setMethod] = mUS('qr');
  const link = `https://app.wpptrack.com/wa/connect/${(client && client.id) || 'cli'}-7f3a9`;
  const code = 'WT-' + ((client && client.id) || 'CLI').toUpperCase() + '-4F9A2K';

  return (
    <Modal title="Conectar WhatsApp" subtitle={client ? client.name : 'Vincular um número à operação'} icon="message-circle" width={600} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Fechar</Button><Button variant="primary" iconLeft="refresh-cw">Atualizar status</Button></>}>

      {/* provider picker */}
      <Field label="Provedor de WhatsApp">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {WT.WA_PROVIDERS.map((p) => {
            const on = provider === p.id;
            return (
              <button key={p.id} onClick={() => setProvider(p.id)} style={{
                textAlign: 'left', cursor: 'pointer', padding: 12, borderRadius: 'var(--radius-md)',
                border: `1.5px solid ${on ? 'var(--brand)' : 'var(--border)'}`, background: on ? 'var(--brand-subtle)' : 'var(--bg-surface)',
                display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: on ? 'var(--brand)' : 'var(--bg-subtle)', color: on ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 32px' }}><Icon name={p.icon} size={17} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.badge}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Field>

      <div style={{ marginTop: 8, marginBottom: 14 }}>
        <TabBar value={method} onChange={setMethod}
          tabs={[{ value: 'qr', label: 'QR Code', icon: 'qr-code' }, { value: 'link', label: 'Enviar link', icon: 'link' }, { value: 'code', label: 'Código', icon: 'key-round' }]} />
      </div>

      {method === 'qr' ? (
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: '#fff', flex: '0 0 auto' }}>
            <QRCode size={172} seed={code} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Escaneie no WhatsApp</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>Abra o WhatsApp no celular do cliente</li>
              <li>Toque em <b>Aparelhos conectados</b></li>
              <li>Aponte para este QR Code</li>
            </ol>
            <div style={{ marginTop: 12 }}><Badge tone="warning" dot>Aguardando leitura…</Badge></div>
          </div>
        </div>
      ) : null}

      {method === 'link' ? (
        <div>
          <Field label="Link de conexão" hint="Envie para o cliente abrir e escanear pelo próprio celular.">
            <div style={{ display: 'flex', gap: 8 }}>
              <TextField mono readOnly value={link} style={{ flex: 1 }} />
              <Button variant="secondary" iconLeft="copy">Copiar</Button>
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" iconLeft="message-circle">Enviar por WhatsApp</Button>
            <Button variant="secondary" size="sm" iconLeft="mail">Enviar por e-mail</Button>
            <Button variant="ghost" size="sm" iconLeft="external-link">Abrir página</Button>
          </div>
          <div style={{ marginTop: 14, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-inset)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            A página pública mostra o QR Code com a marca da agência — o cliente não precisa de acesso ao painel.
          </div>
        </div>
      ) : null}

      {method === 'code' ? (
        <div>
          <Field label="Código de integração" hint="O cliente insere este código no provedor para vincular a conexão.">
            <div style={{ display: 'flex', gap: 8 }}>
              <TextField mono readOnly value={code} style={{ flex: 1, fontSize: 'var(--text-lg)', letterSpacing: 2, textAlign: 'center' }} />
              <Button variant="secondary" iconLeft="copy">Copiar</Button>
            </div>
          </Field>
          <Field label="Número do WhatsApp">
            <TextField mono placeholder="+55 11 9••••-••••" />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--info-subtle)' }}>
            <Icon name="info" size={17} color="var(--info)" />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>O código expira em 30 minutos. Gere um novo se necessário.</span>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/* ============ Novo Cliente (wizard) ============ */
function NovoClienteModal({ onClose }) {
  const { Modal, Field, TextField, SelectField, QRCode, Icon, Switch } = window;
  const { Button, Badge } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const [step, setStep] = mUS(0);
  const steps = ['Dados', 'Conta & Pixel', 'WhatsApp', 'Etiquetas'];

  const next = () => setStep((s) => Math.min(s + 1, steps.length));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const done = step >= steps.length;

  const footer = done ? (
    <Button variant="primary" onClick={onClose}>Ir para o cliente</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={step === 0 ? onClose : back}>{step === 0 ? 'Cancelar' : 'Voltar'}</Button>
      <Button variant="primary" iconRight={step === steps.length - 1 ? 'check' : 'arrow-right'} onClick={next}>
        {step === steps.length - 1 ? 'Criar cliente' : 'Continuar'}
      </Button>
    </>
  );

  return (
    <Modal title="Novo cliente" subtitle={done ? 'Cliente criado' : `Etapa ${step + 1} de ${steps.length} · ${steps[step]}`} icon="user-plus" width={600} onClose={onClose} footer={footer}>
      {!done ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 999, background: i <= step ? 'var(--brand)' : 'var(--bg-inset)' }} />
          ))}
        </div>
      ) : null}

      {done ? (
        <div style={{ textAlign: 'center', padding: '16px 10px' }}>
          <div style={{ width: 52, height: 52, margin: '0 auto 14px', borderRadius: '50%', background: 'var(--success-subtle)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={26} /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Cliente criado com sucesso</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 4, maxWidth: 360, marginInline: 'auto' }}>Conta de anúncio, pixel e WhatsApp vinculados. Configure as etiquetas a qualquer momento em Configurações do cliente.</div>
        </div>
      ) : step === 0 ? (
        <>
          <Field label="Nome do cliente" required><TextField placeholder="Ex.: Clínica Vértice" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Segmento"><TextField placeholder="Saúde · Estética" /></Field>
            <Field label="Business Manager" hint="Onde a conta de anúncio será gerenciada">
              <SelectField>{WT.BMS.map((b) => <option key={b.id}>{b.name}</option>)}</SelectField>
            </Field>
          </div>
        </>
      ) : step === 1 ? (
        <>
          <Field label="ID da conta de anúncio" required hint="Formato act_XXXXXXXXX">
            <TextField mono placeholder="act_88210447" />
          </Field>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '6px 0 8px' }}>Pixel de mensagem</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Pixel ID" required><TextField mono placeholder="418•••2207" /></Field>
            <Field label="Token permanente" required><TextField mono placeholder="EAAG…" /></Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-inset)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            <Icon name="info" size={16} color="var(--text-muted)" />
            Você também pode cadastrar/trocar o pixel depois, em <b style={{ color: 'var(--text-secondary)' }}>Conectar pixel</b> ou nas configurações do cliente.
          </div>
        </>
      ) : step === 2 ? (
        <WAConnectStep />
      ) : (
        <>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 14 }}>Mapeie cada etiqueta do WhatsApp a um evento da Meta. Você pode ajustar isso depois nas configurações do cliente.</div>
          {[{ l: 'Pago', e: 'Purchase' }, { l: 'Agendou', e: 'LeadSubmitted' }, { l: 'Lead qualificado', e: 'QualifiedLead' }].map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: ['#16A34A', '#E29410', '#2F73E8'][i] }} />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{row.l}</span>
              </div>
              <Icon name="arrow-right" size={15} color="var(--text-muted)" />
              <div style={{ flex: 1 }}>
                <SelectField defaultValue={row.e}>{WT.META_EVENTS.map((ev) => <option key={ev}>{ev}</option>)}</SelectField>
              </div>
            </div>
          ))}
          <button style={{ marginTop: 4, border: '1px dashed var(--border-strong)', background: 'none', borderRadius: 'var(--radius-md)', padding: '9px', width: '100%', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="plus" size={15} /> Puxar etiquetas do WhatsApp
          </button>
        </>
      )}
    </Modal>
  );
}

Object.assign(window, { ConectarPixelModal, ConectarWhatsAppModal, NovoClienteModal, ProvedorConfigModal, ConectarBMModal });

/* ============ Etapa de conexão do WhatsApp (no wizard) ============ */
function WAConnectStep() {
  const { Field, TextField, QRCode, Icon, TabBar } = window;
  const { Button, Badge } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const [provider, setProvider] = mUS(null);
  const [method, setMethod] = mUS('qr');

  if (!provider) {
    return (
      <div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 14 }}>Escolha por qual provedor este cliente vai conectar o WhatsApp.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {WT.WA_PROVIDERS.map((p) => {
            const full = p.fields === 'node' && p.instances >= p.instanceCap;
            return (
              <button key={p.id} disabled={full} onClick={() => setProvider(p.id)} style={{
                textAlign: 'left', cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.55 : 1, padding: 14, borderRadius: 'var(--radius-md)',
                border: '1.5px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', gap: 12, alignItems: 'center',
              }}>
                <div style={{ width: 38, height: 38, flex: '0 0 38px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-subtle)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={p.icon} size={19} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</span>
                    <Badge tone={p.id === 'evolution' ? 'brand' : p.id === 'node' ? 'signal' : 'info'}>{p.badge}</Badge>
                    {p.fields === 'node' ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{p.instances}/{p.instanceCap} instâncias</span> : null}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{p.desc}</div>
                </div>
                <Icon name="chevron-right" size={17} color="var(--text-muted)" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const prov = WT.WA_PROVIDERS.find((p) => p.id === provider);
  const code = 'WT-NOVO-4F9A2K';
  const link = 'https://app.wpptrack.com/wa/connect/novo-7f3a9';
  return (
    <div>
      <button onClick={() => setProvider(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
        <Icon name="arrow-left" size={13} /> {prov.name}
      </button>
      <div style={{ marginBottom: 14 }}>
        <TabBar value={method} onChange={setMethod} tabs={[{ value: 'qr', label: 'QR Code', icon: 'qr-code' }, { value: 'link', label: 'Enviar link', icon: 'link' }, { value: 'code', label: 'Código', icon: 'key-round' }]} />
      </div>
      {method === 'qr' ? (
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: '#fff', flex: '0 0 auto' }}><QRCode size={150} seed="novocliente" /></div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>Escaneie no WhatsApp</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 4, marginBottom: 10 }}>Aparelhos conectados → Conectar aparelho.</div>
            <Badge tone="warning" dot>Aguardando conexão</Badge>
          </div>
        </div>
      ) : method === 'link' ? (
        <Field label="Link de conexão" hint="Envie para o cliente abrir e escanear.">
          <div style={{ display: 'flex', gap: 8 }}><TextField mono readOnly value={link} style={{ flex: 1 }} /><Button variant="secondary" iconLeft="copy">Copiar</Button></div>
        </Field>
      ) : (
        <Field label="Código de integração" hint="O cliente insere este código no provedor.">
          <div style={{ display: 'flex', gap: 8 }}><TextField mono readOnly value={code} style={{ flex: 1, textAlign: 'center', letterSpacing: 2 }} /><Button variant="secondary" iconLeft="copy">Copiar</Button></div>
        </Field>
      )}
    </div>
  );
}

/* ============ Configurar provedor de WhatsApp ============ */
function ProvedorConfigModal({ providerId, onClose }) {
  const { Modal, Field, TextField, TextArea, Icon } = window;
  const { Button, Badge } = window.WppTrackDesignSystem_851504;
  const WT = window.WT;
  const p = WT.WA_PROVIDERS.find((x) => x.id === providerId) || WT.WA_PROVIDERS[0];
  const [done, setDone] = mUS(false);

  const footer = done ? <Button variant="primary" onClick={onClose}>Concluir</Button> : (
    <><Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" iconLeft="check" onClick={() => setDone(true)}>Salvar provedor</Button></>
  );

  return (
    <Modal title={`Configurar ${p.name}`} subtitle={p.badge} icon={p.icon} width={540} onClose={onClose} footer={footer}>
      {done ? (
        <div style={{ textAlign: 'center', padding: '18px 10px' }}>
          <div style={{ width: 50, height: 50, margin: '0 auto 12px', borderRadius: '50%', background: 'var(--success-subtle)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={25} /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Provedor configurado</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>Os clientes já podem conectar o WhatsApp por {p.name}.</div>
        </div>
      ) : p.fields === 'evolution' ? (
        <>
          <Field label="URL da instância" required hint="Endpoint do seu servidor Evolution.">
            <TextField mono placeholder="https://evolution.suaagencia.com" />
          </Field>
          <Field label="Token master" required hint="Chave de administração (AUTHENTICATION_API_KEY).">
            <TextField mono placeholder="••••••••••••••••" />
          </Field>
          <Info text="A URL e o token master ficam salvos na agência. Cada cliente gera sua própria instância na conexão." />
        </>
      ) : p.fields === 'node' ? (
        <>
          <Field label="Token da NOD API" required hint="Informe o token da sua assinatura. Validamos as instâncias disponíveis automaticamente.">
            <div style={{ display: 'flex', gap: 8 }}>
              <TextField mono placeholder="nod_live_••••••••••" defaultValue="nod_live_9f3a2207k" style={{ flex: 1 }} />
              <Button variant="secondary" iconLeft="refresh-cw">Sincronizar</Button>
            </div>
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-inset)', border: '1px solid var(--border)' }}>
            <div style={{ width: 40, height: 40, flex: '0 0 40px', borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="boxes" size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Instâncias do plano</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Retornado pelo webhook da assinatura</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)' }}>{p.instances}/{p.instanceCap}</div>
              <Badge tone={p.instances < p.instanceCap ? 'success' : 'warning'}>{p.instances < p.instanceCap ? `${p.instanceCap - p.instances} livre(s)` : 'Esgotado'}</Badge>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-inset)', overflow: 'hidden' }}>
              <div style={{ width: `${(p.instances / p.instanceCap) * 100}%`, height: '100%', background: 'var(--brand)' }} />
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 6 }}>Cobrança por instância/mês. Compre mais instâncias e clique em <b style={{ color: 'var(--text-secondary)' }}>Sincronizar</b> para liberar novas conexões.</div>
          </div>
        </>
      ) : (
        <>
          <Field label="ID do número de telefone" required>
            <TextField mono placeholder="1098••••2207" />
          </Field>
          <Field label="Token de acesso permanente" required hint="Token do app da Meta com permissão whatsapp_business_messaging.">
            <TextArea mono rows={3} placeholder="EAAG… cole o token permanente" />
          </Field>
          <Info text="O token permanente é salvo criptografado. Use um System User token para não expirar." />
        </>
      )}
    </Modal>
  );
}

function Info({ text }) {
  const { Icon } = window;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--info-subtle)' }}>
      <Icon name="shield-check" size={18} color="var(--info)" />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{text}</span>
    </div>
  );
}

Object.assign(window, { ProvedorConfigModal, Info });
