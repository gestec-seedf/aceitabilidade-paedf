// ===== Navegação SPA =====
const views = document.querySelectorAll('.view');
const backBtn = document.getElementById('backBtn');
const topTitle = document.getElementById('topTitle');
const history_ = [];

function showView(id, push = true) {
  let found = false;
  views.forEach(v => {
    const match = v.id === id;
    v.hidden = !match;
    if (match) found = true;
  });
  if (!found) { showView('home', false); return; }
  const target = document.getElementById(id);
  topTitle.textContent = target.dataset.title || 'Aceitabilidade';
  backBtn.hidden = (id === 'home');
  if (push) {
    if (history_[history_.length - 1] !== id) history_.push(id);
    location.hash = id;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-view]');
  if (a) {
    e.preventDefault();
    showView(a.dataset.view);
  }
});

backBtn.addEventListener('click', () => {
  history_.pop();
  const prev = history_[history_.length - 1] || 'home';
  showView(prev, false);
});

window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1) || 'home';
  showView(id, false);
});

// rota inicial
showView(location.hash.slice(1) || 'home', false);

// ===== Tema =====
const themeBtn = document.getElementById('themeBtn');
const setTheme = (t) => {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
};
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') setTheme('dark');
themeBtn.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

// ===== Busca =====
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const searchResults = document.getElementById('searchResults');

const searchIndex = [
  { id:'conceito',   t:'Conceito', kw:['aceitabilidade','definicao','definição','sensorial','escala','pnae','cecane','direito','11.947','lei','correções sensoriais','reformulação']},
  { id:'legal',      t:'Base Legal', kw:['lei 11.947','fnde 38','fnde 26','fnde 06','nota técnica 3/2022','nt 3/2022','métodos','descritivo','discriminativo','afetivo','duo-trio','pareado','triangular']},
  { id:'escala',     t:'Escala Hedônica', kw:['escala hedônica','5 pontos','facial','mista','verbal','detestei','não gostei','indiferente','gostei','adorei','cartela','votação','urna','braile']},
  { id:'quando',     t:'Quando aplicar', kw:['quando','dispensa','frutas','hortaliças','creche','0 a 3 anos','bimestre','amostra','100 a 500','20%','aplicador','equipe','estratificação','sorteio','programa de trabalho']},
  { id:'resto',      t:'Resto-Ingestão', kw:['resto','ingestão','peso','balança','calibração','rejeição','90%','pratos','distribuído','sobra']},
  { id:'adesao',     t:'Índice de Adesão', kw:['adesão','adesao','presentes','consumiram','classificação','alto','médio','baixo','muito baixo','70%','50%','30%','questionário','sopa','dia frio','quente']},
  { id:'dentrofora', t:'Dentro-Fora', kw:['dentro-fora','dentro fora','licitação','chamada pública','cnpj','provadores','cego','fadiga sensorial','macarrão','carne bovina','arroz','feijão','biscoito','85%']},
  { id:'glossario',  t:'Glossário', kw:['glossário','glossario','textura','dureza','coesividade','adesividade','fraturabilidade','mastigabilidade']},
  { id:'arvore',     t:'Árvore Decisória', kw:['árvore','arvore','decisão','decisao','qual teste','antes da compra','com os alunos']},
  { id:'fluxo',      t:'Fluxo PAE-DF', kw:['fluxo','etapas','calcular amostra','aplicar fichas','registrar','tabular','relatório','5 anos','pamonha','guará','exemplo']},
  { id:'calc-aceitacao', t:'Calculadora — Aceitação', kw:['calculadora','aceitação','85%','gostei adorei','escala hedônica']},
  { id:'calc-resto', t:'Calculadora — Resto-Ingestão', kw:['calculadora','resto','90%','peso']},
  { id:'calc-adesao',t:'Calculadora — Adesão', kw:['calculadora','adesão','adesao','classificação','70%']},
  { id:'calc-amostra',t:'Calculadora — Amostra', kw:['calculadora','amostra','tamanho','estratificada','nt 3/2022','100 a 500']},
  { id:'inteligencia',t:'Inteligência', kw:['inteligência','inteligencia','painel','dashboard','diagnóstico','diagnostico','histórico','historico','ranking','tendência','tendencia','evolução','evolucao','indicadores','score sensorial','margem de erro','reformulação','reformulacao','comparativo','por escola','aprovados']}
];

function runSearch(q) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const nq = norm(q.trim());
  if (!nq) {
    searchResults.innerHTML = '<p style="color:var(--muted)">Digite para buscar.</p>';
    return;
  }
  const hits = searchIndex.filter(item => {
    const hay = norm(item.t + ' ' + item.kw.join(' '));
    return hay.includes(nq);
  });
  if (!hits.length) {
    searchResults.innerHTML = '<p style="color:var(--muted)">Nenhum resultado.</p>';
    return;
  }
  searchResults.innerHTML = hits.map(h => {
    const matches = h.kw.filter(k => norm(k).includes(nq)).slice(0,4).join(' · ');
    return `<a href="#" data-view="${h.id}"><b>${h.t}</b><small>${matches || 'Abrir seção'}</small></a>`;
  }).join('');
}

let searchTO;
searchInput.addEventListener('input', () => {
  clearSearch.hidden = !searchInput.value;
  clearTimeout(searchTO);
  searchTO = setTimeout(() => {
    if (searchInput.value.trim()) {
      showView('searchView');
      runSearch(searchInput.value);
    } else if (location.hash === '#searchView') {
      history_.pop();
      showView(history_[history_.length - 1] || 'home', false);
    }
  }, 120);
});
clearSearch.addEventListener('click', () => {
  searchInput.value = '';
  clearSearch.hidden = true;
  if (location.hash === '#searchView') {
    history_.pop();
    showView(history_[history_.length - 1] || 'home', false);
  }
  searchInput.focus();
});

// ===== Calculadoras =====
function classify(pct, threshold) {
  if (pct >= threshold) return 'ok';
  if (pct >= threshold - 5) return 'warn';
  return 'fail';
}

// 1) Aceitação (escala hedônica)
document.getElementById('aceitacaoCalc').addEventListener('click', () => {
  const f = document.getElementById('formAceitacao');
  const v = name => Math.max(0, parseInt(f[name].value || '0', 10));
  const det = v('detestei'), ng = v('naogostei'), ind = v('indif'),
        g = v('gostei'), ad = v('adorei');
  const total = det + ng + ind + g + ad;
  const out = document.getElementById('aceitacaoResult');
  if (total === 0) {
    out.className = 'result warn';
    out.innerHTML = '<b>Informe ao menos uma resposta.</b>';
    return;
  }
  const aceitos = g + ad;
  const pct = (aceitos / total) * 100;
  const status = classify(pct, 85);
  const label = pct >= 85 ? '✅ Aceita' : '❌ Não aceita';
  out.className = 'result ' + status;
  out.innerHTML = `
    <b>${pct.toFixed(1)}% &middot; ${label}</b>
    <div class="meta">Critério PNAE: ≥ 85% (Gostei + Adorei)</div>
    <table>
      <tr><td>Total de respostas</td><td>${total}</td></tr>
      <tr><td>Aceitação (Gostei + Adorei)</td><td>${aceitos}</td></tr>
      <tr><td>Indiferente</td><td>${ind}</td></tr>
      <tr><td>Rejeição (Não gostei + Detestei)</td><td>${ng + det}</td></tr>
    </table>
  `;
});

// 2) Resto-ingestão
document.getElementById('restoCalc').addEventListener('click', () => {
  const f = document.getElementById('formResto');
  const dist = parseFloat(f.dist.value);
  const resto = parseFloat(f.resto.value);
  const out = document.getElementById('restoResult');
  if (!(dist > 0) || isNaN(resto) || resto < 0) {
    out.className = 'result warn';
    out.innerHTML = '<b>Informe pesos válidos.</b>';
    return;
  }
  if (resto > dist) {
    out.className = 'result fail';
    out.innerHTML = '<b>Resto não pode ser maior que o distribuído.</b>';
    return;
  }
  const rejeicao = (resto / dist) * 100;
  const aceit = 100 - rejeicao;
  const status = classify(aceit, 90);
  const label = aceit >= 90 ? '✅ Aceita' : '❌ Não aceita';
  out.className = 'result ' + status;
  out.innerHTML = `
    <b>${aceit.toFixed(1)}% &middot; ${label}</b>
    <div class="meta">Critério PNAE: ≥ 90% no resto-ingestão</div>
    <table>
      <tr><td>% de rejeição</td><td>${rejeicao.toFixed(1)}%</td></tr>
      <tr><td>Peso distribuído</td><td>${dist}</td></tr>
      <tr><td>Peso do resto</td><td>${resto}</td></tr>
    </table>
  `;
});

// 3) Adesão
document.getElementById('adesaoCalc').addEventListener('click', () => {
  const f = document.getElementById('formAdesao');
  const pres = parseInt(f.presentes.value, 10);
  const cons = parseInt(f.consumiram.value, 10);
  const out = document.getElementById('adesaoResult');
  if (!(pres > 0) || isNaN(cons) || cons < 0) {
    out.className = 'result warn';
    out.innerHTML = '<b>Informe valores válidos.</b>';
    return;
  }
  if (cons > pres) {
    out.className = 'result fail';
    out.innerHTML = '<b>Quem consumiu não pode ser maior que os presentes.</b>';
    return;
  }
  const pct = (cons / pres) * 100;
  let classe, status;
  if (pct > 70) { classe = 'Alto'; status = 'ok'; }
  else if (pct >= 50) { classe = 'Médio'; status = 'warn'; }
  else if (pct >= 30) { classe = 'Baixo'; status = 'fail'; }
  else { classe = 'Muito baixo'; status = 'fail'; }
  out.className = 'result ' + status;
  out.innerHTML = `
    <b>${pct.toFixed(1)}% &middot; ${classe}</b>
    <div class="meta">Alto >70% · Médio 50–70% · Baixo 30–50% · Muito baixo <30%</div>
    <table>
      <tr><td>Presentes</td><td>${pres}</td></tr>
      <tr><td>Consumiram</td><td>${cons}</td></tr>
    </table>
  `;
});

// 4) Tamanho da amostra (com correção finita)
document.getElementById('amostraCalc').addEventListener('click', () => {
  const f = document.getElementById('formAmostra');
  const N = parseInt(f.N.value, 10);
  const e = parseFloat(f.e.value) / 100;
  const z = parseFloat(f.z.value);
  const out = document.getElementById('amostraResult');
  if (!(N > 0) || !(e > 0) || !(z > 0)) {
    out.className = 'result warn';
    out.innerHTML = '<b>Preencha todos os campos.</b>';
    return;
  }
  const p = 0.5;
  const n0 = (z*z * p * (1-p)) / (e*e);
  const n = n0 / (1 + (n0 - 1) / N);
  const ceil = Math.ceil(n);
  const recomendado = Math.max(100, Math.min(500, ceil));
  const min20 = Math.ceil(recomendado * 1.2);
  const dentroFaixa = recomendado >= 100 && recomendado <= 500;
  out.className = 'result ' + (dentroFaixa ? 'ok' : 'warn');
  out.innerHTML = `
    <b>${recomendado} estudantes</b>
    <div class="meta">NT 3/2022 — DF: amostra de 100 a 500. Selecione escola com pelo menos ${min20} alunos (+20%).</div>
    <table>
      <tr><td>n estatístico (sem ajuste)</td><td>${Math.ceil(n0)}</td></tr>
      <tr><td>n ajustado para população finita</td><td>${ceil}</td></tr>
      <tr><td>Ajustado à faixa 100–500</td><td>${recomendado}</td></tr>
      <tr><td>Mínimo na escola (+20%)</td><td>${min20}</td></tr>
    </table>
  `;
});

// 5) Estratificação proporcional
document.getElementById('estratCalc').addEventListener('click', () => {
  const f = document.getElementById('formEstrat');
  const get = name => Math.max(0, parseInt(f[name].value || '0', 10));
  const seg = [
    { nome: 'Pré',              v: get('s1') },
    { nome: 'EF anos iniciais', v: get('s2') },
    { nome: 'EF anos finais',   v: get('s3') },
    { nome: 'Médio',            v: get('s4') },
    { nome: 'EJA',              v: get('s5') }
  ];
  const total = seg.reduce((a,b) => a + b.v, 0);
  const n = parseInt(f.n.value, 10);
  const out = document.getElementById('estratResult');
  if (total === 0 || !(n > 0)) {
    out.className = 'result warn';
    out.innerHTML = '<b>Preencha os segmentos e a amostra total.</b>';
    return;
  }
  let soma = 0;
  const linhas = seg.map(s => {
    const q = Math.round((s.v / total) * n);
    soma += q;
    const pct = (s.v / total) * 100;
    return `<tr><td>${s.nome} <small style="color:var(--muted)">(${pct.toFixed(1)}%)</small></td><td>${q}</td></tr>`;
  }).join('');
  out.className = 'result ok';
  out.innerHTML = `
    <b>Distribuição da amostra</b>
    <div class="meta">Total de alunos: ${total} · Amostra: ${n} (≈ ${soma} após arredondamento)</div>
    <table>${linhas}</table>
  `;
});
