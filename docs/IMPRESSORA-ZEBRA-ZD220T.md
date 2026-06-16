# Configuração: Impressora Zebra ZD220T

**Data**: 2026-06-16  
**Modelo**: Zebra ZD220T  
**Formato**: Etiquetas 100x150mm (padrão Brasil)  
**Conexão**: USB ou Rede (Ethernet)

---

## 📋 Visão Geral

Zebra ZD220T é impressora térmica para etiquetas de entrega.

```
Seu Sistema (Next.js)
  ↓
n8n / Print Adapter
  ↓
Zebra ZD220T
  ↓
Etiqueta impressa
```

**Opções de integração:**

| Opção | Latência | Custo | Complexidade |
|-------|----------|-------|--------------|
| **A: PrintNode** | 2-3s | $10-20/mês | Baixa |
| **B: ZPL direto** | <1s | Grátis | Média |
| **C: CUPS (Linux)** | 1s | Grátis | Média-Alta |
| **D: Agente local** | <1s | Grátis | Alta |

**Recomendação para MVP**: **Opção A (PrintNode)** — simples, funciona, pode escalar depois.

---

## 🔧 Opção A: PrintNode (Recomendada para MVP)

### 1. Criar conta PrintNode

1. Acesse: https://www.printnode.com/en
2. Sign Up → escolha plano Free ($0/mês) ou Pro ($10/mês)
3. Após login, obtenha sua **API Key** (Settings → API)

### 2. Instalar PrintNode Client

**Windows:**

1. Download: https://www.printnode.com/en/download
2. Execute instalador
3. Depois de instalar, abre PrintNode Client (aparece na bandeja do sistema)
4. PrintNode automaticamente detecta impressoras conectadas

**Linux:**
```bash
sudo apt-get install printnode-client
```

### 3. Registrar Impressora

No PrintNode Client:

1. Deve detectar "Zebra ZD220T" automaticamente
2. Se não: clique "Add printer" → selecione "Zebra ZD220T"
3. Clique para confirmar

**No PrintNode Web (https://app.printnode.com):**

1. Vá em "Printers"
2. Deve listar a ZD220T com ID
3. **Copie o ID da impressora** (ex: `12345`)

### 4. Gerar PDF da Etiqueta

Seu backend já gera etiqueta como texto. Precisa converter para PDF:

```typescript
import PDFDocument from 'pdfkit';
import fs from 'fs';

export async function generateLabelPDF(labelText: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [283, 425] }); // 100x150mm em pontos
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(10).text(labelText, 20, 20, { width: 243 });
    doc.end();
  });
}
```

### 5. Endpoint para Imprimir via PrintNode

**Novo endpoint**: `POST /api/labels/{id}/print`

```typescript
import { NextRequest, NextResponse } from "next/server";

const PRINTNODE_API_KEY = process.env.PRINTNODE_API_KEY;
const PRINTNODE_PRINTER_ID = process.env.PRINTNODE_PRINTER_ID;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Buscar label no banco
    const label = await prisma.label.findUnique({
      where: { id: params.id },
      include: { request: true },
    });

    if (!label) {
      return NextResponse.json({ error: "label_not_found" }, { status: 404 });
    }

    // 2. Gerar PDF
    const pdfBuffer = await generateLabelPDF(label.content);

    // 3. Enviar para PrintNode
    const printResponse = await fetch(
      `https://api.printnode.com/printjobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRINTNODE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          printerId: parseInt(PRINTNODE_PRINTER_ID),
          contentType: "pdf_base64",
          content: pdfBuffer.toString("base64"),
          title: `Etiqueta-${label.id}`,
        }),
      }
    );

    const printData = await printResponse.json();

    if (!printResponse.ok) {
      throw new Error(printData.message || "PrintNode error");
    }

    // 4. Atualizar status no banco
    await prisma.label.update({
      where: { id: params.id },
      data: {
        printStatus: "impresso",
        printedAt: new Date(),
      },
    });

    return NextResponse.json({
      status: "impresso",
      printJobId: printData.id,
      printer: PRINTNODE_PRINTER_ID,
    });
  } catch (error) {
    console.error("[Print] Erro:", error);
    return NextResponse.json(
      { error: "print_failed", message: error.message },
      { status: 500 }
    );
  }
}
```

### 6. Configurar .env

```env
PRINTNODE_API_KEY=your-api-key-here
PRINTNODE_PRINTER_ID=12345  # ID da Zebra ZD220T
```

### 7. Testar

```powershell
$labelId = "label-123"  # ID real do banco

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/labels/$labelId/print" `
  -ContentType 'application/json'
```

**Resposta esperada:**
```json
{
  "status": "impresso",
  "printJobId": "987654",
  "printer": "12345"
}
```

---

## ⚙️ Opção B: ZPL Direto (Mais Rápido)

Se quer evitar PrintNode, pode gerar **ZPL** (linguagem nativa da Zebra).

### ZPL Basics

```zpl
^XA
^FO50,50
^A0N,28,28
^FD
MARIA SILVA
^FS
^FO50,100
^A0N,20,20
^FDRua X, 123^FS
^FO50,150
^A0N,20,20
^FDCEP 12345-678^FS
^XZ
```

### Função para gerar ZPL

```typescript
export function renderLabelZPL(input: LabelInput): string {
  const lines = [
    "^XA",
    "^PW812",  // Width: 100mm = 812 dots @ 203dpi
    "^LL1128", // Height: 150mm = 1128 dots
    "^LH0,0",  // Label Home
    "",
    // Destinatário
    "^FO30,50",
    "^A0N,32,32",
    `^FD${clean(input.recipientName).toUpperCase()}^FS`,
    "",
    // Endereço
    "^FO30,120",
    "^A0N,24,24",
    `^FD${clean(input.street)}, ${clean(input.number)}^FS`,
    "",
    // Bairro
    "^FO30,160",
    "^A0N,20,20",
    `^FD${clean(input.neighborhood)}^FS`,
    "",
    // Cidade e CEP
    "^FO30,200",
    "^A0N,20,20",
    `^FD${clean(input.city)} - CEP ${clean(input.postalCode)}^FS`,
    "",
    // Telefone
    "^FO30,240",
    "^A0N,20,20",
    `^FDTelefone: ${clean(input.recipientPhone)}^FS`,
    "",
    // Região
    "^FO30,280",
    "^A0B,24,24",
    `^FDREGIAO: ${clean(input.internalOrderNotes)}^FS`,
    "",
    "^XZ",
  ];

  return lines.join("\n");
}
```

### Enviar para Zebra via USB

```typescript
import { exec } from "child_process";
import fs from "fs";

export async function printZPLToZebra(zplContent: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Windows: enviar para printer via raw print
    const cmd = `copy /b CON: "Zebra ZD220T"`;

    const proc = exec(cmd, (error) => {
      if (error) reject(error);
      else resolve();
    });

    proc.stdin?.write(zplContent);
    proc.stdin?.end();
  });
}
```

**Mais simples que PrintNode, mas requer acesso direto à impressora no servidor.**

---

## 📦 Integração com n8n

### Workflow n8n: Imprimir Etiqueta

1. **Trigger**: HTTP Request (webhook)
   ```
   POST /webhook/print-label
   Body: { labelId: "...", leadId: "..." }
   ```

2. **Fetch Label**: HTTP GET
   ```
   GET https://seu-sistema/api/labels/{labelId}
   ```

3. **Call PrintNode**: HTTP POST
   ```
   POST https://api.printnode.com/printjobs
   Headers: Authorization: Bearer {PRINTNODE_API_KEY}
   Body: { printerId, contentType: "pdf_base64", content: "..." }
   ```

4. **Update Status**: HTTP PATCH
   ```
   PATCH https://seu-sistema/api/labels/{labelId}/print
   ```

5. **Notify Kommo**: HTTP PATCH
   ```
   PATCH https://seu-account.kommo.com/api/v4/leads/{leadId}
   Body: { status_id: "...", note: "Etiqueta impressa" }
   ```

---

## 🔌 Conexão Física

### Via USB

1. Conectar Zebra ZD220T ao computador via USB
2. Windows: automaticamente instala drivers
3. Linux: `sudo apt-get install cups` + configurar em CUPS

### Via Ethernet (Recomendado para VPS)

1. Configurar IP estático na Zebra:
   - Menu na impressora: Settings → Network → DHCP OFF
   - IP: 192.168.1.100 (exemplo)
   
2. Testar ping:
   ```bash
   ping 192.168.1.100
   ```

3. Acessar interface web: `http://192.168.1.100`

4. Em PrintNode: "Add Printer" → buscar por IP

---

## 🧪 Testes

### Teste 1: Zebra Responde

```bash
# Windows
ping 192.168.1.100

# Linux
curl http://192.168.1.100/status
```

### Teste 2: PrintNode Vê a Impressora

```bash
curl -H "Authorization: Bearer $PRINTNODE_API_KEY" \
  https://api.printnode.com/printers
```

**Resposta:**
```json
[
  {
    "id": 12345,
    "name": "Zebra ZD220T",
    "status": "online",
    "capabilities": [...]
  }
]
```

### Teste 3: Imprimir Test Page

```powershell
$body = @{
  printerId = 12345
  contentType = "pdf_base64"
  content = "JVBERi0xLjQK..."  # PDF em base64
  title = "Test Label"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "https://api.printnode.com/printjobs" `
  -Headers @{ Authorization = "Bearer $apiKey" } `
  -ContentType 'application/json' `
  -Body $body
```

---

## 📋 Checklist de Implementação

### Opção A: PrintNode (Recomendado)

- [ ] Criar conta em printnode.com
- [ ] Instalar PrintNode Client
- [ ] Registrar Zebra ZD220T
- [ ] Copiar Printer ID
- [ ] Adicionar ao `.env`: `PRINTNODE_API_KEY`, `PRINTNODE_PRINTER_ID`
- [ ] Instalar `pdfkit`: `npm install pdfkit`
- [ ] Criar função `generateLabelPDF()`
- [ ] Criar endpoint `POST /api/labels/{id}/print`
- [ ] Testar com label real
- [ ] Integrar com widget (adicionar botão "Imprimir")

### Opção B: ZPL Direto

- [ ] Criar função `renderLabelZPL()`
- [ ] Testar ZPL em software de teste da Zebra
- [ ] Se USB: testar comando direto
- [ ] Se Rede: configurar IP estático na Zebra

---

## 🚨 Troubleshooting

### "Impressora offline em PrintNode"

1. Verificar se PrintNode Client está rodando
2. Verificar conexão USB/Rede
3. Reiniciar PrintNode Client

### "Print job fica pendente"

1. Verificar se impressora tem papel
2. Verificar fila de impressão (limpar jobs presos)
3. Testar com print simples (não PDF)

### "Etiqueta sai cortada"

1. Ajustar tamanho na função `generateLabelPDF()`
2. Verificar configuração de offset na ZPL
3. Fazer test print com tamanho padrão

---

## 📞 Recursos

- [PrintNode Docs](https://www.printnode.com/en/api)
- [Zebra ZPL Docs](https://www.zebra.com/en/us/products/software/printers/link-os/zpl.html)
- [ZPL Converter](http://labelary.com/viewer.html) — visualizar ZPL antes de imprimir

---

## 🎯 Próximos Passos

1. **Imediatamente**: Escolher entre PrintNode (A) ou ZPL direto (B)
2. **Task 7**: Integrar impressão no backend
3. **Widget**: Adicionar botão "Imprimir" que chama `/api/labels/{id}/print`
4. **n8n**: Criar workflow para imprimir automático (opcional)

Qual opção você prefere?
