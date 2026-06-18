# Guia — Sincronização com a Nuvem (Planilha Google)

Permite reunir os testes preenchidos por **várias nutricionistas, em aparelhos
diferentes**, em uma **Planilha Google central**, e ver o painel + relatórios de
**todas as escolas** no app.

> O app continua sendo um site estático (GitHub Pages). Ele apenas conversa com uma
> URL da própria gestão. **Quem não configurar, usa o app 100% local, sem mudança.**

## Visão geral (2 URLs)
- **Envio** (escrita): uma *Web App* do Google Apps Script grava cada teste numa aba.
- **Leitura**: a planilha é *publicada na web como CSV*; o app lê esse CSV para montar
  o painel consolidado.

---

## Passo a passo (faça uma vez, na conta Google da gestão)

### 1. Criar a planilha e o endpoint
1. Crie uma **Planilha Google** (ex.: "Aceitabilidade PAE-DF — Base").
2. Menu **Extensões → Apps Script**.
3. Apague o conteúdo e **cole o conteúdo de `google-apps-script/Code.gs`**. Salve.

### 2. Publicar o Web App (URL de ENVIO)
1. No editor do Apps Script: **Implantar → Nova implantação**.
2. Engrenagem → tipo **App da Web**.
3. **Executar como:** Eu (sua conta). **Quem pode acessar:** **Qualquer pessoa**.
4. **Implantar** e autorizar o acesso quando solicitado.
5. Copie a **URL do app da web** (termina em `/exec`).
   → Cole no app em **Inteligência → Sincronização → "URL do Web App (envio)"**.

### 3. Publicar o CSV (URL de LEITURA)
1. Na planilha: **Arquivo → Compartilhar → Publicar na web**.
2. Em "Vincular", escolha a aba **Testes** e o formato **Valores separados por vírgula (.csv)**.
3. **Publicar** e copie a URL (contém `/pub?...output=csv`).
   → Cole no app em **"URL CSV publicada (leitura)"**.

> A aba **Testes** é criada automaticamente no primeiro envio. Se ainda não existir,
> envie um teste pelo app uma vez (passo 4) e depois faça o passo 3.

### 4. No app
1. Abra **Inteligência → Sincronização**, cole as 2 URLs e toque em **💾 Salvar configuração**.
2. Daí em diante, ao tocar em **💾 Salvar no histórico** (na Planilha de Resultados),
   o teste também é enviado para a planilha. Sem internet, fica **pendente** e é
   reenviado automaticamente depois (ou no botão **🔄 Reenviar pendentes**).
3. Para ver o consolidado de todas: **☁️ Ver dados da nuvem**. Para voltar ao aparelho:
   **📱 Ver dados locais**. Os relatórios (PDF/Excel/Word/ODT) seguem a fonte exibida.

---

## Observações

- **Privacidade / LGPD:** a planilha conterá nome do aplicador, escola e data — **não há
  dados de estudantes** (o app só registra contagens da escala hedônica). Mantenha a
  planilha restrita à gestão (não compartilhe edição publicamente; o "publicar na web"
  expõe apenas leitura do CSV — se preferir não expor, use só o envio e baixe a planilha).
- **Atualizar o código depois:** ao editar o `Code.gs`, faça **Implantar → Gerenciar
  implantações → editar → Nova versão**. A URL `/exec` permanece a mesma.
- **Segurança do endpoint:** "Qualquer pessoa" é necessário para o envio sem login do
  navegador. O endpoint só *insere/atualiza* linhas (dedupe por id) e não lê dados.
  Se quiser restringir, dá para adicionar um "token" simples no `Code.gs` e no app
  (peça que eu implemente, se necessário).
