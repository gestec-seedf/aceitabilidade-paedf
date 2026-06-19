/**
 * ⚠️ LEGADO — não usar. O backend migrou para o Supabase (ver GUIA-SUPABASE.md e
 * supabase/schema.sql). Mantido apenas como referência histórica.
 *
 * Aceitabilidade PAE-DF — endpoint serverless (Google Apps Script).
 *
 * ESCRITA (aberta): doPost com um snapshot grava/atualiza uma linha na aba "Testes".
 *   Dedupe por "id": reenvios não criam linhas duplicadas. Fica aberto ("Qualquer
 *   pessoa") porque cada aparelho de nutricionista envia sem login.
 *
 * LEITURA (protegida): doPost com { action:'read', token } devolve todos os testes em
 *   JSON — mas SÓ se o token bater com READ_TOKEN. É isso que protege o BI: o segredo
 *   vive aqui, na conta da gestão, nunca no código público do app.
 *
 * Como usar: ver GUIA-NUVEM.md. Resumo:
 *  1. Crie uma Planilha Google. Extensões → Apps Script. Cole este código.
 *  2. DEFINA A SENHA em READ_TOKEN abaixo (troque o placeholder). NÃO commite a senha real.
 *  3. Implantar → Nova implantação → Tipo "App da Web".
 *     Executar como: Eu · Quem tem acesso: Qualquer pessoa.
 *  4. Copie a URL /exec → ela já está embutida no app (nuvem.js).
 *  5. No app: Inteligência → digite a senha para acessar o painel consolidado.
 *
 * Para atualizar depois: Implantar → Gerenciar implantações → editar → Nova versão
 * (a URL /exec não muda).
 */

// >>> TROQUE pela senha de acesso ao BI, AQUI no editor do Apps Script (não no repositório público). <<<
var READ_TOKEN = 'TROQUE-ESTA-SENHA';

var SHEET_NAME = 'Testes';
var HEADER = ['id', 'savedAt', 'regional', 'escola', 'programa', 'preparacao', 'data',
  'aplicador', 'matriculados', 'presentes', 'participantes', 'adorei', 'gostei',
  'indiferente', 'naogostei', 'detestei', 'aceitacao', 'adesaoMedia', 'passou'];

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function num_(v) { var x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? 0 : x; }

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

// Lê a aba "Testes" e devolve os snapshots já no formato consumido pelo app.
function readAll_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
  return values.map(function (r) {
    var o = {};
    for (var i = 0; i < HEADER.length; i++) o[HEADER[i]] = r[i];
    return {
      id: String(o.id || ''), savedAt: o.savedAt || '',
      header: {
        regional: o.regional || '', escola: o.escola || '', programa: o.programa || '',
        preparacao: o.preparacao || '', data: o.data || '', aplicador: o.aplicador || ''
      },
      totals: {
        matric: num_(o.matriculados), pres: num_(o.presentes), partic: num_(o.participantes),
        adorei: num_(o.adorei), gostei: num_(o.gostei), indif: num_(o.indiferente),
        naogostei: num_(o.naogostei), detestei: num_(o.detestei)
      },
      aceitacao: num_(o.aceitacao), adesaoMedia: num_(o.adesaoMedia),
      passou: /^(sim|true|1)$/i.test(String(o.passou).trim())
    };
  }).filter(function (s) { return s.id; });
}

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'bad json' }); }

  // ---- LEITURA protegida por token ----
  if (d && d.action === 'read') {
    if (String(d.token || '') !== String(READ_TOKEN)) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    try { return json_({ ok: true, rows: readAll_() }); }
    catch (err) { return json_({ ok: false, error: String(err) }); }
  }

  // ---- ESCRITA (default) ----
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var sh = getSheet_();
    var row = rowFrom_(d);
    // dedupe por id (coluna A)
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
    var pos = ids.indexOf(d.id);
    if (pos >= 0) sh.getRange(pos + 2, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function doGet() {
  return ContentService.createTextOutput('Aceitabilidade PAE-DF — endpoint ativo.');
}
