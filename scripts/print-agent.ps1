<#
.SYNOPSIS
  Agente de impressão local — ponte entre o backend na nuvem (Vercel) e a
  impressora Zebra ZD220T conectada neste PC.

.DESCRIPTION
  Faz polling das etiquetas pendentes na nuvem e imprime na Zebra local:

    1. GET  {ApiUrl}/api/labels/pending?secret=...   (pega pendentes)
    2. PATCH /api/labels/{id}/claim                  (trava: pendente -> processando)
    3. POST  /api/labels/print {dryRun:true}         (pega o ZPL da nuvem)
    4. envia o ZPL RAW p/ a Zebra (winspool, sem GDI)
    5. PATCH /api/labels/{id}/printed   (ou /error em caso de falha)

  O ZPL é gerado na nuvem (fonte única da verdade); o agente só imprime os bytes.

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

function Send-Zpl {
  param([string]$Zpl)
  $bytes = [System.Text.Encoding]::ASCII.GetBytes($Zpl)
  [RawPrinter]::SendBytes($PrinterName, $bytes)
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

# ── Processa uma etiqueta ────────────────────────────────────────────────────
function Process-Label {
  param($Label)
  $id = $Label.id
  $nome = $Label.recipientName

  # 1. Claim (trava contra impressão dupla)
  try {
    $claim = Invoke-Claim -Id $id
  } catch {
    Write-Host "  [skip] $id já processada/concluída" -ForegroundColor DarkGray
    return
  }
  if ($claim.alreadyClaimed) {
    Write-Host "  [skip] $id já reivindicada por outro agente" -ForegroundColor DarkGray
    return
  }

  Write-Host "  → imprimindo $id ($nome)..." -ForegroundColor Cyan

  # 2. Pega ZPL da nuvem + 3. imprime RAW
  try {
    $zpl = Get-Zpl -Id $id
    if (-not $zpl) { throw "ZPL vazio retornado pela nuvem" }
    Send-Zpl -Zpl $zpl
  } catch {
    $msg = $_.Exception.Message
    Write-Host "  [ERRO] ${id}: $msg" -ForegroundColor Red
    Set-Error -Id $id -Message $msg
    return
  }

  # 4. Marca impresso
  try {
    Set-Printed -Id $id
    Write-Host "  [OK] $id impresso" -ForegroundColor Green
  } catch {
    Write-Host "  [AVISO] $id impresso mas falhou ao marcar 'impresso': $($_.Exception.Message)" -ForegroundColor Yellow
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
  foreach ($label in $pending) { Process-Label -Label $label }
}

# ── Início ────────────────────────────────────────────────────────────────────
Write-Host "================================" -ForegroundColor Cyan
Write-Host " Agente de Impressão — Kommo Ops" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host " API.......: $ApiUrl"
Write-Host " Impressora: $PrinterName"
Write-Host " Intervalo.: $IntervalSeconds s"
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
