# Validação Zebra ZD220T - Guia Prático Passo-a-Passo

**Data**: 2026-06-16  
**Objetivo**: Validar que a Zebra está funcionando corretamente  
**Tempo**: ~15 minutos

---

## ✅ Pré-requisitos

- [ ] Zebra ZD220T conectada (USB ou Rede)
- [ ] Papel 100x150mm carregado
- [ ] Windows/Linux com acesso a `npm run dev`
- [ ] Kommo com pelo menos 1 lead pronto

---

## 🔍 ETAPA 1: Verificar Hardware

### Passo 1a: Verificar Conexão USB (Windows)

```powershell
# Abrir PowerShell como Admin
# (Win + R → powershell → Ctrl+Shift+Enter)

# Listar impressoras conectadas
Get-Printer | Select-Object Name, Status, PrinterStatus
```

**Esperado:**
```
Name               Status Status PrinterStatus
----               ------ ------
Zebra ZD220T      Normal OK
```

Se não aparecer, tente:
```powershell
# Atualizar drivers
Get-PnpDevice | where {$_.FriendlyName -like "*Zebra*"} | Format-List
```

### Passo 1b: Verificar Conexão Rede (se aplicável)

```bash
# Se Zebra está em rede:
ping 192.168.1.100

# Esperado:
# Reply from 192.168.1.100: bytes=32 time<1ms TTL=64
```

Se não responde, verificar:
1. IP na Zebra: Menu → Network Settings → DHCP ON/OFF → anote IP
2. Mesmo network que PC
3. Firewall port 9100

### Passo 1c: Verificar Papel

```
Na Zebra:
┌─────────────────┐
│   Menu (botão)  │ ← Pressionar
│     ↓           │
│ Status/Info     │
│     ↓           │
│ Paper Status    │ ← Ver se papel está OK
└─────────────────┘
```

Esperado: `Paper OK` ou `Paper Installed`

---

## 🚀 ETAPA 2: Preparar Backend

### Passo 2a: Configurar .env

```powershell
cd C:\Users\Balta\Desktop\KOMMO\kommo-ops

# Abrir .env em editor
notepad .env
```

Adicionar/verificar:

```env
# === Zebra Printer ===
PRINT_MODE=direct
ZEBRA_PRINTER_NAME=Zebra ZD220T

# OU se Rede:
# PRINT_MODE=network
# ZEBRA_PRINTER_IP=192.168.1.100
# ZEBRA_PRINTER_PORT=9100

# === Kommo ===
KOMMO_WEBHOOK_SECRET=seu-secret-aqui
```

**Salvar e fechar.**

### Passo 2b: Rodar Backend

```powershell
npm run dev
```

Esperado:
```
▲ Next.js 15.0.0
  - Local:        http://localhost:3000
  - Environments: .env
```

**Deixar esse terminal aberto!**

---

## 📝 ETAPA 3: Gerar um Label de Teste

### Passo 3a: Abrir Kommo e selecionar um lead

1. Abrir Kommo: https://seu-account.kommo.com
2. Abrir um lead que tem:
   - Nome do destinatário
   - Telefone
   - Endereço (rua, número, bairro, CEP, cidade)

### Passo 3b: Gerar etiqueta (se não tiver)

1. No lead, clicar **[📄 Único]** no widget
2. Modal aparece
3. Clicar **[Confirmar]**
4. Aguardar 1-2s
5. Deve aparecer: **"✓ Sucesso! Etiqueta #XXX gerada"**

**Se não gerou, voltar e usar n8n/API manual** (pule para ETAPA 4c).

### Passo 3c: Anotar o labelId

Na resposta do widget, vai ter `Etiqueta #123`.

Anotar esse número: **`label-123`**

---

## 🧪 ETAPA 4: Testar Impressão

### Passo 4a: Abrir novo PowerShell (Terminal 2)

```powershell
# NÃO fechar o primeiro terminal (npm run dev)
# Abrir outro PowerShell
```

### Passo 4b: Teste 1 - Preview ZPL (dry run)

```powershell
# Substitua LABEL_ID pelo ID real (ex: clvjz123abc)

$labelId = "LABEL_ID"
$secret = "seu-secret-aqui"

$body = @{
  labelId = $labelId
  secret = $secret
  dryRun = $true
} | ConvertTo-Json

$response = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/labels/print" `
  -ContentType 'application/json' `
  -Body $body

Write-Output "Status: $($response.status)"
Write-Output "ZPL Preview URL: $($response.preview)"
```

**Esperado:**

```json
{
  "status": "dry_run",
  "labelId": "clvjz123abc",
  "zplContent": "^XA\n^PW800\n^LL1200\n...",
  "preview": "https://labelary.com/viewer.html?..."
}
```

### Passo 4c: Abrir Preview

```powershell
# Copiar a URL do "preview"
# Colar no navegador

# Ou, diretamente:
Start-Process "https://labelary.com/viewer.html?..."
```

**Esperado:**
```
[Simulação da etiqueta]
┌──────────────────────┐
│ MARIA SILVA          │
│                      │
│ Rua X, 123           │
│ Bosque dos eucaliptos│
│ Sao Jose - CEP 12233 │
│                      │
│ Telefone: 12999990000│
│                      │
│ REGIAO: LESTE        │
└──────────────────────┘
```

Se ficou errado, verificar:
- [ ] Nome maiúsculo?
- [ ] Endereço está correto?
- [ ] Telefone completo?
- [ ] Bairro legível?

### Passo 4d: Teste 2 - Imprimir de Verdade

**⚠️ IMPORTANTE: Colocar papel na Zebra antes!**

```powershell
# Mesmo labelId, mas SEM dryRun (ou false)

$labelId = "LABEL_ID"
$secret = "seu-secret-aqui"

$body = @{
  labelId = $labelId
  secret = $secret
} | ConvertTo-Json

$response = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/labels/print" `
  -ContentType 'application/json' `
  -Body $body

Write-Output "Status: $($response.status)"
Write-Output "Printer: $($response.printer)"
Write-Output "Printed at: $($response.printedAt)"
```

**Esperado:**

```json
{
  "status": "enviado_para_impressora",
  "labelId": "clvjz123abc",
  "printer": "Zebra ZD220T",
  "printedAt": "2026-06-16T14:30:45.123Z"
}
```

### Passo 4e: Verificar Zebra

```
Você deve ouvir:
  🔊 [BEEP] - iniciando print
  🔊 [BUZZ] - processando
  🖨️ [Etiqueta sai]
```

---

## ✔️ ETAPA 5: Validação Final

Checklist depois de imprimir:

- [ ] Etiqueta saiu da impressora
- [ ] Texto está legível
- [ ] Tamanho está correto (100x150mm)
- [ ] Nome em maiúscula
- [ ] Endereço formatado corretamente
- [ ] Telefone completo
- [ ] Região/Anotação no rodapé
- [ ] Sem cortes ou deformações

### Se tudo OK:

```
✅ Impressora Zebra ZD220T validada!
```

### Se etiqueta saiu errada:

**Problema: Texto cortado**
- Verificar papel (deve ser 100x150mm)
- Testar calibração: Menu Zebra → Calibrate

**Problema: Texto pequeno/grande**
- Verificar DPI na Zebra (deve ser 203)
- Ajustar tamanho de fonte em `zpl-printer.ts`

**Problema: Dados errados**
- Verificar campos no Kommo (street, number, etc)
- Testar com `dryRun=true` para ver ZPL

---

## 🔧 Troubleshooting

### "Erro: print_failed"

```powershell
# Ver logs no terminal do npm run dev
# Procurar por:
# [Print] ZPL enviado...
# ou
# [Print] Erro:
```

Ações:

1. **Modo Direct (USB)**
   ```powershell
   # Verificar se impressora está listada
   Get-Printer | findstr -i zebra
   
   # Se não listar, reinstalar driver
   ```

2. **Modo Network**
   ```bash
   # Testar conexão
   telnet 192.168.1.100 9100
   
   # Se não conecta, verificar:
   # - IP da Zebra
   # - Firewall
   # - Cabo ethernet
   ```

### "Erro: label_not_found"

```powershell
# Verificar se labelId está correto
# Abrir Prisma Studio:

cd C:\Users\Balta\Desktop\KOMMO\kommo-ops
npx prisma studio

# Ir em Label
# Procurar label-xxx
# Copiar ID exato
```

### "ZPL Preview mostra etiqueta errada"

Verificar `.env` tem `KOMMO_WEBHOOK_SECRET` correto:

```powershell
# No terminal npm run dev, procurar por:
# [Print] secret validated OK
# ou
# [Print] unauthorized
```

---

## 📊 Relatório de Validação

Depois de completo, preencher:

```
VALIDAÇÃO ZEBRA ZD220T
=====================

Data: 2026-06-16
Horário: 14:30
Label ID: clvjz123abc

Hardware:
- [ ] Impressora detectada: ___________
- [ ] Papel: 100x150mm ___ OK ___ Falta
- [ ] Conexão: ___ USB ___ Rede (IP: ___)

Software:
- [ ] .env configurado
- [ ] Backend rodando
- [ ] Endpoint respondendo

Testes:
- [ ] DryRun (preview) OK
- [ ] Impressão OK
- [ ] Etiqueta legível

Resultado: ___ ✅ VÁLIDO ___ ❌ REQUER AJUSTE

Observações:
_______________________________________
```

---

## 🎯 Próximo Passo

Se **✅ VÁLIDO**:
→ Prosseguir para **Task 6 (UI do Painel)**

Se **❌ REQUER AJUSTE**:
→ Verificar seção Troubleshooting acima

---

## 📞 Suporte Rápido

| Problema | Solução |
|----------|---------|
| Zebra não reconhecida | Reinstalar drivers |
| ZPL errado | Verificar campos no Kommo |
| Etiqueta cortada | Ajustar tamanho do papel |
| Não imprime | Verificar modo (`direct` vs `network`) |
| Preview errado | Testar com dados diferentes |

---

**Boa sorte com a validação!** 🚀
