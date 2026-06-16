# Setup: Impressora Zebra ZD220T - Opção B (ZPL Direto)

**Data**: 2026-06-16  
**Modo**: ZPL direto (sem PrintNode)  
**Velocidade**: <1s  
**Custo**: Grátis

---

## 📋 Resumo

Sistema gera **ZPL** (linguagem nativa Zebra) e envia direto para a impressora:

```
Seu Backend (Next.js)
  ↓
renderLabelZPL() → gera comando ZPL
  ↓
POST /api/labels/print
  ↓
printer-adapter.ts → envia para Zebra
  ↓
Zebra ZD220T (USB ou Rede)
  ↓
✓ Etiqueta impressa
```

---

## 🔧 Configuração (3 Modos)

### **Modo 1: USB Direto (Windows)** ⭐ Mais Simples

**Quando usar**: Zebra está conectada via USB no mesmo PC que roda o Next.js

**Setup:**

1. Conectar Zebra ZD220T via USB
2. Windows instala drivers automaticamente
3. Adicionar ao `.env`:
   ```env
   PRINT_MODE=direct
   ZEBRA_PRINTER_NAME=Zebra ZD220T
   ```
4. Pronto!

**Teste:**
```powershell
# Terminal do Windows
Get-Printer | findstr Zebra
```

Se listou, está funcionando.

---

### **Modo 2: Arquivo (Desenvolvimento/Debug)** 🧪

**Quando usar**: Testando sem impressora, ou para debugging

**Setup:**

1. Adicionar ao `.env`:
   ```env
   PRINT_MODE=file
   PRINT_OUTPUT_DIR=./zpl-output
   ```

2. Pronto!

**Resultado:**
- Gera arquivo `.zpl` em `./zpl-output/`
- Pode visualizar em https://labelary.com/viewer.html

**Para converter para imprimir depois:**
```bash
# Enviar arquivo ZPL para impressora
cat zpl-output/label-abc123.zpl | lp -d "Zebra ZD220T"  # Linux
# ou
type zpl-output\label-abc123.zpl | print /d:"Zebra ZD220T"  # Windows
```

---

### **Modo 3: Rede (TCP/IP)** 🌐

**Quando usar**: Zebra em rede local (VPS + PC próximo) ou impressora networked

**Setup:**

1. **Na Zebra**: Menu → Network Settings → DHCP OFF → IP: `192.168.1.100`
2. **No .env**:
   ```env
   PRINT_MODE=network
   ZEBRA_PRINTER_IP=192.168.1.100
   ZEBRA_PRINTER_PORT=9100
   ```

3. **Testar conexão**:
   ```bash
   ping 192.168.1.100
   telnet 192.168.1.100 9100
   ```

4. Pronto!

---

## ✅ Arquivos Criados/Modificados

| Arquivo | O Quê |
|---------|-------|
| `src/domain/zpl-printer.ts` | ✅ NOVO - Gera ZPL |
| `src/lib/printer-adapter.ts` | ✅ NOVO - Envia para impressora |
| `src/app/api/labels/print/route.ts` | ✅ NOVO - Endpoint POST /api/labels/print |
| `widget-kommo/script.js` | ✅ ATUALIZADO - Botão "Imprimir" |
| `.env` | ✅ ADICIONAR variáveis |

---

## 📝 .env - Exemplo Completo

```env
# === Zebra Printer ===
# Modo: direct | file | network
PRINT_MODE=direct

# Modo DIRECT (USB Windows)
ZEBRA_PRINTER_NAME=Zebra ZD220T

# Modo FILE (Debug/Test)
PRINT_OUTPUT_DIR=./zpl-output

# Modo NETWORK (TCP/IP)
ZEBRA_PRINTER_IP=192.168.1.100
ZEBRA_PRINTER_PORT=9100

# === Kommo ===
KOMMO_WEBHOOK_SECRET=seu-secret-aqui
```

---

## 🚀 Deploy

### 1. Adicionar ao .env

```powershell
cd C:\Users\Balta\Desktop\KOMMO\kommo-ops

# Editar .env
notepad .env

# Adicionar:
PRINT_MODE=direct
ZEBRA_PRINTER_NAME=Zebra ZD220T
```

### 2. Rodar testes

```powershell
npm test -- src/domain/zpl-printer.test.ts
```

Deve passar.

### 3. Rodar o sistema

```powershell
npm run dev
```

### 4. Testar endpoint

```powershell
# Buscar um labelId real do banco
# Depois:

$body = @{
  labelId = "label-123"
  secret = "seu-secret-aqui"
  dryRun = $true  # Primeiro testar sem imprimir
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/labels/print" `
  -ContentType 'application/json' `
  -Body $body
```

**Resposta esperada:**
```json
{
  "status": "dry_run",
  "labelId": "label-123",
  "zplContent": "^XA\n^PW800\n...",
  "preview": "https://labelary.com/viewer.html?..."
}
```

### 5. Testar impressão real

```powershell
# Remover dryRun (ou false)
$body = @{
  labelId = "label-123"
  secret = "seu-secret-aqui"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/labels/print" `
  -ContentType 'application/json' `
  -Body $body
```

**Resposta:**
```json
{
  "status": "enviado_para_impressora",
  "labelId": "label-123",
  "printer": "Zebra ZD220T"
}
```

---

## 🧪 Testes (Unit)

### Test 1: ZPL Generation

```powershell
npm test -- src/domain/zpl-printer
```

Testa:
- ✅ Geração de ZPL válido
- ✅ Campos extraídos corretamente
- ✅ Formatação de endereço
- ✅ Validação de tags ZPL

### Test 2: Printer Adapter

```powershell
# (Testes manuais, pois depende de I/O)

# Modo arquivo:
PRINT_MODE=file npm run dev

# Gerar etiqueta → arquivo salvo em ./zpl-output/
```

---

## 🎨 Visualizar ZPL Antes de Imprimir

**Opção 1: Preview Online**

1. Chamar endpoint com `dryRun=true`
2. Copiar campo `preview` do response
3. Colar URL no navegador
4. Vê simulação de etiqueta

**Opção 2: Software Zebra**

1. Download: Zebra Label Designer (gratuito)
2. Colar ZPL direto
3. Visualizar em tempo real

---

## 🔌 Conexão Física

### USB (Modo Direto)

```
Zebra ZD220T
    ↓ (USB)
PC/VPS com Next.js
```

**Windows:** Drivers automáticos
**Linux:** Pode precisar `cups` + configuração

### Rede (Modo Network)

```
Zebra ZD220T (192.168.1.100:9100)
    ↑ (TCP/IP)
VPS/PC em mesma rede
```

**Vantagem:** Funciona em qualquer máquina da rede

---

## 🐛 Troubleshooting

### "Nenhuma etiqueta foi impressa"

1. Verificar se papel está carregado
2. Verificar se Zebra está ligada
3. Checar logs: `npm run dev` (deve mostrar `[Print] ZPL enviado`)
4. Se `PRINT_MODE=file`, verificar `./zpl-output/`

### "Erro: Failed to print to Zebra ZD220T"

1. Verificar nome exato da impressora:
   ```powershell
   Get-Printer | findstr -i zebra
   ```
2. Atualizar `ZEBRA_PRINTER_NAME` no `.env`
3. Reiniciar Next.js

### "ZPL inválido / etiqueta sai errada"

1. Testar com `dryRun=true`
2. Copiar URL do `preview` → visualizar em labelary.com
3. Se ZPL está correto mas impressão errada:
   - Verificar calibração da Zebra (Menu → Calibrate)
   - Verificar tamanho do papel (100x150mm)
   - Testar print simples da Zebra

### "Modo network não conecta"

1. Testar ping:
   ```bash
   ping 192.168.1.100
   ```
2. Testar telnet:
   ```bash
   telnet 192.168.1.100 9100
   ```
3. Verificar firewall (porta 9100)
4. Verificar IP na Zebra (Menu → Network)

---

## 📊 Performance

| Modo | Latência | Overhead |
|------|----------|----------|
| **Direct (USB)** | <200ms | Comandos do SO |
| **File** | ~50ms | I/O do disco |
| **Network** | 500-1000ms | TCP/IP |

**Recomendação**: Modo **Direct** se possível, senão **Network**.

---

## 🔐 Segurança

- ✅ Secret key obrigatório em `/api/labels/print`
- ✅ ZPL gerado server-side (não pode ser manipulado)
- ✅ Sem exposição de dados pessoais em logs
- ✅ Validação de ZPL antes de enviar

---

## 📞 Referências

- [Zebra ZPL Docs](https://www.zebra.com/en/us/products/software/printers/link-os/zpl.html)
- [Labelary ZPL Viewer](http://labelary.com/viewer.html)
- [ZD220T Manual](https://www.zebra.com/en/us/products/printers/desktop/zd220t.html)

---

## ✅ Checklist Final

- [ ] Zebra ZD220T conectada (USB ou Rede)
- [ ] `.env` configurado com `PRINT_MODE`
- [ ] `npm test` passando
- [ ] `npm run dev` rodando
- [ ] Endpoint `/api/labels/print` respondendo
- [ ] Widget com botão "Imprimir"
- [ ] Teste com `dryRun=true` (visualizar ZPL)
- [ ] Teste com `dryRun=false` (imprimir real)
- [ ] Etiqueta saindo correta da Zebra

**Pronto para produção!** 🚀
