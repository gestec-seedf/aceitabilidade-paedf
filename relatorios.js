// ===== Relatórios consolidados (PDF · XLSX · DOCX · ODT) =====
// Consome window.PAEReg (dados) e window.PAEIntel.aggregate (agregação).
// DOCX e ODT são arquivos OOXML/ODF reais, gerados por um mini-ZIP (STORE) próprio
// — sem dependências externas (princípio da arquitetura). PDF via janela de impressão.
(function () {
  const $ = s => document.querySelector(s);
  const msgBox = $('#intelMsg');

  function showMsg(text, type) {
    if (!msgBox) return;
    msgBox.textContent = text;
    msgBox.style.color = type === 'err' ? 'var(--red)' : (type === 'ok' ? 'var(--ok)' : 'var(--muted)');
    if (text) setTimeout(() => { if (msgBox.textContent === text) msgBox.textContent = ''; }, 4000);
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }
  function fmt(p) { return (window.PAEIntel ? window.PAEIntel.fmt(p) : (p || 0).toFixed(1) + '%'); }
  function fmtData(d) { return d ? String(d).split('-').reverse().join('/') : '—'; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const escXml = escHtml; // mesmas substituições servem para XML

  // ---------- dataset + agregação ----------
  // segue a fonte ativa da página (local ou nuvem); cai para local se nuvem ausente
  function getDataset() {
    if (window.PAENuvem) return window.PAENuvem.getActiveHistory();
    return window.PAEReg ? window.PAEReg.getHistory() : [];
  }

  // monta as estruturas de dados comuns aos 4 formatos
  function buildModel() {
    const hist = getDataset();
    const ag = window.PAEIntel.aggregate(hist);
    const periodo = ag.evol.length
      ? `${fmtData(ag.evol[0].header.data)} a ${fmtData(ag.evol[ag.evol.length - 1].header.data)}`
      : '—';
    return {
      ag, periodo,
      kpis: [
        ['Testes salvos', String(ag.count)],
        ['Aprovados (≥ 85%)', fmt(ag.pctAprov)],
        ['Aceitação média', fmt(ag.aceitMedia)],
        ['Adesão média', fmt(ag.adesaoMedia)]
      ],
      testes: {
        head: ['Preparação', 'Escola', 'Data', '% Aceit.', '% Adesão', 'Situação'],
        rows: ag.ord.map(h => [
          h.header.preparacao || '(sem nome)', h.header.escola || '', fmtData(h.header.data),
          fmt(h.aceitacao), fmt(h.adesaoMedia || 0), h.passou ? 'Aceita' : 'Não aceita'
        ])
      },
      escolas: {
        head: ['Escola', 'Testes', 'Aceit. média', '% Aprovados'],
        rows: ag.escolas.map(e => [e.nome, String(e.n), fmt(e.aceit), fmt(e.aprov)])
      },
      reform: {
        head: ['Preparação', 'Escola', '% Aceit.'],
        rows: ag.reform.map(h => [h.header.preparacao || '(sem nome)', h.header.escola || '', fmt(h.aceitacao)])
      }
    };
  }

  function ensureData() {
    if (!window.PAEReg || !window.PAEIntel) { showMsg('Módulos ainda carregando. Tente em 1s.', 'err'); return false; }
    if (!getDataset().length) { showMsg('Salve ao menos um teste no histórico para gerar o relatório.', 'err'); return false; }
    return true;
  }
  function fileName(ext) { return `relatorio_aceitabilidade_consolidado_${today()}.${ext}`; }

  // ================= mini-ZIP (STORE) + CRC32 =================
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const u8 = str => new TextEncoder().encode(str);

  // entries: [{ name, bytes:Uint8Array }] — método STORE (sem compressão)
  function zipStore(entries) {
    const chunks = [], central = [];
    let offset = 0;
    const u16 = (a, v) => a.push(v & 0xFF, (v >>> 8) & 0xFF);
    const u32 = (a, v) => a.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
    entries.forEach(e => {
      const name = u8(e.name), crc = crc32(e.bytes), size = e.bytes.length;
      const lh = [];
      u32(lh, 0x04034b50); u16(lh, 20); u16(lh, 0); u16(lh, 0); u16(lh, 0); u16(lh, 0x21);
      u32(lh, crc); u32(lh, size); u32(lh, size); u16(lh, name.length); u16(lh, 0);
      name.forEach(b => lh.push(b));
      const lhBytes = Uint8Array.from(lh);
      chunks.push(lhBytes, e.bytes);
      const cd = [];
      u32(cd, 0x02014b50); u16(cd, 20); u16(cd, 20); u16(cd, 0); u16(cd, 0); u16(cd, 0); u16(cd, 0x21);
      u32(cd, crc); u32(cd, size); u32(cd, size); u16(cd, name.length);
      u16(cd, 0); u16(cd, 0); u16(cd, 0); u16(cd, 0); u32(cd, 0); u32(cd, offset);
      name.forEach(b => cd.push(b));
      central.push(Uint8Array.from(cd));
      offset += lhBytes.length + e.bytes.length;
    });
    const cdStart = offset;
    let cdSize = 0;
    central.forEach(c => { chunks.push(c); cdSize += c.length; });
    const end = [];
    u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, entries.length); u16(end, entries.length);
    u32(end, cdSize); u32(end, cdStart); u16(end, 0);
    chunks.push(Uint8Array.from(end));
    let total = 0; chunks.forEach(c => total += c.length);
    const out = new Uint8Array(total);
    let p = 0; chunks.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  }

  // ================= PDF (janela de impressão) =================
  function genPdf() {
    if (!ensureData()) return;
    const m = buildModel();
    const tbl = (t) => `<table><thead><tr>${t.head.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${t.rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? '' : ' class="num"'}>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Consolidado</title>
    <style>
      @page { size: A4; margin: 1.5cm; }
      body { font-family:'Segoe UI',Arial,sans-serif; color:#1a1a1a; }
      h1 { color:#0b6b3a; border-bottom:2px solid #0b6b3a; padding-bottom:.3rem; }
      h2 { color:#0b6b3a; margin-top:1.2rem; font-size:1.05rem; }
      .head { background:#f4faf6; border-left:4px solid #0b6b3a; padding:.6rem .8rem; margin:.5rem 0; }
      .head p { margin:.15rem 0; }
      .kpis { display:flex; gap:.6rem; flex-wrap:wrap; margin:.5rem 0; }
      .kpi { border:1px solid #ddd; border-radius:8px; padding:.5rem .8rem; }
      .kpi b { display:block; color:#0b6b3a; font-size:1.3rem; }
      .kpi span { font-size:.78rem; color:#555; }
      table { width:100%; border-collapse:collapse; margin-top:.4rem; font-size:.85rem; }
      th, td { border:1px solid #ddd; padding:.3rem .45rem; text-align:left; }
      th { background:#0b6b3a; color:#fff; }
      td.num { text-align:right; }
      .meta { color:#555; font-size:.8rem; margin-top:1rem; border-top:1px solid #ddd; padding-top:.5rem; }
    </style></head><body>
      <h1>Relatório Consolidado de Aceitabilidade — PAE-DF</h1>
      <div class="head">
        <p><b>Período:</b> ${escHtml(m.periodo)}</p>
        <p><b>Testes consolidados:</b> ${m.ag.count}</p>
        <p><b>Gerado em:</b> ${escHtml(new Date().toLocaleString('pt-BR'))}</p>
      </div>
      <div class="kpis">${m.kpis.map(k => `<div class="kpi"><b>${escHtml(k[1])}</b><span>${escHtml(k[0])}</span></div>`).join('')}</div>
      <h2>Todos os testes (ordenados por aceitação)</h2>
      ${tbl(m.testes)}
      <h2>Por escola</h2>
      ${tbl(m.escolas)}
      <h2>Preparações que precisam de reformulação (&lt; 85%)</h2>
      ${m.reform.rows.length ? tbl(m.reform) : '<p>Nenhuma preparação reprovada. 👏</p>'}
      <p class="meta">App Aceitabilidade · PAE-DF · Boletim Alimentação 24ª ed · DIAE/SEE-DF</p>
      <script>window.onload=()=>window.print();<\/script>
    </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showMsg('Permita pop-ups para gerar o PDF.', 'err'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    showMsg('Janela de impressão aberta — escolha "Salvar como PDF".', 'ok');
  }

  // ================= XLSX (SheetJS, multi-aba) =================
  function genXlsx() {
    if (!ensureData()) return;
    if (typeof XLSX === 'undefined') { showMsg('Biblioteca de Excel ainda carregando. Tente em 1s.', 'err'); return; }
    const m = buildModel();
    const wb = XLSX.utils.book_new();

    const aoaResumo = [
      ['RELATÓRIO CONSOLIDADO DE ACEITABILIDADE — PAE-DF'],
      ['Período', m.periodo],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      [],
      ...m.kpis
    ];
    const wsR = XLSX.utils.aoa_to_sheet(aoaResumo);
    wsR['!cols'] = [{ wch: 28 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsR, 'Resumo');

    const num = (t) => XLSX.utils.aoa_to_sheet([t.head, ...t.rows]);
    const wsT = num(m.testes); wsT['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsT, 'Todos os testes');
    const wsE = num(m.escolas); wsE['!cols'] = [{ wch: 28 }, { wch: 9 }, { wch: 13 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, wsE, 'Por escola');
    const wsRef = num(m.reform.rows.length ? m.reform : { head: m.reform.head, rows: [['(nenhuma)', '', '']] });
    wsRef['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsRef, 'Reformulação');

    XLSX.writeFile(wb, fileName('xlsx'));
    showMsg('Excel (.xlsx) gerado.', 'ok');
  }

  // ================= DOCX (OOXML real) =================
  function docxParagraph(text, opts) {
    opts = opts || {};
    const sz = opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : '';
    const b = opts.bold ? '<w:b/>' : '';
    const color = opts.color ? `<w:color w:val="${opts.color}"/>` : '';
    const rpr = (b || sz || color) ? `<w:rPr>${b}${color}${sz}</w:rPr>` : '';
    const spacing = opts.spaceBefore ? `<w:pPr><w:spacing w:before="${opts.spaceBefore}"/></w:pPr>` : '';
    return `<w:p>${spacing}<w:r>${rpr}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;
  }
  function docxTable(head, rows) {
    const border = side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`;
    const borders = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`;
    const cell = (txt, bold, shade) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="0B6B3A"/>' : ''}</w:tcPr>` +
      `<w:p><w:r><w:rPr>${bold ? '<w:b/>' : ''}${shade ? '<w:color w:val="FFFFFF"/>' : ''}</w:rPr><w:t xml:space="preserve">${escXml(txt)}</w:t></w:r></w:p></w:tc>`;
    const tr = (cells, bold, shade) => `<w:tr>${cells.map(c => cell(c, bold, shade)).join('')}</w:tr>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}</w:tblPr>` +
      tr(head, true, true) + rows.map(r => tr(r, false, false)).join('') + `</w:tbl>`;
  }
  function genDocx() {
    if (!ensureData()) return;
    const m = buildModel();
    const body =
      docxParagraph('Relatório Consolidado de Aceitabilidade — PAE-DF', { bold: true, size: 32, color: '0B6B3A' }) +
      docxParagraph(`Período: ${m.periodo}`) +
      docxParagraph(`Testes consolidados: ${m.ag.count}`) +
      docxParagraph(`Gerado em: ${new Date().toLocaleString('pt-BR')}`) +
      docxParagraph('Indicadores', { bold: true, size: 26, color: '0B6B3A', spaceBefore: 200 }) +
      docxTable(['Indicador', 'Valor'], m.kpis) +
      docxParagraph('Todos os testes (ordenados por aceitação)', { bold: true, size: 26, color: '0B6B3A', spaceBefore: 200 }) +
      docxTable(m.testes.head, m.testes.rows) +
      docxParagraph('Por escola', { bold: true, size: 26, color: '0B6B3A', spaceBefore: 200 }) +
      docxTable(m.escolas.head, m.escolas.rows) +
      docxParagraph('Preparações que precisam de reformulação (< 85%)', { bold: true, size: 26, color: '0B6B3A', spaceBefore: 200 }) +
      (m.reform.rows.length ? docxTable(m.reform.head, m.reform.rows) : docxParagraph('Nenhuma preparação reprovada.'));

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

    const zip = zipStore([
      { name: '[Content_Types].xml', bytes: u8(contentTypes) },
      { name: '_rels/.rels', bytes: u8(rels) },
      { name: 'word/document.xml', bytes: u8(document) }
    ]);
    downloadBlob(new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), fileName('docx'));
    showMsg('Word (.docx) gerado.', 'ok');
  }

  // ================= ODT (ODF real) =================
  function odtTable(head, rows, name) {
    const ncols = head.length;
    const cell = (txt, bold) => `<table:table-cell table:style-name="Cell" office:value-type="string"><text:p>${bold ? `<text:span text:style-name="B">${escXml(txt)}</text:span>` : escXml(txt)}</text:p></table:table-cell>`;
    const row = (cells, bold) => `<table:table-row>${cells.map(c => cell(c, bold)).join('')}</table:table-row>`;
    return `<table:table table:name="${escXml(name)}" table:style-name="Tbl">` +
      `<table:table-column table:number-columns-repeated="${ncols}"/>` +
      row(head, true) + rows.map(r => row(r, false)).join('') + `</table:table>`;
  }
  function genOdt() {
    if (!ensureData()) return;
    const m = buildModel();
    const h = (txt) => `<text:h text:style-name="H" text:outline-level="1">${escXml(txt)}</text:h>`;
    const p = (txt) => `<text:p>${escXml(txt)}</text:p>`;
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
<office:automatic-styles>
<style:style style:name="H" style:family="paragraph"><style:text-properties fo:font-weight="bold" fo:font-size="14pt" fo:color="#0b6b3a"/></style:style>
<style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Tbl" style:family="table"><style:table-properties table:align="left"/></style:style>
<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #999999" fo:padding="0.04in"/></style:style>
</office:automatic-styles>
<office:body><office:text>
<text:p text:style-name="H" style:family="paragraph"/>
${h('Relatório Consolidado de Aceitabilidade — PAE-DF')}
${p('Período: ' + m.periodo)}
${p('Testes consolidados: ' + m.ag.count)}
${p('Gerado em: ' + new Date().toLocaleString('pt-BR'))}
${h('Indicadores')}
${odtTable(['Indicador', 'Valor'], m.kpis, 'kpis')}
${h('Todos os testes (ordenados por aceitação)')}
${odtTable(m.testes.head, m.testes.rows, 'testes')}
${h('Por escola')}
${odtTable(m.escolas.head, m.escolas.rows, 'escolas')}
${h('Preparações que precisam de reformulação (< 85%)')}
${m.reform.rows.length ? odtTable(m.reform.head, m.reform.rows, 'reform') : p('Nenhuma preparação reprovada.')}
</office:text></office:body></office:document-content>`;
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`;

    // 'mimetype' deve ser a 1ª entrada e armazenada sem compressão (STORE) — atendido.
    const zip = zipStore([
      { name: 'mimetype', bytes: u8('application/vnd.oasis.opendocument.text') },
      { name: 'META-INF/manifest.xml', bytes: u8(manifest) },
      { name: 'content.xml', bytes: u8(content) }
    ]);
    downloadBlob(new Blob([zip], { type: 'application/vnd.oasis.opendocument.text' }), fileName('odt'));
    showMsg('ODT (.odt) gerado.', 'ok');
  }

  // ---------- ligação dos botões ----------
  const bind = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
  bind('repPdf', genPdf);
  bind('repXlsx', genXlsx);
  bind('repDocx', genDocx);
  bind('repOdt', genOdt);
})();
