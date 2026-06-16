# Widget Kommo - Gerar Etiqueta

Widget customizado para Kommo que coloca um botão no card do lead para gerar etiqueta direto da interface.

## 📁 Arquivos

- `manifest.json` — Configuração do widget
- `script.js` — Lógica (fetch, handlers)
- `style.css` — Estilos
- `README.md` — Este arquivo

## 🚀 Setup com Cloudflare Tunnel (Gratuito)

### Passo 1: Instalar cloudflared

Windows:

```powershell
# Via chocolatey
choco install cloudflared

# Ou download direto
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

macOS/Linux:

```bash
brew install cloudflared
```

### Passo 2: Autenticar cloudflared

```bash
cloudflared tunnel login
```

Será aberto navegador para autenticar com sua conta Cloudflare (gratuita ou paga).

### Passo 3: Criar um tunnel

```bash
cloudflared tunnel create kommo-ops
```

Cloudflare vai gerar um `<tunnel-id>`. Copie isso.

### Passo 4: Configurar o tunnel

Crie arquivo `~/.cloudflared/config.yml`:

```yaml
tunnel: kommo-ops
credentials-file: /home/seu-usuario/.cloudflared/<tunnel-id>.json

ingress:
  # Seu sistema Next.js (localhost:3000)
  - hostname: seu-tunnel.trycloudflare.com
    service: http://localhost:3000

  # Catchall
  - service: http_status:404
```

Windows (usuário `Balta`):

```yaml
tunnel: kommo-ops
credentials-file: C:\Users\Balta\.cloudflared\<tunnel-id>.json

ingress:
  - hostname: seu-tunnel.trycloudflare.com
    service: http://localhost:3000
  - service: http_status:404
```

### Passo 5: Rodar o tunnel

```bash
cloudflared tunnel run kommo-ops
```

Saída esperada:

```
2026-06-16T10:30:00Z INF Thank you for using Cloudflare Tunnel. Connections made through this tunnel are encrypted.
2026-06-16T10:30:00Z INF +----------------------------+
2026-06-16T10:30:00Z INF |  Your tunnel is live!      |
2026-06-16T10:30:00Z INF |  URL: https://seu-tunnel.trycloudflare.com |
2026-06-16T10:30:00Z INF +----------------------------+
```

**Salve a URL gerada: `https://seu-tunnel.trycloudflare.com`**

### Passo 6: Confirmar no DNS (Kommo)

Se usar um domínio próprio (opcional):

```bash
cloudflared tunnel route dns kommo-ops seu-dominio.com.br
```

Para MVP, use o `trycloudflare.com` que é gerado automaticamente.

---

## 📥 Instalar Widget na Kommo

### 1. Acessar Settings da Kommo

- Vá a **Settings** → **Integrations**
- Clique **"Create integration"**

### 2. Preencher formulário

- **Name**: "Gerar Etiqueta"
- **Code**: "gerar-etiqueta-widget"
- **Redirect URI** (se pedir): deixe em branco (widget não precisa)

### 3. Upload do Widget

- Na seção **"Widget code"**, upload os arquivos:
  - `manifest.json`
  - `script.js`
  - `style.css`

**Ou** cole o conteúdo direto na interface.

### 4. Gerar Credentials

Kommo vai gerar:

- **Integration ID**
- **Secret key**
- **Widget code** (opcional)

**Salve o Secret key** — você vai precisar no passo 5.

### 5. Ativar no Widget

Após criar a integração, configure as **Settings do Widget**:

- **API URL**: `https://seu-tunnel.trycloudflare.com`
- **API Key**: `seu-secret-da-integracao`

---

## 🧪 Teste Local

### Rodar o kommo-ops localmente

```powershell
cd C:\Users\Balta\Desktop\KOMMO\kommo-ops

# Terminal 1: rodar cloudflare tunnel
cloudflared tunnel run kommo-ops

# Terminal 2: rodar Next.js
npm run dev
```

O app estará em `http://localhost:3000` e acessível remotamente via `https://seu-tunnel.trycloudflare.com`.

### Testar o endpoint

```powershell
$body = @{
  secret = "seu-secret-da-integracao"
  kommoLeadId = "123"
  kommoPipelineId = "456"
  kommoStageId = "789"
  recipientName = "Maria Silva"
  recipientPhone = "12999990000"
  street = "Rua Exemplo"
  number = "100"
  neighborhood = "Centro"
  postalCode = "12345678"
  city = "Sao Jose"
  complement = ""
  internalOrderNotes = "REGIAO SUL"
  kommoUrl = "https://example.kommo.com/leads/detail/123"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "https://seu-tunnel.trycloudflare.com/api/kommo/requests" `
  -ContentType 'application/json' `
  -Body $body
```

Resposta esperada:

```json
{
  "requestId": "...",
  "status": "etiqueta_gerada",
  "missingFields": [],
  "labelId": "..."
}
```

---

## 🔐 Segurança

### ⚠️ Importante

1. **API Key** (Secret) é enviada **em claro** pelo widget
   - O Cloudflare Tunnel usa HTTPS (criptografado em trânsito)
   - Mas qualquer um com acesso ao JavaScript do widget pode ver a API Key
   - **Solução**: usar Cloudflare Access para proteger o endpoint

2. **Proteger com Cloudflare Access (Gratuito)**

   - Na Cloudflare Zero Trust Console, crie uma política:
     ```
     Application: https://seu-tunnel.trycloudflare.com/api/kommo/*
     Policies: Only allow requests from Kommo IP ranges
     ```

   - Ou mais simples: usar um Secret rotativo e validar no backend

3. **No Backend** (Next.js)

   ```typescript
   // src/app/api/kommo/requests/route.ts
   if (parsed.data.secret !== process.env.KOMMO_WEBHOOK_SECRET) {
     return NextResponse.json({ error: "unauthorized" }, { status: 401 });
   }
   ```

---

## 📋 Fluxo Completo

```
Operador no Kommo
  ↓
[Clica "Gerar Etiqueta" no card do lead]
  ↓
Widget faz fetch para https://seu-tunnel.trycloudflare.com/api/kommo/requests
  ↓
Cloudflare Tunnel roteia para http://localhost:3000 (seu Next.js)
  ↓
Next.js valida secret + dados
  ↓
Cria MaterialRequest + gera Label
  ↓
Resposta: { status: "etiqueta_gerada", labelId: "..." }
  ↓
Widget mostra "✓ Etiqueta #123 gerada"
```

---

## 🐛 Troubleshooting

### "Connection refused"

- Verificar se `npm run dev` está rodando em `localhost:3000`
- Verificar se `cloudflared tunnel run kommo-ops` está ativo

### "API Key inválida"

- Verificar se copiou o Secret correto da integração Kommo
- Verificar se está usando `KOMMO_WEBHOOK_SECRET` no `.env`

### "CORS error"

- Widget roda no navegador do operador
- Browser pode bloquear por CORS
- **Solução**: Next.js precisa retornar headers CORS corretos

  ```typescript
  export async function POST(request: NextRequest) {
    const response = NextResponse.json({...});
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return response;
  }
  ```

### "Widget não aparece no card"

- Verificar se foi instalado corretamente na integração
- Aguardar 5-10 minutos (Kommo às vezes demora para carregar)
- Recarregar a página da Kommo

---

## 🎯 Próximos Passos

1. ✅ Widget criado
2. 🔄 Instalar na Kommo (Settings → Integrations)
3. 🧪 Testar com um lead real
4. 📊 Após Task 6 pronta, integrar com painel próprio

---

## 📚 Referências

- [Kommo Widget Docs](https://developers.kommo.com/docs/widget)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Cloudflare Zero Trust (Access)](https://developers.cloudflare.com/cloudflare-one/applications/)
