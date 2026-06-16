# Especificações Zebra ZD220T - Dimensões e DPI

**Impressora**: Zebra ZD220T  
**Data**: 2026-06-16

---

## 📊 Especificações Técnicas

| Especificação | Valor |
|---------------|-------|
| **Resolução** | 203 DPI (padrão para térmicas) |
| **Largura máxima papel** | 104mm (4.1 polegadas) |
| **Altura máxima papel** | Contínua (até ~1524mm) |
| **Velocidade impressão** | até 152mm/s |
| **Tecnologia** | Térmica direta |

---

## 🔢 Conversão DPI → Dots

```
1 polegada = 203 dots @ 203 DPI
1mm ≈ 8 dots @ 203 DPI

Exemplos:
- 100mm = 100 × 8 = 800 dots
- 150mm = 150 × 8 = 1200 dots
- 104mm = 104 × 8 = 832 dots
- 152mm = 152 × 8 = 1216 dots
```

---

## 📦 Tamanhos de Etiqueta Recomendados (Brasil)

### **Opção 1: A6 (100x150mm) - VERTICAL** ✅ Recomendado

```
Dimensões: 100mm (L) × 150mm (A)
Em dots: 800 × 1200 dots

Vantagens:
✅ Padrão Brasil (A6)
✅ Cabe bem na mão do entregador
✅ Espaço suficiente para endereço completo
✅ Melhor legibilidade

ZPL Config:
^PW800   (800 dots = 100mm)
^LL1200  (1200 dots = 150mm)
```

### **Opção 2: 4x6 polegadas (101.6x152.4mm) - VERTICAL**

```
Dimensões: 4 polegadas (L) × 6 polegadas (A)
Em dots: 812 × 1216 dots

Vantagens:
✅ Padrão internacional
✅ Compatível com etiquetadoras standard

ZPL Config:
^PW812   (812 dots = 4")
^LL1216  (1216 dots = 6")
```

### **Opção 3: 104x152mm (máximo horizontal) - VERTICAL**

```
Dimensões: 104mm (L) × 152mm (A)
Em dots: 832 × 1216 dots

Vantagens:
✅ Usa largura máxima da Zebra
✅ Mais espaço para design

ZPL Config:
^PW832   (832 dots = 104mm)
^LL1216  (1216 dots = 152mm)
```

---

## ❌ ERRADO (Horizontal - o que está acontecendo agora)

```
Dimensões: 150mm (L) × 100mm (A)
Em dots: 1200 × 800 dots

❌ Problema:
- Ultrapassa 104mm de largura da impressora
- Papel sai horizontal
- Texto fica cortado ou deformado
```

---

## ✅ SOLUÇÃO RECOMENDADA

**Use Opção 1: A6 (100x150mm) VERTICAL**

```
^PW800   (largura: 100mm)
^LL1200  (altura: 150mm)
```

Este é o tamanho padrão para etiquetas de entrega no Brasil.

---

## 🎯 Como Ajustar o ZPL

**Arquivo a modificar**: `src/domain/zpl-printer.ts`

Linha 33-34:
```typescript
// ERRADO (atual - horizontal)
"^PW800", // Print width: 100mm
"^LL1200", // Label length: 150mm

// CORRETO (novo - vertical)
"^PW800", // Print width: 100mm (largura do papel)
"^LL1200", // Label length: 150mm (altura do papel)
```

Se quer mudar para Opção 2 (4x6"):
```typescript
"^PW812", // Print width: 4 polegadas
"^LL1216", // Label length: 6 polegadas
```

---

## 📐 Visualizar Tamanho Correto

Usar labelary.com para preview com **Width: 4 inches, Height: 6 inches** (ou 100mm × 150mm).

---

## 🔧 Checklist de Ajuste

- [ ] Confirmado: Papel carregado é 100×150mm (ou 4×6")
- [ ] Ajustado ZPL: ^PW800 e ^LL1200 (ou 812/1216)
- [ ] Testado: Preview em labelary.com
- [ ] Impresso: Etiqueta saiu vertical, não horizontal
- [ ] Validado: Texto legível, sem cortes

---

## 📞 Referências

- [Zebra ZD220T Datasheet](https://www.zebra.com/content/dam/zebra_new_ia/en_us/solutions/products/printers/desktop/zd220t/zd220t-thermal-transfer-printer-datasheet-en-us.pdf)
- [ZPL Manual - Page Setup](https://www.zebra.com/content/dam/zebra_new_ia/en_us/solutions/products/printers/link-os/zpl-commands.pdf)
- [Labelary.com Viewer](http://labelary.com/viewer.html)
