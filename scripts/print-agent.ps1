<#
.SYNOPSIS
  Agente de impressão local — ponte entre o backend na nuvem (Vercel) e a
  impressora Zebra ZD220T conectada neste PC.

.DESCRIPTION
  Faz polling das etiquetas pendentes na nuvem e imprime na Zebra local:

    1. GET  {ApiUrl}/api/labels/pending?secret=...   (pega pendentes)
    2. PATCH /api/labels/{id}/claim                  (trava: pendente -> processando)
    3. POST  /api/labels/print {dryRun:true}         (pega o ZPL da nuvem)
    4. envia o ZPL RAW p/ a Zebra (winspool, sem GDI) — UMA etiqueta por job
    5. confirma que o job saiu da fila SEM erro/pausa (até ConfirmTimeoutSec)
    6. PATCH /api/labels/{id}/printed   (ou /error se não confirmou)

  O ZPL é gerado na nuvem (fonte única da verdade); o agente só imprime os bytes.

  Cada etiqueta é um job separado e só vira "impresso" depois que o Windows
  confirma que o job concluiu sem erro — assim a impressora sem etiqueta/ribbon
  (ou em pausa) NÃO marca "impresso" fantasma. Limite conhecido: se o driver
  bufferiza e descarta os bytes sem reportar estado, a confirmação por fila não
  detecta; a garantia 100% exigiria leitura bidirecional (~HS) da Zebra.

.PARAMETER ApiUrl
  URL do backend. Default: https://kommo-ops.vercel.app

.PARAMETER Secret
  KOMMO_WEBHOOK_SECRET (mesmo valor do backend). Obrigatório.

.PARAMETER PrinterName
  Nome exato da impressora no Windows. Default: "ZDesigner ZD220-203dpi ZPL".
  Veja os nomes com:  Get-Printer | Select-Object Name

.PARAMETER IntervalSeconds
  Intervalo entre verificações. Default: 5.

.PARAMETER Once
  Roda uma única passada e sai (útil para teste). Sem isso, roda em loop.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File print-agent.ps1 -Secret "meu-secret" -Once

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File print-agent.ps1 -Secret "meu-secret"
#>

param(
  [string]$ApiUrl = $env:AGENT_API_URL,
  [string]$Secret = $env:KOMMO_WEBHOOK_SECRET,
  [string]$PrinterName = $env:ZEBRA_PRINTER_NAME,
  [int]$IntervalSeconds = 5,
  # Segundos p/ confirmar que CADA etiqueta saiu da fila sem erro antes de marcar
  # "impresso". Se estourar (ou a fila acusar erro/pausa/papel), marca ERRO — a
  # etiqueta aparece como pendência no relatório em vez de "impresso" fantasma.
  [int]$ConfirmTimeoutSec = 25,
  [switch]$Once
)

# ── Defaults ────────────────────────────────────────────────────────────────
if (-not $ApiUrl)      { $ApiUrl = "https://kommo-ops.vercel.app" }
if (-not $PrinterName) { $PrinterName = "ZDesigner ZD220-203dpi ZPL" }
$ApiUrl = $ApiUrl.TrimEnd("/")

if (-not $Secret) {
  Write-Host "[ERRO] Secret é obrigatório. Use -Secret '...' ou defina KOMMO_WEBHOOK_SECRET." -ForegroundColor Red
  exit 1
}

# TLS 1.2 (PowerShell 5.1 pode defaultar p/ TLS 1.0 e falhar no HTTPS da Vercel)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ── Impressão RAW via winspool (envia ZPL cru, sem o driver renderizar) ───────
if (-not ("RawPrinter" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
    static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendBytes(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("OpenPrinter falhou (impressora '" + printerName + "' nao encontrada?)");
        try {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "ZPL_Label";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di)) throw new Exception("StartDocPrinter falhou");
            try {
                if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter falhou");
                IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
                try {
                    Marshal.Copy(bytes, 0, pBytes, bytes.Length);
                    int written;
                    if (!WritePrinter(hPrinter, pBytes, bytes.Length, out written))
                        throw new Exception("WritePrinter falhou");
                } finally { Marshal.FreeCoTaskMem(pBytes); }
                EndPagePrinter(hPrinter);
            } finally { EndDocPrinter(hPrinter); }
        } finally { ClosePrinter(hPrinter); }
    }
}
"@
}

function Test-PrinterReady {
  $printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
  if (-not $printer) {
    Write-Host "[AVISO] Impressora '$PrinterName' não encontrada." -ForegroundColor Yellow
    return $false
  }
  # Impressora marcada como OFFLINE no Windows (travou / cabo USB solto / desligou).
  # Aborta ANTES de reivindicar: as etiquetas seguem PENDENTES e o agente reimprime
  # sozinho quando ela voltar — nunca marca "impresso" sem sair papel.
  $wmi = Get-CimInstance Win32_Printer -Filter "Name='$PrinterName'" -ErrorAction SilentlyContinue
  if ($wmi -and $wmi.WorkOffline) {
    Write-Host "[AVISO] Impressora OFFLINE no Windows. Etiquetas seguem PENDENTES (nada marcado como impresso)." -ForegroundColor Yellow
    Write-Host "       Religue a Zebra / cheque o cabo USB; o agente reimprime sozinho quando voltar." -ForegroundColor DarkGray
    return $false
  }
  # Jobs presos de rodadas anteriores (sintoma de driver corrompido)
  $stuck = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue |
             Where-Object { $_.Size -eq 0 })
  if ($stuck.Count -gt 0) {
    Write-Host "[AVISO] $($stuck.Count) job(s) travado(s) na fila (Size=0). Limpando..." -ForegroundColor Yellow
    $stuck | Remove-PrintJob -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    $still = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue | Where-Object { $_.Size -eq 0 })
    if ($still.Count -gt 0) {
      Write-Host "[ERRO] Jobs ainda presos. Driver pode estar corrompido." -ForegroundColor Red
      Write-Host "       Solução: reinicie o Spooler ou reinstale o driver ZDesigner." -ForegroundColor Red
      Write-Host "       Stop-Service Spooler -Force; Remove-Item `"`$env:WINDIR\System32\spool\PRINTERS\*`" -Force; Start-Service Spooler" -ForegroundColor DarkGray
      return $false
    }
    Write-Host "[OK] Fila limpa — continuando." -ForegroundColor Green
  }
  return $true
}

# Envia UMA etiqueta e só retorna quando o Windows confirma que o job concluiu
# SEM erro/pausa. Lança exceção em qualquer não-confirmação (driver corrompido,
# sem papel/ribbon, tampa aberta, offline, ou timeout) — o chamador marca ERRO,
# nunca "impresso" fantasma. Limite: se o driver descartar os bytes sem reportar
# estado, a fila esvazia e isto retorna OK mesmo sem papel (ver cabeçalho).
function Send-OneAndConfirm {
  param([string]$Zpl, [int]$TimeoutSec = 25)

  # IDs já na fila antes de enviar (p/ identificar o job desta etiqueta).
  $before = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue |
              Select-Object -ExpandProperty Id)

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Zpl)
  [RawPrinter]::SendBytes($PrinterName, $bytes)

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $appeared = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    $jobs = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction SilentlyContinue)

    # Job preso com Size=0 => driver ZDesigner corrompido.
    $z = @($jobs | Where-Object { $_.Size -eq 0 })
    if ($z.Count -gt 0) {
      $z | Remove-PrintJob -ErrorAction SilentlyContinue
      throw "Job preso na fila (Size=0) — driver ZDesigner corrompido. Reinstale o driver."
    }

    # Estado de erro/pausa/intervenção => a impressora NÃO concluiu (sem papel,
    # ribbon, tampa aberta, offline...). Não marca impresso.
    $bad = @($jobs | Where-Object { "$($_.JobStatus)" -match "Error|Paused|Blocked|Offline|PaperOut|UserIntervention|Deleting" })
    if ($bad.Count -gt 0) {
      $st = (($bad | ForEach-Object { "$($_.JobStatus)" }) | Select-Object -Unique) -join ", "
      $bad | Remove-PrintJob -ErrorAction SilentlyContinue
      throw "Impressora nao concluiu (status: $st). Verifique etiqueta/ribbon/tampa."
    }

    $mine = @($jobs | Where-Object { $before -notcontains $_.Id })
    if ($mine.Count -gt 0) { $appeared = $true }

    # Concluiu: fila vazia, ou o job desta etiqueta apareceu e já saiu.
    if ($jobs.Count -eq 0 -or ($appeared -and $mine.Count -eq 0)) { return }
  }
  throw "Tempo esgotado ($TimeoutSec s) sem confirmar a saida da etiqueta."
}

# ── Chamadas HTTP ─────────────────────────────────────────────────────────────
function Get-Pending {
  $uri = "$ApiUrl/api/labels/pending?secret=$([uri]::EscapeDataString($Secret))"
  return Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 30
}

function Invoke-Claim {
  param([string]$Id)
  $body = @{ secret = $Secret } | ConvertTo-Json
  return Invoke-RestMethod -Uri "$ApiUrl/api/labels/$Id/claim" -Method Patch -ContentType "application/json" -Body $body -TimeoutSec 30
}

function Get-Zpl {
  param([string]$Id)
  $body = @{ labelId = $Id; secret = $Secret; dryRun = $true } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri "$ApiUrl/api/labels/print" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30
  return $res.zplContent
}

function Set-Printed {
  param([string]$Id)
  $body = @{ secret = $Secret } | ConvertTo-Json
  Invoke-RestMethod -Uri "$ApiUrl/api/labels/$Id/printed" -Method Patch -ContentType "application/json" -Body $body -TimeoutSec 30 | Out-Null
}

function Set-Error {
  param([string]$Id, [string]$Message)
  $body = @{ secret = $Secret; errorMessage = $Message } | ConvertTo-Json
  try {
    Invoke-RestMethod -Uri "$ApiUrl/api/labels/$Id/error" -Method Patch -ContentType "application/json" -Body $body -TimeoutSec 30 | Out-Null
  } catch {}
}

# ── Processa as etiquetas, UMA por job, com confirmação de saída ─────────────
# Cada etiqueta é reivindicada, impressa e confirmada individualmente. Só vira
# "impresso" depois que o Windows confirma que o job concluiu sem erro. Assim, se
# a mídia/ribbon acabar no meio, a etiqueta do momento vira ERRO (visível no
# relatório) e o lote é interrompido — as demais seguem PENDENTES (não foram
# reivindicadas) e voltam na próxima passada, sem "impresso" fantasma.
function Process-Batch {
  param($Labels)

  Write-Host "  → imprimindo até $($Labels.Count) etiqueta(s), uma a uma (com confirmação)..." -ForegroundColor Cyan
  foreach ($label in $Labels) {
    $id   = $label.id
    $nome = $label.recipientName

    # 1. Claim (pendente -> processando). Já reivindicada/concluída => pula.
    try {
      $claim = Invoke-Claim -Id $id
      if ($claim.alreadyClaimed) {
        Write-Host "  [skip] $id já reivindicada por outro agente" -ForegroundColor DarkGray
        continue
      }
    } catch {
      Write-Host "  [skip] $id já processada/concluída" -ForegroundColor DarkGray
      continue
    }

    # 2. Busca o ZPL desta etiqueta.
    $zpl = $null
    try {
      $zpl = Get-Zpl -Id $id
      if (-not $zpl) { throw "ZPL vazio retornado pela nuvem" }
    } catch {
      $msg = $_.Exception.Message
      Write-Host "  [ERRO] ${id} (get ZPL): $msg" -ForegroundColor Red
      Set-Error -Id $id -Message $msg
      continue   # problema só desta etiqueta — segue para a próxima
    }

    # 3. Envia e confirma a saída na fila; só então marca impresso.
    try {
      Send-OneAndConfirm -Zpl ($zpl.Trim()) -TimeoutSec $ConfirmTimeoutSec
    } catch {
      $msg = $_.Exception.Message
      Write-Host "  [ERRO] $id ($nome): $msg" -ForegroundColor Red
      Set-Error -Id $id -Message $msg
      # Falha de impressora (sem mídia/ribbon/pausa) afeta as próximas também:
      # interrompe o lote. As ainda-não-reivindicadas seguem pendentes.
      Write-Host "  [PARA] Impressora não confirmou — interrompendo; as demais seguem pendentes." -ForegroundColor Yellow
      return
    }

    # 4. Marca impresso.
    try {
      Set-Printed -Id $id
      Write-Host "  [OK] $id ($nome)" -ForegroundColor Green
    } catch {
      Write-Host "  [AVISO] $id saiu mas falhou ao marcar 'impresso': $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

# ── Uma passada ──────────────────────────────────────────────────────────────
function Invoke-Pass {
  try {
    $pending = Get-Pending
  } catch {
    Write-Host "[ERRO] Falha ao buscar pendentes: $($_.Exception.Message)" -ForegroundColor Red
    return
  }
  $count = @($pending).Count
  if ($count -eq 0) { return }
  Write-Host "$([DateTime]::Now.ToString('HH:mm:ss')) — $count etiqueta(s) pendente(s)" -ForegroundColor White
  if (-not (Test-PrinterReady)) {
    Write-Host "[ABORTANDO] Impressora não está pronta. Corrija e rode novamente." -ForegroundColor Red
    return
  }
  Process-Batch -Labels $pending
}

# ── Início ────────────────────────────────────────────────────────────────────
Write-Host "================================" -ForegroundColor Cyan
Write-Host " Agente de Impressão — Kommo Ops" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host " API.......: $ApiUrl"
Write-Host " Impressora: $PrinterName"
Write-Host " Intervalo.: $IntervalSeconds s"
Write-Host " Confirmar.: até $ConfirmTimeoutSec s por etiqueta (uma a uma)"
Write-Host " Modo......: $(if ($Once) { 'única passada' } else { 'loop contínuo (Ctrl+C p/ parar)' })"
Write-Host ""

if ($Once) {
  Invoke-Pass
} else {
  while ($true) {
    Invoke-Pass
    Start-Sleep -Seconds $IntervalSeconds
  }
}
