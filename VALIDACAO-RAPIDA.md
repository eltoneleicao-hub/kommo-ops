# Validação Zebra ZD220T - Início Rápido

**Tempo**: 5-10 minutos  
**Objetivo**: Testar se impressora está funcionando

---

## 🚀 3 Passos Rápidos

### PASSO 1️⃣: Preparar

```powershell
cd C:\Users\Balta\Desktop\KOMMO\kommo-ops

# Terminal 1: Rodar backend
npm run dev
```

Aguardar aparecer:
```
▲ Next.js 15.0.0
  - Local: http://localhost:3000
```

### PASSO 2️⃣: Executar teste

```powershell
# Terminal 2: Rodar script de teste
powershell -ExecutionPolicy Bypass -File test-printer.ps1
```

Script vai:
1. ✅ Verificar se Zebra está conectada
2. ✅ Testar backend
3. ✅ Gerar preview ZPL
4. ✅ Imprimir etiqueta de teste
5. ✅ Validar resultado

### PASSO 3️⃣: Resultado

```
✅ VALIDAÇÃO COMPLETA!

Impressora Zebra ZD220T está funcionando corretamente.
```

---

## 📋 O Que o Script Faz

```
┌─────────────────────────────────────────┐
│ ETAPA 1: Verificar Hardware             │
│ └─ Detectar Zebra ZD220T                │
├─────────────────────────────────────────┤
│ ETAPA 2: Verificar Backend              │
│ └─ Testar se npm run dev está rodando   │
├─────────────────────────────────────────┤
│ ETAPA 3: Coletar Informações            │
│ └─ Pedir Label ID e Secret              │
├─────────────────────────────────────────┤
│ ETAPA 4: Teste DRY RUN                  │
│ └─ Gerar e visualizar ZPL               │
├─────────────────────────────────────────┤
│ ETAPA 5: Impressão Real                 │
│ └─ Enviar para Zebra e imprimir         │
├─────────────────────────────────────────┤
│ ETAPA 6: Verificação Final              │
│ └─ Validar etiqueta impressa            │
└─────────────────────────────────────────┘
```

---

## 📌 Precisa de um Label ID Real?

Se não tiver etiqueta gerada ainda:

### Opção A: Via Widget Kommo

1. Abrir Kommo
2. Selecionar um lead
3. Clicar **[📄 Único]**
4. Modal → **[Confirmar]**
5. Aguardar "✓ Sucesso! Etiqueta #123 gerada"
6. Anotar o ID: `label-123`

### Opção B: Via Banco de Dados

```powershell
npx prisma studio

# Vai abrir: http://localhost:5555
# Ir em Label
# Copiar um ID (ex: clvjz123abc)
```

---

## ✨ Se Algo Dar Errado

| Erro | Solução |
|------|---------|
| "Backend não está respondendo" | Rodar `npm run dev` em outro terminal |
| "Label ID é obrigatório" | Gerar uma etiqueta antes (via Widget) |
| "Zebra não encontrada" | Conectar via USB ou verificar IP |
| "ZPL Preview errado" | Verificar dados do lead no Kommo |
| "Etiqueta não saiu" | Carregar papel 100x150mm na Zebra |

---

## 📖 Documentação Completa

Para detalhes completos, ver:
→ `docs/VALIDACAO-ZEBRA-PASSO-A-PASSO.md`

---

## ✅ Sucesso!

Depois de validado:
- Prosseguir para **Task 6 (UI do Painel)**
- Adicionar botão "Imprimir" na interface
- Integrar com Dashboard

---

**Começar agora:**

```powershell
powershell -ExecutionPolicy Bypass -File test-printer.ps1
```

🚀
