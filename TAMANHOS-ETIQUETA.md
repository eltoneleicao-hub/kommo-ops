# Tamanhos de Etiqueta - Zebra ZD220T

## 🎯 Tamanho Atual (Correto)

**A6 - 100mm × 150mm (VERTICAL)**

```
┌─────────────────┐  ← 100mm (largura)
│                 │
│  MARIA SILVA    │  ↑
│                 │  │
│  Rua X, 123     │  150mm
│  Bairro Y       │  (altura)
│  Cidade - CEP   │  │
│                 │  ↓
│  Telefone       │
│  REGIAO         │
└─────────────────┘
```

**ZPL Config:**
```
^PW800    (largura: 100mm)
^LL1200   (altura: 150mm)
```

---

## ⚠️ Problema Detectado

Preview mostrando **HORIZONTAL** quando deveria ser **VERTICAL**.

**Causas possíveis:**

1. ❌ Papel carregado na Zebra é 150×100mm (invertido)
2. ❌ Preview do labelary.com interpretando errado
3. ❌ ZPL com orientação errada (já corrigido)

---

## ✅ Verificar Papel Carregado

**Na Zebra:**
```
Menu → Status/Info → Paper Width
```

Deve estar:
- **Largura: 100mm** (ou 4 polegadas)
- **Altura: 150mm** (ou 6 polegadas)

Se estiver invertido (150×100):
1. Remover papel
2. Girar 90 graus
3. Recarregar

---

## 🔄 Testar Novamente

1. Recarregar papel **VERTICAL** (100mm de largura)
2. Rodar teste com `dryRun = true`
3. Abrir preview no labelary.com
4. **Preview DEVE aparecer VERTICAL**
5. Se OK, imprimir real

---

## 📊 Tabela de Referência

| Tamanho | Largura | Altura | Dots | Tipo |
|---------|---------|--------|------|------|
| **A6 (padrão)** | 100mm | 150mm | 800×1200 | Vertical ✅ |
| 4×6" | 4" | 6" | 812×1216 | Vertical ✅ |
| Atual problema | 150mm | 100mm | 1200×800 | Horizontal ❌ |

---

## 🎬 Próximos Passos

1. **Verificar papel** na Zebra (deve ser vertical)
2. **Rodar teste** novamente com dryRun=true
3. **Abrir preview** e confirmar orientação
4. **Imprimir real** se OK

---

**Em dúvida sobre o tamanho certo?**

Ver: `docs/ZEBRA-ESPECIFICACOES.md`
