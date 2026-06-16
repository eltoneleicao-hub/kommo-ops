# Widget Kommo v2 - Novas Features

Atualização com **2 opções de geração** e **modal de confirmação**.

---

## 🎯 Features Implementadas

### 1. **Duas Opções de Geração**

#### 📄 Lead Único
- Gera etiqueta apenas para o lead atual
- Ideal para reprocessamento individual
- Rápido (1-2 segundos)

#### 📦 Em Lote
- Gera etiquetas para **TODOS** os leads da etapa atual
- Processa múltiplos leads de uma vez
- Ideal para início do dia ou fim do turno
- Status: `gerado` (completos) ou `campos_incompletos` (com dados faltando)

### 2. **Modal de Confirmação** (Dupla Verificação)

```
[Clica "Em Lote"]
         ↓
[Modal aparece com aviso em vermelho]
         ↓
"⚠️ ATENÇÃO: Isso vai gerar etiquetas para TODOS os leads desta etapa"
         ↓
[Cancelar] [Confirmar]
```

**Benefícios:**
- ✅ Evita toques acidentais
- ✅ Operador tem tempo de reler
- ✅ Feedback visual claro
- ✅ Botão "Cancelar" sempre disponível

---

## 🎨 UI/UX

### Botões

```
┌─────────────────────────────┐
│  📄 Lead Único  │  📦 Em Lote  │
└─────────────────────────────┘
```

**Cores:**
- **Lead Único** (Azul): Ação segura, apenas 1 lead
- **Em Lote** (Laranja): Ação de risco, múltiplos leads

### Modal

```
┌──────────────────────────────────┐
│  🔒 Gerar em Lote                │
├──────────────────────────────────┤
│                                  │
│  ⚠️ ATENÇÃO:                      │
│  Isso vai gerar etiquetas para   │
│  TODOS os leads desta etapa.     │
│                                  │
│  Tem certeza?                    │
│                                  │
│        [Cancelar] [Confirmar]    │
└──────────────────────────────────┘
```

---

## 📊 Status Após Processamento

### Lead Único

```
✓ Sucesso!
Etiqueta #123 gerada
Etiqueta pronta para impressão
```

### Em Lote

```
✓ Lote Processado!
5 etiquetas geradas
2 com campos incompletos
Total de 7 leads processados
```

---

## ⚙️ Fluxo Técnico

### Lead Único

```
[Botão Lead Único]
        ↓
[Modal de confirmação]
        ↓
[POST /api/kommo/requests]
        ↓
[Valida + Gera etiqueta]
        ↓
[Salva MaterialRequest + Label]
        ↓
[Retorna labelId]
```

### Em Lote

```
[Botão Em Lote]
        ↓
[Modal de confirmação - LARANJA]
        ↓
[POST /api/kommo/requests-batch]
        ↓
[Loop: para cada lead da etapa]
  ├─ Valida campos
  ├─ Se completo: gera etiqueta
  └─ Se incompleto: marca como campos_incompletos
        ↓
[Retorna { generated, incomplete, results }]
```

---

## 🔧 API Endpoints

### POST /api/kommo/requests (Existente)

**Lead único** - sem mudanças.

### POST /api/kommo/requests-batch (Novo)

**Payload:**

```json
{
  "secret": "seu-api-key",
  "kommoPipelineId": "123",
  "kommoStageId": "456"
}
```

**Resposta (Sucesso):**

```json
{
  "generated": 5,
  "incomplete": 2,
  "total": 7,
  "results": [
    {
      "kommoLeadId": "789",
      "status": "etiqueta_gerada",
      "labelId": "label-001"
    },
    {
      "kommoLeadId": "790",
      "status": "campos_incompletos",
      "missingFields": ["CEP", "Numero"]
    },
    ...
  ]
}
```

**Resposta (Erro):**

```json
{
  "error": "unauthorized"  // ou "invalid_payload", "internal_error"
}
```

---

## 📋 Checklist de Testes

### Lead Único

- [ ] Clicar "📄 Lead Único"
- [ ] Modal aparece com aviso "Deseja gerar etiqueta para..."
- [ ] Clicar "Confirmar"
- [ ] Aguarda 1-2s
- [ ] Mostra "✓ Sucesso! Etiqueta #XXX gerada"
- [ ] Banco: MaterialRequest criado com status "etiqueta_gerada"
- [ ] Banco: Label criado com content preenchido

### Em Lote

- [ ] Clicar "📦 Em Lote"
- [ ] Modal aparece com **aviso em vermelho** "ATENÇÃO: TODOS os leads"
- [ ] Clicar "Cancelar" → modal fecha
- [ ] Clicar "📦 Em Lote" novamente
- [ ] Clicar "Confirmar"
- [ ] Aguarda 3-5s (processando múltiplos)
- [ ] Mostra resultado: "5 etiquetas geradas, 2 com campos incompletos"
- [ ] Banco: MaterialRequests criadas/atualizadas
- [ ] Banco: Labels criadas apenas para campos completos

### Modal de Proteção

- [ ] Clicar "📦 Em Lote" → modal aparece
- [ ] Clicar fora da modal → fecha (proteção contra cliques acidentais)
- [ ] Botão "Cancelar" funciona
- [ ] Botão "Confirmar" funciona

---

## 🚀 Deploy das Mudanças

### 1. Atualizar Widget na Kommo

Se o widget já está instalado:

1. Settings → Integrations → Sua integração
2. Atualize os arquivos:
   - `script.js` (novo código)
   - `style.css` (novos estilos)
3. Salve

Se é primeira vez:

1. Settings → Integrations → Create integration
2. Upload de 3 arquivos:
   - `manifest.json`
   - `script.js`
   - `style.css`

### 2. Deploy do Backend

```powershell
cd C:\Users\Balta\Desktop\KOMMO\kommo-ops

# Parar e reiniciar Next.js
npm run dev
```

O novo endpoint `/api/kommo/requests-batch` está automaticamente disponível.

### 3. Testar

1. Abra Kommo em um lead
2. Clique "📄 Lead Único" → teste completo
3. Clique "📦 Em Lote" → teste lote
4. Verifique banco com `npx prisma studio`

---

## 🔒 Segurança

### Validação

- ✅ Secret key obrigatório em ambos endpoints
- ✅ Valida structure do payload (Zod)
- ✅ CORS headers: `Origin` whitelisted

### Modal

- ✅ Aviso visual claro para ação em lote
- ✅ Botão "Cancelar" sempre acessível
- ✅ Click fora da modal fecha (evita travamento)

### Banco

- ✅ Não processa leads já impressos (status check)
- ✅ Transação implícita no Prisma (create, update são atômicos)

---

## 🐛 Troubleshooting

### "Modal não aparece"

- Verificar DevTools (F12) → Console → erros em vermelho
- Verificar se `script.js` foi atualizado na Kommo

### "Em Lote retorna 0 resultados"

- Verificar se há leads na etapa atual
- Verificar se estão no status correto (não "impresso" ou "cancelado")
- Verificar logs do backend

### "Erro: unauthorized"

- Verificar se API Key está correta em Widget Settings
- Verificar se `.env` tem `KOMMO_WEBHOOK_SECRET` igual

### Resposta lenta no Em Lote

- Normal: processa múltiplos leads (1-5s por lead)
- Se demorar muito, verificar performance do Postgres
- Considerar fazer index em `(kommoPipelineId, kommoStageId, status)`

---

## 📈 Próximas Versões (Roadmap)

- [ ] Botão "Reimprimir Em Lote" (reimprimir leads já processados)
- [ ] Filtro: "Apenas campos incompletos"
- [ ] Filtro: "Apenas novos"
- [ ] Botão "Cancelar Selecionados" em lote
- [ ] Export de etiquetas geradas (CSV)
- [ ] Webhook reverso para atualizar status na Kommo

---

## 📞 Suporte

Se tiver dúvidas sobre o novo widget:

1. Verificar `SETUP-PASSO-A-PASSO.md` para setup
2. Verificar `README.md` para docs gerais
3. Verificar logs do backend: `npm run dev` (terminal com Next.js)
4. Verificar DevTools do navegador (F12 → Console → Network)
