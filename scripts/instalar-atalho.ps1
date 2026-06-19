<#
.SYNOPSIS
  Instala o atalho "Agente de Impressão" na Área de Trabalho e pré-configura o agente.
.DESCRIPTION
  - Cria %LOCALAPPDATA%\KommoAgente\config.json (se ainda não existir) com os
    valores padrão (impressora, URL, secret, intervalo, caminho do agente).
  - Cria um atalho clicável na Área de Trabalho que abre o app (janela com botões),
    sem console, com ícone de impressora.
  Rode uma vez:  powershell -ExecutionPolicy Bypass -File instalar-atalho.ps1
#>

$ErrorActionPreference = 'Stop'
$scriptsDir = $PSScriptRoot
$gui        = Join-Path $scriptsDir 'agente-impressao-gui.ps1'
$agent      = Join-Path $scriptsDir 'print-agent.ps1'

if (-not (Test-Path $gui))   { throw "Não achei agente-impressao-gui.ps1 em $scriptsDir" }
if (-not (Test-Path $agent)) { throw "Não achei print-agent.ps1 em $scriptsDir" }

# 1) Config inicial (não sobrescreve se já existir) ----------------------------
$cfgDir  = Join-Path $env:LOCALAPPDATA 'KommoAgente'
$cfgPath = Join-Path $cfgDir 'config.json'
if (-not (Test-Path $cfgPath)) {
  New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
  @{
    ApiUrl          = 'https://kommo-ops.vercel.app'
    Secret          = ''             # em branco por segurança — preencha 1x no botão "Configurar"
    PrinterName     = 'ZDesigner ZD220-203dpi ZPL'
    IntervalSeconds = 5
    AgentScript     = $agent
  } | ConvertTo-Json | Set-Content -Path $cfgPath -Encoding UTF8
  Write-Host "[ok] Config criada em $cfgPath" -ForegroundColor Green
} else {
  Write-Host "[skip] Config já existe em $cfgPath (não sobrescrita)" -ForegroundColor DarkGray
}

# 2) Atalho na Área de Trabalho ------------------------------------------------
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Agente de Impressão.lnk'
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath       = (Get-Command powershell.exe).Source
$lnk.Arguments        = "-STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$gui`""
$lnk.WorkingDirectory = $scriptsDir
$lnk.IconLocation     = "$env:SystemRoot\System32\shell32.dll,16"
$lnk.Description       = 'Liga e desliga o agente de impressão de etiquetas'
$lnk.WindowStyle      = 7
$lnk.Save()
Write-Host "[ok] Atalho criado: $lnkPath" -ForegroundColor Green
Write-Host ""
Write-Host "Pronto! Dê dois cliques em 'Agente de Impressão' na Área de Trabalho." -ForegroundColor Cyan
