/**
 * Aceitabilidade PAE-DF — endpoint serverless (Google Apps Script).
 * Recebe os testes enviados pelo app (doPost) e grava em uma aba "Testes".
 * Dedupe por "id": reenvios não criam linhas duplicadas.
 *
 * Como usar: ver GUIA-NUVEM.md. Resumo:
 *  1. Crie uma Planilha Google. Extensões → Apps Script. Cole este código.
 *  2. Implantar → Nova implantação → Tipo "App da Web".
 *     Executar como: Eu · Quem tem acesso: Qualquer pessoa.
 *  3. Copie a URL /exec → cole em "URL do Web App (envio)" no app.
 *  4. Na planilha: Arquivo → Compartilhar → Publicar na web → aba "Testes" como CSV.
 *     Copie a URL → cole em "URL CSV publicada (leitura)" no app.
 */

var SHEET_NAME = 'Testes';
var HEADER = ['id', 'savedAt', 'regional', 'escola', 'programa', 'preparacao', 'data',
  'aplicador', 'matriculados', 'presentes', 'participantes', 'adorei', 'gostei',
  'indiferente', 'naogostei', 'detestei', 'aceitacao', 'adesaoMedia', 'passou'];

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(HEADER);
  return sh;
}

function rowFrom_(d) {
  var h = d.header || {}, t = d.totals || {};
  return [
    d.id || '', d.savedAt || '', h.regional || '', h.escola || '', h.programa || '',
    h.preparacao || '', h.data || '', h.aplicador || '',
    t.matric || 0, t.pres || 0, t.partic || 0, t.adorei || 0, t.gostei || 0,
    t.indif || 0, t.naogostei || 0, t.detestei || 0,
    d.aceitacao, d.adesaoMedia, d.passou ? 'SIM' : 'NAO'
  ];
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = JSON.parse(e.postData.contents);
    var sh = getSheet_();
    var row = rowFrom_(d);
    // dedupe por id (coluna A)
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
    var pos = ids.indexOf(d.id);
    if (pos >= 0) sh.getRange(pos + 2, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function doGet() {
  return ContentService.createTextOutput('Aceitabilidade PAE-DF — endpoint ativo.');
}
