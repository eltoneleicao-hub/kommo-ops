# Setup Passo-a-Passo: Widget Kommo + Cloudflare Tunnel

Guia para colocar o botão "Gerar Etiqueta" funcionando no card do lead na Kommo, 100% gratuito.

---

## 🎯 Resultado Final

Quando terminar, você terá:

```
Kommo [Card do Lead]
  ↓
[Botão: 📋 Gerar Etiqueta]  ← Você vai clicar aqui
  ↓
Cloudflare Tunnel (gratuito)
  ↓
seu-sistema.local (localhost:3000)
  ↓
✓ Etiqueta #123 gerada!
```

---

## ⏱️ Tempo Estimado

- **Parte 1 (Cloudflare)**: 10 minutos
- **Parte 2 (Widget)**: 10 minutos
- **Parte 3 (Teste)**: 10 minutos
- **Total**: ~30 minutos

---

## 📋 Pré-requisitos

- [ ] Conta Cloudflare (gratuita, acesso a https://dash.cloudflare.com)
- [ ] Kommo com acesso a Settings
- [ ] Seu computador rodando Windows
- [ ] `npm run dev` funcionando (kommo-ops)

---

## ✅ Parte 1: Cloudflare Tunnel (Gratuito)

### 1.1 Baixar cloudflared

**Opção A: Via Chocolatey** (se tiver instalado)

```powershell
choco install cloudflared
```

**Opção B: Download Manual**

1. Acesse: https://github.com/cloudflare/cloudflared/releases
2. Baixe a versão Windows mais recente
   - Para Windows 64-bit: `cloudflared-windows-amd64.msi` ou `.exe`
3. Execute o instalador
4. Abra PowerShell e verifique:

```powershell
cloudflared --version
```

Se vir a versão, OK! Pule para 1.2.

### 1.2 Autenticar no Cloudflare

```powershell
cloudflared tunnel login
```

**O que vai acontecer:**

1. PowerShell vai pedir permissão
2. Navegador abre automaticamente
3. Você faz login com sua conta Cloudflare (ou cria gratuita)
4. Clica "Authorize"
5. PowerShell mostra token gerado

Pronto! Cloudflared agora tem acesso à sua conta.

### 1.3 Criar um Tunnel Permanente

```powershell
cloudflared tunnel create kommo-ops
```

**Saída esperada:**

```
Tunnel credentials written to C:\Users\Balta\.cloudflared\<TUNNEL-ID>.json
Congratulations on creating a new tunnel 'kommo-ops'!

Make sure to point your DNS records to one of these Cloudflare nameservers:
  ...
```

**Copie o `<TUNNEL-ID>`** (você vai precisar no próximo passo).

### 1.4 Configurar o Tunnel

Crie arquivo em: `C:\Users\Balta\.cloudflared\config.yml`

**Se não tiver a pasta `.cloudflared`**, crie:

```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\.cloudflared" -Force
```

Agora crie ou edite `config.yml`:

```yaml
tunnel: kommo-ops
credentials-file: C:\Users\Balta\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: kommo-ops-seu-nome.trycloudflare.com
    service: http://localhost:3000
  - service: http_status:404
```

**Onde `<TUNNEL-ID>`** = o ID que recebeu no passo 1.3.

### 1.5 Rodar o Tunnel

**Terminal 1:** Cloudflare Tunnel

```powershell
cloudflared tunnel run kommo-ops
```

**Saída esperada:**

```
2026-06-16T10:30:00Z INF Thank you for using Cloudflare Tunnel. Connections made through this tunnel are encrypted.
2026-06-16T10:30:00Z INF Autoupdate available!
2026-06-16T10:30:00Z INF +-------------------------------------------+
2026-06-16T10:30:00Z INF |  Your tunnel is live!                    |
2026-06-16T10:30:00Z INF |                                           |
2026-06-16T10:30:00Z INF |  URL: https://kommo-ops-seu-nome.trycloudflare.com |
2026-06-16T10:30:00Z INF |                                           |
2026-06-16T10:30:00Z INF +-------------------------------------------+
```

**Deixe esse terminal aberto!**

### 1.6 Testar o Tunnel

**Terminal 2:** Novo PowerShell

```powershell
# Trocar para o diretório do projeto
cd C:\Users\Balta\Desktop\KOMMO\kommo-ops

# Rodar o Next.js
npm run dev
```

Saída esperada:

```
> dev
> next dev

  ▲ Next.js 15.0.0
  - Local:        http://localhost:3000
  - Environments: .env
```

**Deixe esse terminal também aberto!**

### 1.7 Verificar Acesso Remoto

Em **Terminal 3**, teste:

```powershell
# Trocar o <URL> pela sua URL do passo 1.5
$tunnel_url = "https://kommo-ops-seu-nome.trycloudflare.com"

Invoke-WebRequest -Uri $tunnel_url
```

Se retornar `StatusCode 200` e HTML, tá funcionando! ✓

---

## ✅ Parte 2: Instalar Widget na Kommo

### 2.1 Acessar Settings

1. Acesse sua conta Kommo: https://seu-account.kommo.com
2. Clique no **ícone de engrenagem** (Settings) no canto superior direito
3. Vá em **Integrations** (ou "Интеграции")

### 2.2 Criar Integração

1. Clique **"Create integration"** (ou "Создать интеграцию")
2. Preencha:
   - **Name**: `Gerar Etiqueta`
   - **Code**: `gerar-etiqueta-widget`

3. Clique **Save**

### 2.3 Configurar Widget

Na integração criada:

1. Encontre seção **"Widget"** ou **"Widget code"**
2. Clique **"Add widget"** ou **"Upload files"**

**Você tem 2 opções:**

**Opção A: Upload de Arquivos**

1. Selecione os 3 arquivos:
   - `manifest.json`
   - `script.js`
   - `style.css`

2. Kommo faz upload automaticamente

**Opção B: Cola o Código**

1. Abra `manifest.json` no seu editor
2. Cola o conteúdo na field "Manifest"
3. Abra `script.js`
4. Cola na field "Script"
5. Abra `style.css`
6. Cola na field "CSS"

### 2.4 Gerar Secret Key

1. Em **Settings** da integração, copie o **Secret key** (ou similar)
   - Se não tiver, gere um novo clicando **Generate**

2. **Copie e guarde em lugar seguro:**
   ```
   KOMMO_WEBHOOK_SECRET=seu-secret-aqui
   ```

### 2.5 Configurar Settings do Widget

1. Vá em **Widget Settings**
2. Preencha:
   - **API URL**: `https://kommo-ops-seu-nome.trycloudflare.com`
   - **API Key**: Cole o secret do passo 2.4

3. Clique **Save**

### 2.6 Ativar o Widget

1. Procure por toggle **"Active"** ou **"Enabled"**
2. Ative o widget

---

## ✅ Parte 3: Teste Completo

### 3.1 Adicionar Secret ao `.env`

Na pasta `C:\Users\Balta\Desktop\KOMMO\kommo-ops`:

Edite `.env`:

```env
# ... seus outros valores ...
KOMMO_WEBHOOK_SECRET=seu-secret-aqui
```

### 3.2 Adicionar CORS Headers

Abra: `C:\Users\Balta\Desktop\KOMMO\kommo-ops\src\app\api\kommo\requests\route.ts`

Adicione os headers CORS (veja exemplo em `exemplo-cors-fix.ts`).

### 3.3 Restart do Next.js

1. Volte ao terminal onde rodou `npm run dev`
2. Pressione `Ctrl+C`
3. Rode novamente:
   ```powershell
   npm run dev
   ```

### 3.4 Teste no Kommo

1. Acesse Kommo
2. Abra um **Lead** qualquer
3. Procure pelo card com **"📋 Gerar Etiqueta"**
4. Clique no botão

**Esperado:**
- Botão vira "⏳ Gerando..."
- Após 1-2s, vira "✓ Etiqueta Gerada" (verde)
- Mostra mensagem: "✓ Sucesso! Etiqueta #XXX gerada"

### 3.5 Verificar Banco de Dados

```powershell
# Terminal novo
cd C:\Users\Balta\Desktop\KOMMO\kommo-ops

# Abrir Prisma Studio
npx prisma studio
```

1. Vai abrir `http://localhost:5555`
2. Vá em **MaterialRequest** (Material Requests)
3. Procure o lead que clicou
4. Verifique os dados foram salvos ✓

---

## 🎉 Pronto!

Se chegou aqui, você tem:

✅ Cloudflare Tunnel rodando (conectando sua máquina ao mundo)  
✅ Widget instalado na Kommo  
✅ Botão funcional no card do lead  
✅ Dados sendo salvos no banco  

---

## ❓ Problemas Comuns

### "Erro de conexão"

**Verificar:**

1. Terminal 1 (cloudflared) ainda aberto?
2. Terminal 2 (npm run dev) ainda aberto?
3. URL do tunnel está correta em Widget Settings?

### "API Key inválida"

1. Verifique se copiou corretamente o Secret
2. Verifique se `.env` tem `KOMMO_WEBHOOK_SECRET=seu-secret`
3. Restartar Next.js (Ctrl+C e `npm run dev` novamente)

### "Widget não aparece"

1. Aguarde 5-10 minutos (Kommo demora)
2. Recarregue a página da Kommo (F5)
3. Tente outro lead

### "Button não faz nada"

1. Abra DevTools (F12) do navegador
2. Vá em **Console**
3. Procure por erros em vermelho
4. Copie a mensagem e pesquise

---

## 🚀 Próximos Passos (Depois)

1. Testar com múltiplos leads
2. Integrar impressão real (Task 7)
3. Adicionar mais botões (Reimprimir, Cancelar, etc)
4. Usar domínio próprio (pagar Cloudflare ou outro registrar)

---

## 📞 Suporte

Se travar:

1. Verifique logs em ambos os terminais (cloudflared + npm)
2. Procure por mensagens de erro em vermelho
3. Confirme que os 3 arquivos estão em `C:\Users\Balta\Desktop\KOMMO\kommo-ops\widget-kommo\`
4. Tente restartar tudo (feche terminais e comece do 1.5)
