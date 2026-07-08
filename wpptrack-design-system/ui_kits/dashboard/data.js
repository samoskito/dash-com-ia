/* WppTrack — mock data for the agency dashboard UI kit.
   Plain JS (no JSX). Sets window.WT. Agency → clients (1 level).
   Metrics: conversas iniciadas / rastreadas / não rastreadas + conversões (Pixel). */
(function () {
  const BRL = (n) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const NUM = (n) => n.toLocaleString('pt-BR');

  // categorical avatar tints (subtle, brand-adjacent) for client identity
  const TINTS = {
    teal:   { bg: '#0E8C7A', fg: '#fff' },
    deep:   { bg: '#0A5E53', fg: '#fff' },
    blue:   { bg: '#2F73E8', fg: '#fff' },
    amber:  { bg: '#C77D12', fg: '#fff' },
    slate:  { bg: '#46555F', fg: '#fff' },
    violet: { bg: '#6B57C2', fg: '#fff' },
  };

  const CLIENTS = [
    {
      id: 'c1', name: 'Clínica Vértice', initials: 'CV', tint: 'teal', segment: 'Saúde · Estética',
      pixels: [{ id: '418•••2207', name: 'Vértice — Principal', status: 'ok' }, { id: '992•••1043', name: 'Vértice — Unidade Sul', status: 'ok' }],
      conversas: 1840, rastreadas: 1602, naoRastreadas: 238, conversoes: 612,
      investimento: 8420.00, receita: 41800.00, leads7d: 286, deltaConversas: 18, deltaRastreio: 4,
    },
    {
      id: 'c2', name: 'AutoPrime Veículos', initials: 'AP', tint: 'blue', segment: 'Automotivo',
      pixels: [{ id: '551•••8890', name: 'AutoPrime — Seminovos', status: 'ok' }],
      conversas: 2470, rastreadas: 1980, naoRastreadas: 490, conversoes: 540,
      investimento: 12300.00, receita: 58900.00, leads7d: 402, deltaConversas: 9, deltaRastreio: -3,
    },
    {
      id: 'c3', name: 'EduMais Cursos', initials: 'EM', tint: 'amber', segment: 'Educação · Infoproduto',
      pixels: [{ id: '203•••4471', name: 'EduMais — Lançamento', status: 'warn' }, { id: '203•••4480', name: 'EduMais — Perpétuo', status: 'ok' }],
      conversas: 3120, rastreadas: 2884, naoRastreadas: 236, conversoes: 988,
      investimento: 15600.00, receita: 92400.00, leads7d: 514, deltaConversas: 27, deltaRastreio: 6,
    },
    {
      id: 'c4', name: 'Studio Bloom', initials: 'SB', tint: 'violet', segment: 'Beleza · Franquia',
      pixels: [{ id: '770•••6612', name: 'Bloom — Rede', status: 'ok' }],
      conversas: 980, rastreadas: 742, naoRastreadas: 238, conversoes: 214,
      investimento: 4200.00, receita: 18600.00, leads7d: 168, deltaConversas: -6, deltaRastreio: 2,
    },
    {
      id: 'c5', name: 'Imobiliária Norte', initials: 'IN', tint: 'slate', segment: 'Imobiliário',
      pixels: [{ id: '634•••2218', name: 'Norte — Lançamentos', status: 'ok' }, { id: '634•••2230', name: 'Norte — Locação', status: 'err' }],
      conversas: 1530, rastreadas: 1180, naoRastreadas: 350, conversoes: 286,
      investimento: 9800.00, receita: 47200.00, leads7d: 242, deltaConversas: 12, deltaRastreio: -1,
    },
    {
      id: 'c6', name: 'FitPro Suplementos', initials: 'FP', tint: 'deep', segment: 'E-commerce',
      pixels: [{ id: '845•••9904', name: 'FitPro — Catálogo', status: 'ok' }],
      conversas: 1290, rastreadas: 1166, naoRastreadas: 124, conversoes: 430,
      investimento: 6100.00, receita: 33500.00, leads7d: 208, deltaConversas: 15, deltaRastreio: 5,
    },
  ];

  // derive per-client rates + roas + cpl
  CLIENTS.forEach((c) => {
    c.taxaRastreio = Math.round((c.rastreadas / c.conversas) * 100);
    c.roas = +(c.receita / c.investimento).toFixed(2);
    c.cpl = +(c.investimento / c.conversas).toFixed(2);
  });

  const CAMPAIGNS = ['black-friday', 'remarketing-7d', 'prospeccao-frio', 'lookalike-2%', 'lancamento-abril', 'institucional'];
  const ADSETS = ['lookalike-2%', 'interesses-amplo', 'visitantes-site', 'engajou-ig', 'lookalike-1%', 'retargeting-vídeo'];
  const ADS = ['video-depoimento', 'carrossel-oferta', 'imagem-prova', 'reels-bastidor', 'video-curto', 'estatico-promo'];
  const STAGES = [
    ['signal', 'Convertido'], ['success', 'Qualificado'], ['warning', 'Em conversa'],
    ['neutral', 'Novo'], ['danger', 'Perdido'],
  ];
  const FIRST = ['Marina', 'Rafael', 'Juliana', 'Diego', 'Camila', 'Bruno', 'Larissa', 'Thiago', 'Patrícia', 'Vinícius', 'Aline', 'Gustavo', 'Renata', 'Fernando', 'Beatriz', 'Leandro'];
  const LAST = ['Alves', 'Pinto', 'Costa', 'Martins', 'Souza', 'Ramos', 'Cardoso', 'Nogueira', 'Teixeira', 'Barbosa', 'Moraes', 'Lima', 'Freitas', 'Rocha'];

  // deterministic pseudo-random so the mock is stable across renders
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  function makeLeads(client, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const tracked = rnd() > 0.16;
      const stage = pick(STAGES);
      const hour = 8 + Math.floor(rnd() * 12);
      const min = Math.floor(rnd() * 60);
      out.push({
        id: client.id + '-l' + i,
        clientId: client.id,
        name: pick(FIRST) + ' ' + pick(LAST),
        phone: '+55 ' + (11 + Math.floor(rnd() * 80)) + ' 9•••• ' + (1000 + Math.floor(rnd() * 8999)),
        tracked,
        campaign: tracked ? pick(CAMPAIGNS) : null,
        adset: tracked ? pick(ADSETS) : null,
        ad: tracked ? pick(ADS) : null,
        pixel: pick(client.pixels),
        status: stage,
        time: String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0'),
        date: 'Hoje',
        utm: tracked ? { source: 'fb', medium: 'paid', campaign: pick(CAMPAIGNS), content: pick(ADS) } : null,
        ctwaClid: tracked ? 'CTWA.' + Math.random().toString(36).slice(2, 10) + '.' + Math.floor(rnd() * 9e7 + 1e7) : null,
        value: stage[1] === 'Convertido' ? 200 + Math.floor(rnd() * 1800) : 0,
      });
    }
    return out;
  }

  CLIENTS.forEach((c) => { c.leads = makeLeads(c, 12); });

  // agency-wide totals
  const TOTALS = CLIENTS.reduce((a, c) => ({
    conversas: a.conversas + c.conversas,
    rastreadas: a.rastreadas + c.rastreadas,
    naoRastreadas: a.naoRastreadas + c.naoRastreadas,
    conversoes: a.conversoes + c.conversoes,
    investimento: a.investimento + c.investimento,
    receita: a.receita + c.receita,
  }), { conversas: 0, rastreadas: 0, naoRastreadas: 0, conversoes: 0, investimento: 0, receita: 0 });
  TOTALS.taxaRastreio = Math.round((TOTALS.rastreadas / TOTALS.conversas) * 100);
  TOTALS.roas = +(TOTALS.receita / TOTALS.investimento).toFixed(2);
  TOTALS.cpl = +(TOTALS.investimento / TOTALS.conversas).toFixed(2);
  TOTALS.clientes = CLIENTS.length;
  TOTALS.pixels = CLIENTS.reduce((a, c) => a + c.pixels.length, 0);

  // 14-day trend series (conversas, rastreadas, conversões) for BI
  const TREND = Array.from({ length: 14 }, (_, i) => {
    const base = 1180 + Math.round(Math.sin(i / 2) * 180 + i * 22);
    const tracked = Math.round(base * (0.78 + Math.sin(i / 3) * 0.06));
    return {
      day: i + 1,
      label: String(i + 12).padStart(2, '0') + '/06',
      conversas: base,
      rastreadas: tracked,
      conversoes: Math.round(tracked * 0.3),
      investimento: 3200 + Math.round(Math.cos(i / 2) * 600 + i * 40),
    };
  });

  // a sample WhatsApp-style conversation for the lead-detail chat panel
  const SAMPLE_CHAT = [
    { from: 'lead', text: 'Oi, vi o anúncio de vocês no Instagram. Ainda tá com a condição da Black Friday?', time: '14:12' },
    { from: 'agent', text: 'Oi, Marina! Tudo bem? Sim, a condição é válida até sexta. Posso te explicar como funciona?', time: '14:13' },
    { from: 'lead', text: 'Pode sim! Queria saber o valor e se parcela.', time: '14:15' },
    { from: 'agent', text: 'Claro. O plano sai por R$ 1.240 e parcelamos em até 6x sem juros. Quer que eu já reserve sua vaga?', time: '14:16' },
    { from: 'lead', text: 'Quero! Pode reservar pra mim 🙌', time: '14:21' },
    { from: 'agent', text: 'Perfeito, reservado ✅ Vou te mandar o link de pagamento aqui.', time: '14:22' },
  ];

  // ---- Meta events available for the message pixel (etiqueta → evento) ----
  const META_EVENTS = [
    'Purchase', 'LeadSubmitted', 'InitiateCheckout', 'AddToCart', 'ViewContent',
    'OrderCreated', 'OrderShipped', 'OrderDelivered', 'OrderCanceled', 'OrderReturned',
    'CartAbandoned', 'QualifiedLead', 'RatingProvided', 'ReviewProvided',
  ];

  // ---- Business Managers → ad accounts → pixels (Marketing API) ----
  const BMS = [
    {
      id: 'bm1', name: 'Norte Performance', metaId: '178•••4420', status: 'ok', app: 'WppTrack Marketing API',
      accounts: [
        { id: 'act_88210447', name: 'Vértice — Conta principal', client: 'c1', spend30d: 8420, pixels: ['418•••2207', '992•••1043'] },
        { id: 'act_55190882', name: 'AutoPrime — Seminovos', client: 'c2', spend30d: 12300, pixels: ['551•••8890'] },
        { id: 'act_20344710', name: 'EduMais — Lançamento', client: 'c3', spend30d: 9400, pixels: ['203•••4471'] },
        { id: 'act_20344799', name: 'EduMais — Perpétuo', client: 'c3', spend30d: 6200, pixels: ['203•••4480'] },
      ],
    },
    {
      id: 'bm2', name: 'Norte Clientes 02', metaId: '203•••9981', status: 'ok', app: 'WppTrack Marketing API',
      accounts: [
        { id: 'act_77066120', name: 'Studio Bloom — Rede', client: 'c4', spend30d: 4200, pixels: ['770•••6612'] },
        { id: 'act_63422180', name: 'Imobiliária Norte', client: 'c5', spend30d: 9800, pixels: ['634•••2218', '634•••2230'] },
        { id: 'act_84599040', name: 'FitPro — Catálogo', client: 'c6', spend30d: 6100, pixels: ['845•••9904'] },
      ],
    },
  ];

  // ---- WhatsApp providers (modalidades) ----
  const WA_PROVIDERS = [
    { id: 'evolution', name: 'Evolution API', desc: 'Provedor oferecido pela WppTrack — conexão via QR Code.', icon: 'message-circle', status: 'connected', badge: 'Recomendado', instances: 5, fields: 'evolution' },
    { id: 'node', name: 'NOD API', desc: 'API gerenciada da WppTrack, cobrada por instância/mês. O token informa quantas instâncias você pode usar.', icon: 'boxes', status: 'connected', badge: 'Por instância', instances: 1, instanceCap: 3, fields: 'node' },
    { id: 'cloud', name: 'WhatsApp Cloud API', desc: 'API oficial da Meta — número verificado e webhooks.', icon: 'cloud', status: 'available', badge: 'Oficial', instances: 0, fields: 'cloud' },
  ];

  // ---- AI providers (analisar conversa) ----
  const AI_PROVIDERS = [
    { id: 'anthropic', name: 'Anthropic · Claude', model: 'claude-sonnet', status: 'connected', icon: 'sparkles' },
    { id: 'openai', name: 'OpenAI · GPT', model: 'gpt-4o', status: 'available', icon: 'bot' },
    { id: 'gemini', name: 'Google · Gemini', model: 'gemini-1.5', status: 'available', icon: 'gem' },
    { id: 'custom', name: 'Provedor customizado', model: 'endpoint próprio', status: 'available', icon: 'plug' },
  ];

  // ---- Per-client configuration (ad account, WhatsApp, etiquetas, IA) ----
  const ETIQUETA_COLORS = ['#16A34A', '#E29410', '#2F73E8', '#6B57C2', '#E5484D', '#0E8C7A'];
  CLIENTS.forEach((c, ci) => {
    const acct = BMS.flatMap((b) => b.accounts).find((a) => a.client === c.id);
    c.config = {
      bm: BMS.find((b) => b.accounts.some((a) => a.client === c.id)),
      adAccount: acct ? acct.id : 'act_—',
      wa: {
        provider: ci % 3 === 1 ? 'cloud' : 'evolution',
        status: ci === 3 ? 'pending' : 'connected',
        number: '+55 ' + (11 + ci) + ' 9' + (8000 + ci * 137) + '-' + (1000 + ci * 7),
        instance: 'inst_' + c.id,
      },
      etiquetas: [
        { label: 'Pago', color: ETIQUETA_COLORS[0], event: 'Purchase', value: 1240, count: Math.round(c.conversoes * 0.62) },
        { label: 'Agendou', color: ETIQUETA_COLORS[1], event: 'LeadSubmitted', value: 0, count: Math.round(c.conversoes * 0.9) },
        { label: 'Lead qualificado', color: ETIQUETA_COLORS[2], event: 'QualifiedLead', value: 0, count: Math.round(c.rastreadas * 0.4) },
        { label: 'Em negociação', color: ETIQUETA_COLORS[3], event: ci === 0 ? 'InitiateCheckout' : null, value: 0, count: Math.round(c.conversoes * 0.5) },
        { label: 'Sem interesse', color: ETIQUETA_COLORS[4], event: null, value: 0, count: Math.round(c.naoRastreadas * 0.3) },
        { label: 'Novo', color: ETIQUETA_COLORS[5], event: null, value: 0, count: Math.round(c.conversas * 0.2) },
      ],
      ai: { enabled: ci % 2 === 0, provider: 'anthropic', autoCampaign: ci % 2 === 0 },
    };
    // vendas (Purchase) + faturamento estimado a partir do valor fixo da etiqueta "Pago"
    const pago = c.config.etiquetas[0];
    c.vendas = pago.count;
    c.faturamento = pago.count * pago.value;
    c.roasCampanha = +(c.faturamento / c.investimento).toFixed(2);
    c.custoLeadReal = +(c.investimento / c.rastreadas).toFixed(2);
  });

  // ---- Sample AI analysis for a lead (intent / quality / stage / summary) ----
  const SAMPLE_AI = {
    intent: 'Alta intenção de compra',
    quality: 'Quente',
    stage: 'Negociação',
    score: 86,
    summary: 'Lead chegou pelo anúncio de Black Friday, perguntou preço e parcelamento e pediu para reservar a vaga. Demonstrou decisão de compra; recomendável enviar o link de pagamento e fazer follow-up em 24h caso não conclua.',
    tags: ['preço', 'parcelamento', 'reserva', 'black-friday'],
  };

  window.WT = {
    CLIENTS, TOTALS, TREND, SAMPLE_CHAT, SAMPLE_AI,
    BMS, WA_PROVIDERS, AI_PROVIDERS, META_EVENTS,
    fmt: { BRL, NUM },
  };
})();
