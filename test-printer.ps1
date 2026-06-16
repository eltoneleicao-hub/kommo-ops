# test-printer.ps1
# Script PowerShell para validar impressora Zebra ZD220T
# Uso: powershell -ExecutionPolicy Bypass -File test-printer.ps1

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Validacao Zebra ZD220T" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# ETAPA 1: VERIFICAR HARDWARE
# ============================================================================

Write-Host "ETAPA 1: Verificando Hardware..." -ForegroundColor Yellow
Write-Host ""

# Listar impressoras
Write-Host "Impressoras conectadas:" -ForegroundColor Cyan
$printers = Get-Printer | Select-Object Name, Status

if ($printers) {
    $printers | Format-Table -AutoSize
    $zebra = $printers | Where-Object { $_.Name -like "*ZD220*" -or $_.Name -like "*ZDesigner*" }
    if ($zebra) {
        Write-Host "[OK] Zebra ZD220T encontrada: $($zebra.Name)" -ForegroundColor Green
    }
    else {
        Write-Host "[AVISO] Zebra nao encontrada em Get-Printer" -ForegroundColor Yellow
    }
}
else {
    Write-Host "[AVISO] Nenhuma impressora detectada" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# ETAPA 2: VERIFICAR BACKEND
# ============================================================================

Write-Host "ETAPA 2: Verificando Backend..." -ForegroundColor Yellow
Write-Host ""

$backendOk = $false
for ($i = 1; $i -le 5; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/api/labels/print" -Method Post -TimeoutSec 1 -ErrorAction Stop
        $backendOk = $true
        break
    }
    catch {
        if ($i -lt 5) {
            Write-Host "Tentativa $i/5..." -ForegroundColor Gray
            Start-Sleep -Seconds 1
        }
    }
}

if ($backendOk -or (Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue).StatusCode -eq 404) {
    Write-Host "[OK] Backend Next.js esta rodando em http://localhost:3000" -ForegroundColor Green
}
else {
    Write-Host "[ERRO] Backend nao esta respondendo em http://localhost:3000" -ForegroundColor Red
    Write-Host "Execute: npm run dev" -ForegroundColor Gray
    Exit 1
}

Write-Host ""

# ============================================================================
# ETAPA 3: COLETAR INFORMACOES
# ============================================================================

Write-Host "ETAPA 3: Coletando Informacoes..." -ForegroundColor Yellow
Write-Host ""

$labelId = Read-Host "ID da Etiqueta (ex: clvjz123abc)"
if (-not $labelId) {
    Write-Host "[ERRO] Label ID e obrigatorio" -ForegroundColor Red
    Exit 1
}

$secret = Read-Host "Secret Key (ex: seu-secret-aqui)"
if (-not $secret) {
    Write-Host "[ERRO] Secret e obrigatorio" -ForegroundColor Red
    Exit 1
}

Write-Host ""

# ============================================================================
# ETAPA 4: TESTE DRY RUN (PREVIEW)
# ============================================================================

Write-Host "ETAPA 4: Teste DRY RUN (Preview ZPL)..." -ForegroundColor Yellow
Write-Host ""

$body = @{
    labelId = $labelId
    secret = $secret
    dryRun = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Method Post `
        -Uri "http://localhost:3000/api/labels/print" `
        -ContentType 'application/json' `
        -Body $body `
        -TimeoutSec 10

    Write-Host "[OK] DRY RUN Sucesso!" -ForegroundColor Green
    Write-Host "Status: $($response.status)" -ForegroundColor Cyan
    Write-Host ""

    if ($response.preview) {
        Write-Host "Preview ZPL:" -ForegroundColor Cyan
        Write-Host $response.preview -ForegroundColor Magenta
        Write-Host ""
        $openChoice = Read-Host "Abrir no navegador? (S/n)"

        if ($openChoice -ne "n" -and $openChoice -ne "N") {
            Start-Process $response.preview
            Write-Host "Abrindo no navegador..." -ForegroundColor Green
        }
    }

}
catch {
    Write-Host "[ERRO] Erro no DRY RUN:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Exit 1
}

Write-Host ""

# ============================================================================
# ETAPA 5: TESTE IMPRESSAO REAL
# ============================================================================

Write-Host "[AVISO] Proximo passo vai enviar para impressora!" -ForegroundColor Yellow
Write-Host "Certifique-se de que:"
Write-Host "  - Papel 100x150mm esta carregado"
Write-Host "  - Zebra esta ligada e pronta"
Write-Host ""

$continueTest = Read-Host "Continuar com impressao real? (S/n)"
if ($continueTest -eq "n" -or $continueTest -eq "N") {
    Write-Host "Teste DRY RUN concluido. Impressao cancelada." -ForegroundColor Cyan
    Exit 0
}

Write-Host ""
Write-Host "ETAPA 5: Enviando para Impressora..." -ForegroundColor Yellow
Write-Host ""

$bodyPrint = @{
    labelId = $labelId
    secret = $secret
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Method Post `
        -Uri "http://localhost:3000/api/labels/print" `
        -ContentType 'application/json' `
        -Body $bodyPrint `
        -TimeoutSec 10

    Write-Host "[OK] IMPRESSAO ENVIADA!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Detalhes:" -ForegroundColor Cyan
    Write-Host "  Status: $($response.status)"
    Write-Host "  Label ID: $($response.labelId)"
    Write-Host "  Printer: $($response.printer)"
    Write-Host "  Timestamp: $($response.printedAt)"
    Write-Host ""
    Write-Host "Verificar a saida da Zebra em 3-5 segundos..." -ForegroundColor Yellow

}
catch {
    Write-Host "[ERRO] Erro na Impressao:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Exit 1
}

Write-Host ""

# ============================================================================
# ETAPA 6: VERIFICACAO FINAL
# ============================================================================

Write-Host "ETAPA 6: Verificacao Final..." -ForegroundColor Yellow
Write-Host ""

Write-Host "Checklist da Etiqueta:" -ForegroundColor Cyan
Write-Host "  [ ] Etiqueta saiu da impressora"
Write-Host "  [ ] Texto esta legivel"
Write-Host "  [ ] Tamanho correto (100x150mm)"
Write-Host "  [ ] Nome em maiuscula"
Write-Host "  [ ] Endereco completo"
Write-Host "  [ ] Telefone"
Write-Host "  [ ] Regiao/Anotacao"
Write-Host "  [ ] Sem cortes"
Write-Host ""

$allOk = Read-Host "Etiqueta OK? (S/n)"
if ($allOk -ne "n" -and $allOk -ne "N") {
    Write-Host ""
    Write-Host "================================" -ForegroundColor Green
    Write-Host "[OK] VALIDACAO COMPLETA!" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Impressora Zebra ZD220T esta funcionando corretamente." -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Cyan
    Write-Host "  1. Task 6 - Implementar UI do Painel" -ForegroundColor Gray
    Write-Host "  2. Adicionar botao Imprimir na tela de etiquetas" -ForegroundColor Gray
    Write-Host "  3. Task 7 - Docker + n8n para automacao" -ForegroundColor Gray
}
else {
    Write-Host ""
    Write-Host "[AVISO] Problemas detectados:" -ForegroundColor Yellow
    Write-Host "  - Verificar documentacao: docs/VALIDACAO-ZEBRA-PASSO-A-PASSO.md" -ForegroundColor Gray
    Write-Host "  - Secao: Troubleshooting" -ForegroundColor Gray
}

Write-Host ""
