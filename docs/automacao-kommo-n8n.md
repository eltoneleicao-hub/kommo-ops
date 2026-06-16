# Automação Kommo + n8n — Referência Completa

> **O que é este documento:** catálogo exaustivo de **tudo o que dá pra automatizar** na Kommo (ex-amoCRM) e no n8n, organizado por camada e por função do funil. Compilado a partir de pesquisa na documentação oficial (developers.kommo.com, kommo.com/support, docs.n8n.io) em **junho/2026**.
>
> **Atenção a datas:** a Kommo re-tarifou os planos em **01/jun/2026** (Webforms viraram Pro-only para novas conexões; AI Agent saiu do Base para novos usuários; etc.). Confirme sempre na página de preços ao contratar.
>
> **Legenda de camadas:**
> - 🟢 **Nativo** = Salesbot + Digital Pipeline + Kommo AI (sem código, dentro da Kommo)
> - 🔵 **API** = REST API v4 chamada pelo backend (Next.js)
> - 🟣 **n8n** = orquestrador visual (cola com terceiros)
> - 🧠 **IA** = transversal (Kommo AI nativo ou LLM externo)
>
> **Confiança:** ✅ confirmado em doc oficial · ⚠️ inferido/legado (validar na conta).

---

## Índice

1. [Modelo mental — as 4 camadas](#1-modelo-mental--as-4-camadas)
2. [Salesbot — catálogo completo](#2-salesbot--catálogo-completo)
3. [Digital Pipeline & gatilhos](#3-digital-pipeline--gatilhos)
4. [Kommo AI nativo](#4-kommo-ai-nativo)
5. [Omnichannel, telefonia, formulários & broadcast](#5-omnichannel-telefonia-formulários--broadcast)
6. [API v4 — catálogo de entidades e endpoints](#6-api-v4--catálogo-de-entidades-e-endpoints)
7. [n8n — catálogo de nós](#7-n8n--catálogo-de-nós)
8. [Receitas ponta-a-ponta](#8-receitas-ponta-a-ponta)
9. [Planos & limites (consolidado)](#9-planos--limites-consolidado)
10. [Arquitetura recomendada para este projeto](#10-arquitetura-recomendada-para-este-projeto)
11. [O que NÃO dá pra automatizar](#11-o-que-não-dá-pra-automatizar)
12. [Fontes](#12-fontes)

---

## 1. Modelo mental — as 4 camadas

| Camada | O que é | Quando usar |
|---|---|---|
| 🟢 **Nativo Kommo** | Salesbot + Digital Pipeline + Kommo AI | Lógica de conversa, mover etapa, setar campo, tags, follow-up, IA de atendimento |
| 🔵 **API v4** | Backend chamando a REST API | Quando toca *seus* sistemas: estoque, etiqueta, fila de impressão, lógica pesada |
| 🟣 **n8n** | Orquestrador visual | Cola com terceiros: pagamento, Sheets/BI, ERP/Bling, IA externa, transportadora |
| 🧠 **IA** | Kommo AI nativo **ou** LLM via n8n/backend | Interpretar texto livre, classificar intenção, extrair dados bagunçados |

**Regra de decisão:** fique no 🟢 nativo até precisar de (a) *seus* dados/sistemas → 🔵 API; (b) um *terceiro* que a Kommo não alcança → 🟣 n8n; (c) *interpretação inteligente* de texto livre → 🧠 IA.

**Distinção crítica:** **Salesbot** (fluxo determinístico, regras/botões/condições) ≠ **Kommo AI Agent** (agente LLM autônomo com base de conhecimento). São ferramentas complementares.

---

## 2. Salesbot — catálogo completo

Construtor de bots arrastar-e-soltar. Tem duas faces: o **Bot Builder** no-code (Steps/Actions) e a **camada de handlers JSON** (`salesbot-dp`) que os steps compilam.

### 2.1 Steps (13)

| Step | O que faz | Parâmetros principais |
|---|---|---|
| **Message** | Envia texto/template | **Botões quick-reply (máx 13, ideal ≤3)**, botões URL, anexos (doc/img/vídeo/áudio/voz); ramo Enviado→Entregue vs Falhou |
| **List message (WhatsApp)** | Lista interativa | **Até 10** opções estruturadas em seções (só WhatsApp) |
| **Condition** | Ramifica por valor | Base: mensagem do cliente, código do chat, messenger, fonte do lead, status da conversa, campos de lead/contato/empresa, NPS |
| **Comment** | Auto-resposta a comentários do Instagram | Texto + condição de palavra-chave |
| **Pause** | Pausa até evento/timer | Mensagem recebida; **timer (máx 8760h/60min/60s)**; fora de expediente; vídeo aberto/fechado |
| **Validation** | Valida mensagem do cliente | Operadores: **equals, does not equal, contains, does not contain, length, regular expression**; tipos: número, letra, telefone, email, faixa numérica |
| **Send internal message** | Mensagem interna (invisível ao cliente) | Texto + usuários/times destino |
| **Subscribe (Meta)** | Opt-in p/ reabrir janela de 24h da Meta | Tags + título (só canais Meta) |
| **Go to another step** | Pula para outro step | Permite loops (re-perguntar) e convergir ramos |
| **Start bot** | Lança outro bot (handoff/encadeamento) | Bot destino |
| **Custom step (Code)** | JSON/código bruto de handlers | **Máx 64 KB**; numeração de steps começa em 0 |
| **Widget** | Bloco de widget de terceiro/custom (Stripe, Mailer, **LLM**) | Configurações por widget; define saídas success/fail |
| **Round Robin** | Distribui em rotação (load-balance, A/B) | **Mín 2, até 100 ações**; reseta se editar |

**Terminador:** `Stop` é o passo final implícito; o bot também para quando a conversa fecha. Round Robin o torna recorrente.

### 2.2 Actions (16)

| Action | Automatiza | Handler |
|---|---|---|
| **Set field** | Preenche custom field | `set_custom_fields` — fonte **client message** ou **manual input** |
| **Change lead status** | Move lead de etapa | `change_status` (`value:<id da etapa>`) |
| **Change responsible user** | Reatribui responsável | `change_responsible_user` |
| **Change conversation status** | Fecha/marca conversa | — |
| **Add note** | Escreve nota no card | `add_note` |
| **Add task** | Cria tarefa | prazo/responsável/tipo |
| **Complete task** | Conclui tarefa(s) | — |
| **Manage tags** | Adiciona/remove tags (pode criar) | `set_tag` / `unset_tag` |
| **Manage subscribers** | Add/remove inscritos nas notificações | `subscribe` / `unsubscribe` |
| **Generate form** | Envia formulário p/ coletar dados | pode criar leads |
| **Create lead** | Cria lead | valor, tags, contatos, empresa, etapa |
| **Send email** | Envia email com template | requer email conectado |
| **Send webhook** | POST p/ app externo | URL + payload (fire-and-forget) |
| **Meta Conversions API** | Envia eventos de conversão à Meta | — |

**Actions extras via Custom/Code step:** `unsorted` (aceitar/recusar incoming lead), `set_budget` (matemática `+ - * /`), `add_linked_company`, `link` (vincular entidades + quantidade — anexar produto), `find` (`contact_double`/`catalog_elements`), `filter`.

### 2.3 Variáveis (placeholders)

**Da mensagem:** `{{message_text}}` (última msg do cliente), `{{message_text.email}}`, `{{message_text.phone}}`, `{{regexp./padrão/}}` (captura regex), `{{last_validation_result}}`.

**Entidades:** `{{contact.name}}`, `{{name}}`, `{{lead.id}}`, `{{lead.cf(ID)}}` / `{{lead.cf.#id#}}`, `{{contact.cf.#id#}}`, `{{lead.price}}`, `{{lead.status}}`, `{{lead.pipeline}}`, `{{lead.responsible.name/email/id}}`.

**Find/widget:** `{{founded_id}}`, `{{contact_double.*}}`, `{{json.*}}` (resposta de um Widget/widget_request).

**Sistema:** `{{origin}}` (canal), `{{current_date}}`, `{{rand}}`, `{{short_rand_num}}` (4 dígitos), `{{cf.talk.nps}}`.

**Especiais de escrita (Set field):** `{reset}` limpa campo/apaga tags; `1`/`0` ligam/desligam checkbox.

**Modificadores (pipe `:`):** datas `:df(d.m.Y)`/`:addworkdays(n)`; texto `:upc`/`:lwc`/`:trim`/`:replace(a,b)`/`:toNumeric`/`:ifempty(x)`; números `:round(n)`/`:format(2)`/`:currencyConvert(USD)`/`:calc`; lógica `:if(=|>|<|in|match,…)`.

### 2.4 Widget / Code step — chamar LLM externo

O mecanismo `widget_request`:
1. Bot faz POST p/ sua URL com `{ token: <JWT>, data: { message: "{{message_text}}" }, return_url }`.
2. `token` é JWT assinado com o secret da sua integração — **valide**.
3. Seu serviço **responde HTTP 200 em até 2 segundos**.
4. Pra continuar, POST de volta no `return_url` com `execute_handlers` (`show`, `goto`, `conditions`, `exits`). A resposta vira `{{json.*}}`.

Padrão LLM: manda `{{message_text}}` → seu endpoint chama o modelo → responde no `return_url` com `show:text` (resposta) e/ou `conditions` (ramificar por intenção). **Requer plano Advanced+** (WebSDK).

### 2.5 Gatilhos de lançamento do bot

- **Pipeline:** criado numa etapa / movido p/ etapa / movido-ou-criado / responsável mudou (timing: já / +5min / +10min / +1dia / custom)
- **Conversa:** conversa iniciada por msg recebida/enviada/qualquer; msg recebida/enviada (com cooldown); X horas após última msg recebida (inatividade); conversa fechada; msg vista; menção em story IG
- **Comportamento:** formulário enviado, email recebido, ligação recebida, site/página visitada
- **Agendado:** N horas antes/depois de um campo-data; data+hora fixa; diário/semanal/mensal/anual
- **Tag adicionada/removida** ⚠️ **Enterprise only** (cap 25.000/h)
- **Campo atualizado** ⚠️ **Enterprise only** (cap 25.000/h; exclui Nome e Valor)

**Condições anexáveis ao gatilho:** Tags / Não tem tags (E/OU), etapa, responsável, faixa de preço (Sale), fonte, **UTM** (match/contém/vazio), horário ativo, status da mensagem.

### 2.6 Templates prontos (13)

Saudação · horário/away · alerta espera >5min · alerta janela Meta 24h · **roteamento por necessidade** · engajar comentários sociais · fechar conversa inativa (5d) · agendador de campanha · **roteamento por palavra-chave** · aviso de leitura · **follow-up após 3d sem resposta** · feedback por emoji · captura de opt-in.

### 2.7 Plano & limites

- **Rodar** bot requer **Advanced+** (Base configura mas **não executa**).
- Widget custom / WebSDK / `widget_request`: **Advanced+**.
- Tag/Field triggers: **Enterprise**.
- Limites: botões 13 · list 10 · timer 8760h · Round Robin 2–100 · Code 64KB · widget ACK 2s · **máx 500 ações/sessão**.

---

## 3. Digital Pipeline & gatilhos

Automação anexada a cada etapa do funil. Entrada: **Leads → Setup/Automatizar → etapa → Add Trigger**.

### 3.1 Ações de etapa

| Ação | O que faz |
|---|---|
| **Salesbot** | Lança um bot na etapa |
| **Add Task** | Cria tarefa (prazos: imediato, fim do dia, 1d, 3d, fim de semana, custom) |
| **Complete Tasks** | Fecha tarefas que batem condições |
| **Create Lead** | Cria novo lead a partir do atual (copia campos) |
| **Change Lead Stage** | Move o lead automaticamente |
| **Change Lead's User** | Reatribui responsável |
| **Change Field** | Edita/preenche campo em massa |
| **Add Tags** | Adiciona/remove tags |
| **Send Email** | Email automático com template (Advanced+) |
| **Send Webhook** | Envia dados a uma URL externa |
| **Generate Form** | Cria formulário de atualização ou de captação |
| **Delete Files** | Apaga arquivos por regra |
| **Facebook ads / Google Ads** | Add/remove lead em audiência de retargeting (**Pro+**) |
| **Mailing list subscribe/unsubscribe** | Inscreve/desinscreve em listas |

> Não há bloco "enviar WhatsApp" avulso na etapa — mensagens a messengers saem pelo **Salesbot (Message step)**.

### 3.2 Taxonomia de gatilhos

Igual à do Salesbot (§2.5): **Pipeline · Conversacional · Comportamento · Agendado · Tag (Enterprise) · Campo (Enterprise)**.

### 3.3 Captação & deduplicação

**Incoming Leads (Unsorted):** leads de fontes desconhecidas caem aqui; aceitar (✓) / recusar (🗑) / mesclar (🔗). Ligado por padrão ao configurar uma fonte. Salesbot pode auto-aceitar via `unsorted`.

**Duplicate Control:** detecção por **BIG DATA (ML), Tracking Pixel, email, telefone, campo custom**. Toggles por fonte; escopo de busca por pipeline/etapa; resolução de conflito (atualizar existente vs não mexer); até 3 duplicatas (>3 não mescla). Finder manual: Leads → "…" → Find duplicates.

### 3.4 Email, tarefas, tags, retargeting, notificações

- **Email** (Advanced+): template + condição + delay; remetente pessoal ou corporativo; link de descadastro; "aplicar aos leads já na etapa". Sequência/drip = vários Send Email em etapas diferentes.
- **Tarefas:** auto-criar/completar; tipos; prazos.
- **Tags:** auto add/remove; roteamento por condição de tag.
- **Ads:** Facebook Custom Audiences + Google Customer Match (entram na etapa, saem ao mudar). **Pro+** (conexões antigas grandfathered). Google exige conta com US$ 50k+ de gasto.
- **Notificações:** Send internal message, Subscribe/Unsubscribe, notification center para incoming leads desligado.

---

## 4. Kommo AI nativo

Suíte embutida em **Settings → Kommo AI**. Roda em **créditos mensais** (resetam, não acumulam; topo-up pago). **Funciona em português** (idioma = idioma da UI).

| Recurso | O que faz | Plano |
|---|---|---|
| **AI Agent** | Agente autônomo 24/7; modelo **WHEN / DO / MORE**; responde só a mensagens recebidas; pode pedir info, atualizar lead, **handoff p/ humano**; persona (tom/idioma/delay) | Advanced (até 3) / Pro (até 50) |
| **AI Sources** | Base de conhecimento: **URL (até 1500 págs)**, arquivo PDF/DOC (**máx 45MB**), texto direto. Trial 10 / pago até 100 | Pago |
| **Suggested Replies** | Sugere resposta antes de enviar | Base |
| **Conversation Summary** | Resume conversa numa nota | Base |
| **Rewriter** | Reescreve (Profissional/Amigável/Curto/Longo/Corrigir) | Base |
| **Suggestions** | Aponta erros (gramática, tom, tamanho) | Base |
| **Task Suggestion** | Detecta ação → cria tarefa | Base (default-on Enterprise) |
| **Sentiment Analysis** | Positivo/negativo/neutro | — |
| **Copilot** | Sugere valores de campo do histórico, resume lead, responde how-to | Base / **Advanced** (sugestão de campo) |
| **Voice-to-text** | Transcreve áudios recebidos | **Pro** |
| **AI booking** | Agenda na conversa | **Pro** |
| **AI Lead Scoring** | Pontua leads | **Pro & Enterprise** |

**Limites de uso:** Trial ~100 req/mês; Enterprise ~10.000 req/mês. Existe **API de AI** para adicionar fontes (file/text/URL) e importar produtos do CRM.

---

## 5. Omnichannel, telefonia, formulários & broadcast

### 5.1 Canais de mensagem

WhatsApp Business (**WABA** oficial — janela 24h + templates Utility/Marketing/carousel/flow) · **WhatsApp Lite** (QR, grátis) · Instagram (DM + **comentários**) · Facebook Messenger · Telegram (4096 chars) · Viber · WeChat · TikTok · Apple Messages for Business · **Live Chat** (widget no site) · Email (Gmail/IMAP) · SMS (Twilio/RingCentral/AlphaSMS/Fromni). Todos suportam bot.

### 5.2 Produtividade no chat

Templates de resposta (texto/mídia/botões/emoji, merge fields `[Nome]`, invocados por `/` slash ou ícone raio) · WhatsApp templates (aprovação Meta 1min–48h) · distribuição (Change Responsible + Round Robin) · horário ativo/away.

### 5.3 Broadcast / disparo em massa (**Advanced+**, admin)

1:1 privado (não é grupo). Canais: WhatsApp, IG, FB, TikTok, Telegram, Viber, WeChat, Apple, SMS, Slack, Intercom. Segmenta por tag/etapa/segmento. Agenda ("enviar após aprovação"). Anexa bot p/ responder cliques. Limites de caracteres: WA 1024 / IG-FB 1000 / Telegram 4096; **máx 3 botões**. WhatsApp exige opt-in + template aprovado.

### 5.4 Telefonia / Calls

Sem operadora própria, mas tem **softphone WebRTC embutido** + API/SDK VoIP. Capacidades: click-to-call, caller ID, log de chamadas (+ bulk), **smart forwarding** (roteia p/ responsável), call-from-webhook, auto-criar contato/lead de número desconhecido, analytics. IVR e gravação dependem do provedor. Integrações: Twilio, RingCentral, Zadarma, OnlinePBX, Ringostat, CloudTalk, CallHippo, JustCall, GoTo, Voximplant, etc.

### 5.5 Formulários & captação

Webform no-code (embed HTML / página / WordPress) ⚠️ **Pro-only p/ novas conexões desde 01/jun/2026** · chat button / Engagement page · **Facebook/Instagram Lead Ads** (import automático) · **Business Card Scanner** (mobile) · Calendly · Google Sheets/Forms · Lead Scraper (Chrome) · email parsing · API (`/leads`, `/leads/complex`).

---

## 6. API v4 — catálogo de entidades e endpoints

**Base:** `https://{subdomínio}.kommo.com/api/v4` · **Auth:** OAuth2 ou **long-lived token** (Bearer) · **Formato:** JSON HAL (`_embedded`/`_links`).

### 6.0 Limites globais

| Limite | Valor |
|---|---|
| Rate limit | **≤ 7 req/s** (429 → 403 se insistir) |
| Lote add/update | **≤ 250** (recomendado **≤ 50**) |
| Custom fields por entidade (complex) | **40** |
| Pipelines | 50 · Etapas/pipeline 100 |
| Webhooks | 100 · Listas/catálogos 10 (1 do tipo products) · Sources 100/integração |

### 6.1 Leads ✅

`GET /leads` · `GET /leads/{id}` · `POST /leads` · **`POST /leads/complex`** (lead+contato+empresa de uma vez) · `PATCH /leads` (lote) · `PATCH /leads/{id}` · loss_reasons.
Campos graváveis: `name`, `price`, **`status_id`**, **`pipeline_id`**, `responsible_user_id`, `loss_reason_id`, `custom_fields_values[]`, `_embedded` (tags, contacts, companies, **catalog_elements**).
Mover etapa: `PATCH /leads/{id}` `{ "status_id":…, "pipeline_id":… }`. IDs reservados: **142=Ganho, 143=Perdido**.

**Incoming/Unsorted:** `GET /leads/unsorted` · `POST /leads/unsorted/forms` · `POST /leads/unsorted/{uid}/accept` · `DELETE /leads/unsorted/{uid}/decline` · `POST /leads/unsorted/{uid}/link`.

### 6.2 Contacts & Companies ✅

`GET|POST|PATCH /contacts[/{id}]` · `GET|POST|PATCH /companies[/{id}]`. Telefone/email no contato via `multitext` com `enum_code` (WORK/MOB/HOME).

### 6.3 Custom fields & grupos ✅

`GET|POST|PATCH|DELETE /{entity}/custom_fields[/{id}]` · `…/custom_fields/groups`. `{entity}` = leads/contacts/companies/customers/catalogs. **Pode criar campos via API.**

**23 tipos:** `text`, `numeric`, `checkbox`, `select`, `multiselect`, `date`, `url`, `textarea`, `radiobutton`, `streetaddress`, **`smart_address`** (estruturado), `birthday`, `legal_entity`, `date_time`, `price`(lista), `category`(lista), `tracking_data`, `linked_entity`(lista), **`chained_list`**(lead, até 5 catálogos), `monetary`, `file`, **`multitext`**(contato: phone/email com subtipo).

Shapes de valor:
```json
{ "field_id": 3,   "values": [{ "value": "texto" }] }          // text/textarea
{ "field_id": 103, "values": [{ "value": "1.5" }] }            // numeric
{ "field_id": 11,  "values": [{ "value": "opção" }] }          // select por texto
{ "field_id": 111, "values": [{ "enum_id": 17 }] }             // select por enum_id (robusto)
{ "field_id": 5,   "values": [{ "value": true }] }             // checkbox
{ "field_id": 9,   "values": [{ "value": 1577836800 }] }       // date (unix)
```
Limpar campo: `"values": null`.

### 6.4 Catalogs/Lists (produtos) ✅

`GET|POST|PATCH /catalogs[/{id}]` · `…/catalogs/{id}/elements`. Produtos carregam SKU/preço/estoque como custom fields do catálogo. **Vincular produto ao lead** (relevante para venda física):
```json
POST /api/v4/leads/{id}/link
{ "to_entity_id": 10, "to_entity_type": "catalog_elements",
  "metadata": { "quantity": 1, "catalog_id": XXXX } }
```

### 6.5 Tasks / Notes / Tags ✅

- **Tasks:** `GET|POST|PATCH /tasks` — `text`, `complete_till`(obrig), `task_type_id`, `entity_id`+`entity_type`, `responsible_user_id`(obrig). Tipos default: 1=Follow-up, 2=Meeting.
- **Notes:** `POST /{entity}/notes` — tipos: `common`, `call_in/out`, `service_message`, `extended_service_message`, `sms_in/out`, `geolocation`, `attachment`. Pin/unpin.
- **Tags:** `GET|POST /{entity}/tags`; aplicar via `_embedded.tags` na atualização ou endpoint dedicado.

### 6.6 Pipelines & Statuses ✅

`GET|POST|PATCH|DELETE /leads/pipelines[/{id}]` · `…/pipelines/{id}/statuses[/{status_id}]`. Pode **criar pipelines e etapas via código**.

### 6.7 Events (log de auditoria, read-only) ✅

`GET /events` · `GET /events/types`. ~70 tipos, incluindo: `lead_added`, `lead_status_changed`, `custom_field_value_changed`, `entity_responsible_changed`, `entity_tag_added`, `incoming_chat_message`, `outgoing_chat_message`, `task_completed`, `robot_replied`, `intent_identified`⚠️, `nps_rate_added`, `ai_result`⚠️, `entity_merged`, `talk_created/closed`. **Não dá pra POSTar eventos** (só observar).

### 6.8 Webhooks ✅ (Advanced+)

`GET|POST|DELETE /webhooks`. Payload **form-urlencoded aninhado** (`leads[status][0][id]`), **não JSON**. Responder em 2s; retries +5/+15/+15min/+1h. Eventos:

| Entidade | Eventos |
|---|---|
| **Leads** | `add_lead`, `update_lead`, `delete_lead`, `restore_lead`, **`status_lead`** (etapa), `responsible_lead`, `note_lead` |
| **Contacts/Companies** | `add_/update_/delete_/restore_/responsible_/note_` |
| **Tasks** | `add_task`, `update_task`, `delete_task`, `responsible_task` |
| **Mensagens** | **`add_message`** (msg recebida), `add_talk` |
| **Catálogo** | elemento add/update/delete |

> ⚠️ Não há webhook por-campo específico: `status_lead` dispara na mudança de etapa; outras edições só no genérico `update_lead` (você faz o diff).

### 6.9 Outras entidades

- **Calls:** `POST /calls` (log + recording), `POST /calls/notification` (popup caller-ID). Casa por últimos 10 dígitos.
- **Files:** host `/v1.0` — upload **em chunks** (session + parts), attach via `/{entity}/{id}/files`. Plug no tipo `file` e em notas `attachment`.
- **Users & Roles:** `GET|POST /users`, ativar/desativar, `GET|POST|PATCH|DELETE /roles`. Permissões A/G/M/D por ação.
- **Sources:** `GET|POST|PATCH|DELETE /sources` — `external_id` único, `pipeline_id`, `waba`. Máx 100.
- **Customers/Buyers** ⚠️ (recorrência/LTV): existe (`customers_mode` no Account), mas páginas de doc deprecadas — validar `/customers`, `/customers/transactions` na conta.
- **Widgets:** `GET|POST|DELETE /widgets/{code}` (instalar/configurar).
- **Account:** `GET /account` (+`with=amojo_id,task_types,users_groups,...`) — currency, locale, drive_url.
- **Chats/Messaging API:** host separado `amojo.kommo.com`, HMAC; registrar canal, criar chat, enviar/importar mensagens, reactions, typing, status.
- **Salesbot API:** `GET /salesbots`, **`POST /salesbots/run`** (disparar bot num lead), stop.

---

## 7. n8n — catálogo de nós

> Não existe nó-trigger oficial da Kommo. Entrada = **Webhook node** recebendo o webhook da Kommo; saída = **HTTP Request** → API v4 (caminho de produção). Há um community node `n8n-nodes-kommo` (Leads/Contacts/Companies/Notes/Tasks/Lists, com dropdown de status), mas **só self-hosted** e ~2 anos sem atualizar.

### 7.1 Triggers

**Webhook** (ingress Kommo — URLs Test vs **Production**; só dispara com workflow ativo) · **Schedule/Cron** · Manual · **Error Trigger** · Execute Sub-workflow Trigger · **Form Trigger** · **Chat Trigger** · Email Trigger (IMAP) · Local File · RSS · MQTT/AMQP/RabbitMQ · triggers de apps (Gmail, Telegram, Stripe, Sheets…).

### 7.2 Lógica / controle de fluxo

**HTTP Request** (caminho p/ Kommo + Mercado Pago/Bling/qualquer REST) · **Code** (JS/Python — normalizar webhook urlencoded, montar `custom_fields_values`) · **Edit Fields (Set)** · **IF** · **Switch** · **Merge** · **Loop Over Items (Split in Batches)** (chave p/ respeitar 7 req/s) · **Filter** · **Wait** (tempo/webhook/form → human-in-the-loop) · **Respond to Webhook** · Execute Sub-workflow · Aggregate · Sort · Limit · Date & Time · **Crypto** (validar HMAC) · HTML · Markdown · XML · Remove Duplicates · Split Out · Convert/Extract File · Summarize (agregação não-IA) · Stop And Error.

### 7.3 IA / LangChain (modelo cluster: root + sub-nós)

- **AI Agent** (Tools Agent) — loop raciocínio→ferramenta→síntese; pluga Chat Model + Memory + Tools + Output Parser.
- **Chains:** Basic LLM Chain · Q&A Chain (RAG) · Summarization Chain.
- **Processadores estruturados (ouro p/ CRM):** **Information Extractor** (texto livre → JSON por schema; "Generate From JSON Example") · **Text Classifier** (intenção/categorias) · **Sentiment Analysis**.
- **Chat Models:** **Anthropic (Claude)**, OpenAI, Gemini, Azure, Bedrock, Mistral, Groq, **Ollama** (local), OpenRouter, xAI.
- **Memory:** Simple, Postgres, Redis, MongoDB, Zep.
- **Output Parsers:** **Structured Output Parser** (JSON garantido), Auto-fixing, Item List.
- **Tools:** **HTTP Request Tool** (agente chama a API da Kommo direto), Call n8n Workflow Tool, Code Tool, MCP Client, Vector Store QA, Calculator/Wikipedia/SerpApi.
- **Vector Stores / Embeddings / Loaders / Splitters / Retrievers** — stack RAG completo (Pinecone, Qdrant, Supabase, PGVector, in-memory).

### 7.4 Integrações úteis p/ este negócio

Google Sheets · Gmail/Send Email/IMAP · Google Calendar/Drive · **WhatsApp Business Cloud** (oficial) · **Twilio** · **Evolution API** (community, WhatsApp não-oficial, popular no BR — self-host) · Telegram · Slack · Discord · Notion · Airtable · Postgres/MySQL/Supabase · **Stripe** (+ trigger) · **Mercado Pago** (sem nó nativo → HTTP) · **Bling/ERP** (sem nó nativo → HTTP).

### 7.5 Confiabilidade & limites

- **Self-hosted vs Cloud:** community nodes só rodam **self-hosted/Docker** (no Cloud, só verificados → use HTTP Request).
- **Queue mode** (`EXECUTIONS_MODE=queue` + Redis + workers `n8n worker`, `--concurrency` default 10) p/ escalar.
- **Retry On Fail** + **Wait Between Tries** (absorve 429) · **Continue On Fail** · **Error Workflow** (Error Trigger → Slack).
- **Gotchas:** Cloud cobra **por execução**; webhook Kommo vem **urlencoded aninhado** (normalize com Code); registre a **Production URL** (não a Test); respeite 7 req/s com Loop+Wait.

**Arquitetura de referência:** `Kommo webhook → Webhook → Code (normaliza) → Text Classifier (intenção) → Switch → {AI Agent + Claude + HTTP Request Tool→Kommo} | {Information Extractor → Set → HTTP→Kommo} → WhatsApp/Telegram reply → Respond to Webhook`, com Error Workflow central.

---

## 8. Receitas ponta-a-ponta

> ✅ template/use-case documentado · 🔧 montado a partir de primitivos documentados.

### 8.1 Captação & intake
| Receita | Camada | Como |
|---|---|---|
| Capturar WA/IG/FB → 1 pipeline | 🟢 | Canal conectado cria lead em Incoming ✅ |
| Source/UTM tagging | 🔵🟢 | Backend grava UTM / DP add tag por fonte ✅ |
| Auto-aceitar Unsorted | 🔵 | `POST /leads/unsorted/{uid}/accept` ✅ |
| Dedupe/merge | 🟢 | Duplicate Control ✅ |
| Form site → CRM + WhatsApp + Sheet | 🟣 | Webhook → Kommo + WhatsApp + Sheets ✅ (n8n #7424) |

### 8.2 Qualificação & roteamento
| Receita | Camada | Como |
|---|---|---|
| Bot saudação + perguntas + move etapa | 🟢 | Message + Set field + Change status ✅ |
| Roteamento por palavra-chave | 🟢 | Condition na mensagem ✅ |
| Round-robin | 🟢 | Change Responsible + Round Robin ✅ |
| Lead scoring | 🟢 | Nativo (Pro+) ✅ |
| Classificar intenção por IA + rotear | 🧠🟣 | WhatsApp Trigger → AI classifier → router ✅ (n8n #13450) |
| BANT + agendar call | 🧠🟣 | GPT BANT → Calendar + Slack + Sheets ✅ (n8n #15621) |

### 8.3 Coleta de dados (núcleo — endereço/CEP)
| Receita | Camada | Como |
|---|---|---|
| Perguntar nome/CEP/endereço → campo | 🟢 | Message + **Set field "client message"** ✅ |
| Formulário em vez de Q&A | 🟢 | Generate Form / WhatsApp Flows ✅ |
| Validar telefone/email/CEP | 🟢 | Step Validation (regex) ✅ |
| **Extrair endereço de texto livre** | 🧠🟣 | Information Extractor → PATCH campos ✅ |
| CEP autocomplete (ViaCEP) | 🟣🔵 | Webhook campo → HTTP CEP → PATCH 🔧 |
| Confirmar endereço de volta | 🟢 | Message + botões + Condition 🔧 |

### 8.4 Conversa
Auto-reply/FAQ 🟢✅ · horário/away 🟢✅ · **nudge sem-resposta** 🟢✅ · drip agendado 🟢✅ · winback 🟢🔧 · recuperar conversa abandonada (Pause→Go to step) 🟢✅ · auto-responder IA local (Ollama) 🟣✅ (n8n #15044).

### 8.5 Vendas & checkout
Enviar preço 🟢✅ · **anexar produto** 🔵✅ · link Stripe 🟢🟣✅ (#2195) · link Mercado Pago 🟣✅ · pagamento confirmado → move etapa + recibo 🟣✅ (#3391) · auto-fatura de template 🟢✅.

### 8.6 Fulfillment (núcleo — etiqueta + estoque)
| Receita | Camada | Como |
|---|---|---|
| Mudança de etapa → gerar etiqueta | 🔵 | DP **Send Webhook** (`status_lead`) → backend renderiza ✅ |
| Deduzir estoque no envio | 🔵🟣 | Backend atualiza DB / ERP 🔧 |
| Alerta estoque baixo | 🟣🔵 | Se qty<min → WhatsApp/Slack ✅ |
| Avisar cliente com rastreio | 🟢🟣 | Webhook transportadora → mensagem ✅ |
| Fila de impressão | 🔵 | Backend pending/printed (já existe) 🔧 |

### 8.7 Pós-venda
Thank-you 🟢✅ · NPS/CSAT ao fechar conversa 🟢✅ · pedido de avaliação 🟢🔧 · lembrete recompra 🟢✅.

### 8.8 Ops, relatórios & sync
Sync leads → Sheets/BI 🟣✅ · digest diário → Slack/WhatsApp 🟣✅ · sync ERP/Bling (HTTP) 🟣✅ · upload arquivos grandes (chunking) 🟣✅ (#3922) · SLA alert 🟢🟣✅ · normalizar webhook urlencoded 🟣✅ (#2548).

### 8.9 IA
AI auto-responder/sugestões 🟢✅ · sentimento/intenção 🧠✅ · resumo de conversa 🟢✅ · task suggestion 🟢✅ · lead scoring 🟢✅ · agente IA em qualquer canal Kommo 🟣✅ (#2841) · extração de dados 🧠🟣✅.

---

## 9. Planos & limites (consolidado)

**Preços (jun/2026):** Base $15 · Advanced $25 · **Pro $45** · Enterprise (custom), por usuário/mês.

| Recurso | Mínimo |
|---|---|
| **Rodar** Salesbot / Digital Pipeline | **Advanced** |
| Webhooks (API) | **Advanced** |
| Broadcasting | **Advanced** |
| WebSDK / widget custom (LLM no bot) | **Advanced** |
| Triggered emails | **Advanced** |
| Webforms (novas conexões) ⚠️ | **Pro** (mudou 01/jun/2026) |
| Lead scoring / voice-to-text / AI booking | **Pro** |
| Ads triggers (FB/Google) | **Pro** (antigos grandfathered) |
| **Tag triggers** e **Field triggers** | **Enterprise** |
| AI Agent | Advanced (3) / Pro (50) |

**Limites técnicos API:** 7 req/s · lote ≤250 (rec. ≤50) · 40 custom fields/request · 100 webhooks · webhook ACK 2s · Salesbot 500 ações/sessão · Tag/Field triggers 25k/h.

---

## 10. Arquitetura recomendada para este projeto

Contexto: backend Next.js já lê leads/contatos via API v4, gera etiquetas e deduz estoque (widget `gerar_etiqueta`); time já trabalha com IA (Sphera Flow).

```
WhatsApp/IG → Kommo
   │
   ├─🟢 Salesbot: saúda, coleta nome/CEP/endereço (Set field + Validation),
   │             confirma de volta, qualifica, move etapa
   │
   ├─🧠 Texto livre bagunçado? → webhook add_message →
   │     backend chama Claude (extrai campos) → PATCH custom_fields
   │     (não precisa de n8n — já há backend + pipeline de IA)
   │
   ├─🔵 Etapa muda p/ "Pago/Enviar" → webhook status_lead →
   │     backend gera etiqueta + deduz estoque + fila de impressão (já existe)
   │
   └─🟣 n8n SÓ onde entra terceiro: link de pagamento (Mercado Pago),
         rastreio de transportadora, sync Bling, digest no Slack
```

**Evolução de maior impacto:** trocar o clique manual no widget por um **webhook automático de `status_lead`** que dispara geração de etiqueta + dedução de estoque sem ação humana.

**Decisão estratégica em aberto:** consolidar a interpretação de IA **no backend** (menos infra, controle total) **ou** via **n8n** (no-code, time mexe sozinho). Dado o backend + IA existentes, o backend tende a ser o caminho de menor manutenção.

---

## 11. O que NÃO dá pra automatizar

- **Nativo não interpreta linguagem natural** — só keyword/regex/botão. Texto livre ("moro perto do mercado") → precisa de 🧠 IA.
- **Nativo não faz lookup externo** — consultar CEP em base, validar contra ERP → só manda webhook fire-and-forget; pra agir na resposta, 🔵 backend ou 🟣 n8n (ou Widget custom Advanced+).
- **WhatsApp fora da janela 24h** — só template aprovado pela Meta.
- **Webhook "campo X mudou" específico** — só Enterprise; no plano comum, `update_lead` genérico + diff manual.
- **Customers/transactions API** — existe mas doc deprecada; validar na conta.
- **Parsing/transformação complexa** além de regex — IA/código.

---

## 12. Fontes

**Kommo — API:** [updating leads](https://developers.kommo.com/reference/updating-single-lead) · [custom fields](https://developers.kommo.com/reference/custom-fields) · [pipelines & stages](https://developers.kommo.com/reference/leads-pipelines-and-stages) · [incoming leads](https://developers.kommo.com/reference/incoming-leads) · [lists/catalogs](https://developers.kommo.com/reference/lists) · [link entities](https://developers.kommo.com/reference/link-entities) · [tasks](https://developers.kommo.com/reference/tasks) · [notes types](https://developers.kommo.com/reference/notes-types) · [events types](https://developers.kommo.com/reference/events-types) · [webhook events](https://developers.kommo.com/reference/webhook-events) · [webhooks general](https://developers.kommo.com/docs/webhooks-general) · [calls](https://developers.kommo.com/reference/calls) · [files](https://developers.kommo.com/reference/files-api) · [users & roles](https://developers.kommo.com/reference/users-and-roles) · [sources](https://developers.kommo.com/reference/sources) · [account](https://developers.kommo.com/reference/account-parameters) · [limitations](https://developers.kommo.com/docs/limitations) · [OAuth2](https://developers.kommo.com/docs/oauth-20) · [long-lived token](https://developers.kommo.com/docs/long-lived-token) · [llms.txt](https://developers.kommo.com/llms.txt)

**Kommo — Salesbot/Pipeline/AI:** [salesbot steps & actions](https://www.kommo.com/support/crm/salesbot-step-and-action-types/) · [salesbot triggers](https://www.kommo.com/support/crm/salesbot-triggers/) · [salesbot templates](https://www.kommo.com/support/crm/salesbot-templates/) · [salesbot-dp (handlers)](https://developers.kommo.com/docs/salesbot-dp) · [private chatbot / widget_request](https://developers.kommo.com/docs/private-chatbot-integration) · [salesbot SDK](https://developers.kommo.com/docs/salesbot-sdk) · [pipeline triggers](https://www.kommo.com/support/crm/pipeline-triggers/) · [triggered emails](https://www.kommo.com/support/crm/triggered-emails/) · [incoming leads](https://www.kommo.com/support/crm/incoming-leads/) · [duplicate control](https://www.kommo.com/support/crm/duplicate-control/) · [filling custom field data](https://www.kommo.com/support/crm/filling-custom-field-data/) · [Kommo AI overview](https://www.kommo.com/support/crm/kommo-ai-overview/) · [Kommo AI agent](https://www.kommo.com/support/crm/kommo-ai-agent/) · [subscription plans](https://www.kommo.com/support/account-settings/subscription-plans/) · [pricing](https://www.kommo.com/buy/tariff/)

**Kommo — Canais/telefonia/forms:** [broadcasting](https://www.kommo.com/support/crm/broadcasting/) · [response templates](https://www.kommo.com/support/crm/response-templates/) · [VoIP](https://developers.kommo.com/docs/voip) · [telecom tour](https://www.kommo.com/tour/telecom/) · [webforms](https://www.kommo.com/support/lead-generation/webforms/) · [lead capture](https://www.kommo.com/blog/lead-capture/) · [integrations](https://www.kommo.com/integrations/)

**n8n:** [triggers](https://docs.n8n.io/integrations/builtin/trigger-nodes/) · [core nodes](https://docs.n8n.io/integrations/builtin/core-nodes/) · [LangChain in n8n](https://docs.n8n.io/advanced-ai/langchain/langchain-n8n/) · [AI Agent](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent/) · [Information Extractor](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.information-extractor/) · [Text Classifier](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.text-classifier/) · [Structured Output Parser](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.outputparserstructured/) · [HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/) · [Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) · [queue mode](https://docs.n8n.io/hosting/scaling/queue-mode/) · [rate limits](https://docs.n8n.io/integrations/builtin/rate-limits/) · [community nodes](https://docs.n8n.io/integrations/community-nodes/installation/) · [Kommo↔n8n setup](https://www.kommo.com/support/integrations/n8n-setting-up/) · [node n8n-nodes-kommo](https://github.com/yatolstoy/n8n-nodes-kommo)

**n8n — templates:** [#2841 AI nos chats Kommo](https://n8n.io/workflows/2841-connect-ai-to-any-chats-in-kommo/) · [#2548 decodificar webhook amoCRM](https://n8n.io/workflows/2548-convert-url-encoded-webhook-data-from-amocrm-to-structured-array/) · [#3922 upload arquivos Kommo](https://n8n.io/workflows/3922-upload-large-files-to-kommoamocrm-with-automatic-file-chunking/) · [#13450 classificar leads WhatsApp](https://n8n.io/workflows/13450-auto-respond-and-classify-whatsapp-leads-with-ollama-ai-and-log-to-google-sheets/) · [#15621 qualificar + agendar](https://n8n.io/workflows/15621-qualify-whatsapp-leads-and-book-sales-calls-with-gpt41-and-google-sheets/)
