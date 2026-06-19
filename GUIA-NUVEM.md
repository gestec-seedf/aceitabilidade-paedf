> ⚠️ **LEGADO (não usar).** O backend migrou para o **Supabase** — veja
> [`GUIA-SUPABASE.md`](GUIA-SUPABASE.md). Este guia e o `google-apps-script/Code.gs`
> ficam só como referência histórica.

# Guia — Sincronização com a Nuvem (Planilha Google)

Reúne os testes preenchidos por **várias nutricionistas, em aparelhos diferentes**, em uma
**Planilha Google central**. O **Painel de Inteligência (BI)** mostra o consolidado de
**todas as escolas** — e só abre para quem tiver a **senha de acesso**.

> O app continua sendo um site estático (GitHub Pages). Ele apenas conversa com uma URL da
> própria gestão (Apps Script). A **URL de envio já vem embutida no app**, então qualquer
> aparelho que abrir o app já envia os testes automaticamente, sem configurar nada.

## Como funciona (visão geral)

- **Envio (escrita):** automático e obrigatório. Cada **💾 Salvar no histórico** envia o
  teste para a planilha central. Sem internet, fica pendente e é reenviado sozinho depois.
- **Leitura (BI):** protegida por **senha**. O painel só carrega os dados depois que a
  pessoa digita a credencial. A senha é validada pelo Apps Script — **o segredo vive na
  conta Google da gestão, nunca no código público do app**. (Por isso não há mais CSV
  público: os dados não saem por nenhum link aberto.)

---

## Configuração (faça uma vez, na conta Google da gestão)

### 1. Criar a planilha e colar o código
1. Crie uma **Planilha Google** (ex.: "Aceitabilidade PAE-DF — Base").
2. Menu **Extensões → Apps Script**.
3. Apague o conteúdo e **cole o conteúdo de `google-apps-script/Code.gs`**.

### 2. Definir a SENHA de acesso ao BI
1. No topo do `Code.gs`, troque o placeholder:
   ```js
   var READ_TOKEN = 'TROQUE-ESTA-SENHA';   // ← coloque aqui a senha da gestão
   ```
2. **Importante:** defina a senha **aqui no editor do Apps Script**, não no repositório
   (o repositório é público). Salve.

### 3. Publicar o Web App
1. No editor do Apps Script: **Implantar → Nova implantação**.
2. Engrenagem → tipo **App da Web**.
3. **Executar como:** Eu (sua conta). **Quem pode acessar:** **Qualquer pessoa**.
4. **Implantar** e autorizar o acesso quando solicitado.
5. A **URL `/exec`** gerada já é a que está embutida no app. (Se você criar uma planilha
   nova/URL diferente, peça para atualizar a URL embutida em `nuvem.js`.)

> A aba **Testes** é criada automaticamente no primeiro envio.

### 4. Usar no app
- **Enviar:** qualquer aparelho que abrir o app já envia ao salvar. Nada a configurar.
- **Ver o BI:** abra **Inteligência**, digite a **senha** e toque em **🔓 Entrar**. O painel
  carrega o consolidado de todas as escolas. O login fica **lembrado no aparelho** (use
  **🚪 Sair** para esquecer). **🔄 Atualizar dados da nuvem** recarrega os números.

---

## Atualizar o código depois
Ao editar o `Code.gs` (inclusive trocar a senha): **Implantar → Gerenciar implantações →
editar (lápis) → Versão: Nova versão → Implantar**. A URL `/exec` **permanece a mesma**.

## Observações
- **Privacidade / LGPD:** a planilha contém nome do aplicador, escola e data — **não há
  dados de estudantes** (o app só registra contagens da escala hedônica). Como não existe
  mais CSV público, os dados só são lidos por quem tem a senha.
- **Trocar a senha:** edite `READ_TOKEN` no Apps Script e implante uma **Nova versão**.
  Quem já estava logado nos aparelhos será deslogado automaticamente no próximo acesso
  (a senha guardada deixa de valer) e precisará digitar a nova.
- **Endpoint de envio aberto:** "Qualquer pessoa" é necessário para o envio sem login.
  O envio só *insere/atualiza* linhas (dedupe por id) e **não lê** dados sem a senha.
