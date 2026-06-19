<#
.SYNOPSIS
  App de desktop (botões) para LIGAR/DESLIGAR o agente de impressão de etiquetas.
.DESCRIPTION
  Janela simples para operadores não-técnicos. Envolve o print-agent.ps1:
  - LIGAR: inicia o loop de impressão (polling da nuvem -> Zebra local).
  - DESLIGAR: para o loop.
  - IMPRIMIR AGORA: roda uma passada única (-Once) e para.
  - TESTAR IMPRESSORA: confere a impressora e imprime uma etiqueta de teste.
  - CONFIGURAR: define impressora, secret, URL e intervalo (salvo em %LOCALAPPDATA%).
  Sem segredos no código — tudo vem de %LOCALAPPDATA%\KommoAgente\config.json.
#>

[System.Threading.Thread]::CurrentThread.ApartmentState | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# ── Impressão RAW (para o botão de teste) ────────────────────────────────────
if (-not ("RawPrinterGui" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterGui {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
    static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
    static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
    static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
    static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
    static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
    public static void SendBytes(string printer, byte[] bytes) {
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Impressora '" + printer + "' nao encontrada.");
        try {
            DOCINFOA di = new DOCINFOA(); di.pDocName="ZPL_Teste"; di.pDataType="RAW";
            if (!StartDocPrinter(h,1,di)) throw new Exception("StartDocPrinter falhou");
            try {
                if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter falhou");
                IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
                try { Marshal.Copy(bytes,0,p,bytes.Length); int w;
                      if (!WritePrinter(h,p,bytes.Length,out w)) throw new Exception("WritePrinter falhou"); }
                finally { Marshal.FreeCoTaskMem(p); }
                EndPagePrinter(h);
            } finally { EndDocPrinter(h); }
        } finally { ClosePrinter(h); }
    }
}
"@
}

# ── Config (fora do repositório) ─────────────────────────────────────────────
$script:cfgDir  = Join-Path $env:LOCALAPPDATA 'KommoAgente'
$script:cfgPath = Join-Path $script:cfgDir 'config.json'
$script:defaults = @{
  ApiUrl          = 'https://kommo-ops.vercel.app'
  Secret          = ''
  PrinterName     = 'ZDesigner ZD220-203dpi ZPL'
  IntervalSeconds = 5
  AgentScript     = (Join-Path $PSScriptRoot 'print-agent.ps1')
}
function Get-Config {
  $c = @{} + $script:defaults
  if (Test-Path $script:cfgPath) {
    try {
      $j = Get-Content $script:cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($k in @($script:defaults.Keys)) {
        if ($null -ne $j.$k -and "$($j.$k)".Trim() -ne '') { $c[$k] = $j.$k }
      }
    } catch {}
  }
  return $c
}
function Save-Config { param($c)
  New-Item -ItemType Directory -Force -Path $script:cfgDir | Out-Null
  ($c | ConvertTo-Json) | Set-Content -Path $script:cfgPath -Encoding UTF8
}
$script:cfg = Get-Config
$script:logQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$script:proc = $null

# ── Janela ───────────────────────────────────────────────────────────────────
$form = New-Object Windows.Forms.Form
$form.Text = 'Agente de Impressão — Etiquetas'
$form.Size = New-Object Drawing.Size(520, 600)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.Font = New-Object Drawing.Font('Segoe UI', 10)

$lblTitle = New-Object Windows.Forms.Label
$lblTitle.Text = 'Agente de Impressão de Etiquetas'
$lblTitle.Location = New-Object Drawing.Point(20, 12)
$lblTitle.Size = New-Object Drawing.Size(360, 26)
$lblTitle.Font = New-Object Drawing.Font('Segoe UI', 12, [Drawing.FontStyle]::Bold)
$form.Controls.Add($lblTitle)

$btnConfig = New-Object Windows.Forms.Button
$btnConfig.Text = 'Configurar'
$btnConfig.Location = New-Object Drawing.Point(385, 12)
$btnConfig.Size = New-Object Drawing.Size(100, 30)
$form.Controls.Add($btnConfig)

$lblStatus = New-Object Windows.Forms.Label
$lblStatus.Text = '● DESLIGADO'
$lblStatus.Location = New-Object Drawing.Point(20, 48)
$lblStatus.Size = New-Object Drawing.Size(300, 32)
$lblStatus.Font = New-Object Drawing.Font('Segoe UI', 15, [Drawing.FontStyle]::Bold)
$lblStatus.ForeColor = [Drawing.Color]::Gray
$form.Controls.Add($lblStatus)

$lblQueue = New-Object Windows.Forms.Label
$lblQueue.Text = 'Fila: —'
$lblQueue.Location = New-Object Drawing.Point(22, 84)
$lblQueue.Size = New-Object Drawing.Size(460, 22)
$lblQueue.ForeColor = [Drawing.Color]::DimGray
$form.Controls.Add($lblQueue)

$btnOn = New-Object Windows.Forms.Button
$btnOn.Text = 'LIGAR'
$btnOn.Location = New-Object Drawing.Point(20, 116)
$btnOn.Size = New-Object Drawing.Size(232, 66)
$btnOn.Font = New-Object Drawing.Font('Segoe UI', 14, [Drawing.FontStyle]::Bold)
$btnOn.BackColor = [Drawing.Color]::FromArgb(46, 160, 67)
$btnOn.ForeColor = [Drawing.Color]::White
$btnOn.FlatStyle = 'Flat'
$form.Controls.Add($btnOn)

$btnOff = New-Object Windows.Forms.Button
$btnOff.Text = 'DESLIGAR'
$btnOff.Location = New-Object Drawing.Point(264, 116)
$btnOff.Size = New-Object Drawing.Size(232, 66)
$btnOff.Font = New-Object Drawing.Font('Segoe UI', 14, [Drawing.FontStyle]::Bold)
$btnOff.BackColor = [Drawing.Color]::FromArgb(207, 34, 46)
$btnOff.ForeColor = [Drawing.Color]::White
$btnOff.FlatStyle = 'Flat'
$btnOff.Enabled = $false
$form.Controls.Add($btnOff)

$btnOnce = New-Object Windows.Forms.Button
$btnOnce.Text = 'Imprimir agora (1x)'
$btnOnce.Location = New-Object Drawing.Point(20, 190)
$btnOnce.Size = New-Object Drawing.Size(232, 40)
$form.Controls.Add($btnOnce)

$btnTest = New-Object Windows.Forms.Button
$btnTest.Text = 'Testar impressora'
$btnTest.Location = New-Object Drawing.Point(264, 190)
$btnTest.Size = New-Object Drawing.Size(232, 40)
$form.Controls.Add($btnTest)

$lblLog = New-Object Windows.Forms.Label
$lblLog.Text = 'Registro:'
$lblLog.Location = New-Object Drawing.Point(20, 240)
$lblLog.Size = New-Object Drawing.Size(200, 20)
$form.Controls.Add($lblLog)

$txtLog = New-Object Windows.Forms.TextBox
$txtLog.Location = New-Object Drawing.Point(20, 262)
$txtLog.Size = New-Object Drawing.Size(476, 290)
$txtLog.Multiline = $true
$txtLog.ReadOnly = $true
$txtLog.ScrollBars = 'Vertical'
$txtLog.BackColor = [Drawing.Color]::FromArgb(24, 24, 24)
$txtLog.ForeColor = [Drawing.Color]::Gainsboro
$txtLog.Font = New-Object Drawing.Font('Consolas', 9)
$form.Controls.Add($txtLog)

# ── Lógica ───────────────────────────────────────────────────────────────────
function Add-Log { param([string]$m) $script:logQueue.Enqueue("$((Get-Date).ToString('HH:mm:ss'))  $m") }

function Update-Status {
  $running = ($script:proc -and -not $script:proc.HasExited)
  if ($running) {
    $lblStatus.Text = '● LIGADO'; $lblStatus.ForeColor = [Drawing.Color]::FromArgb(46,160,67)
    $btnOn.Enabled = $false; $btnOff.Enabled = $true
  } else {
    if ($script:proc) {
      foreach ($sid in 'agentOut','agentErr') { Unregister-Event -SourceIdentifier $sid -ErrorAction SilentlyContinue }
      $script:proc = $null
    }
    $lblStatus.Text = '● DESLIGADO'; $lblStatus.ForeColor = [Drawing.Color]::Gray
    $btnOn.Enabled = $true; $btnOff.Enabled = $false
  }
}

function Start-Agent { param([switch]$Once)
  if ($script:proc -and -not $script:proc.HasExited) { return }
  $c = $script:cfg
  if (-not "$($c.Secret)".Trim()) {
    [Windows.Forms.MessageBox]::Show('Configure o Secret primeiro (botão Configurar).','Falta configuração',
      [Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
    return
  }
  if (-not (Test-Path $c.AgentScript)) {
    [Windows.Forms.MessageBox]::Show("print-agent.ps1 não encontrado em:`n$($c.AgentScript)`n`nAjuste em Configurar.",'Agente não encontrado',
      [Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    return
  }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = (Get-Command powershell.exe).Source
  $extra = if ($Once) { ' -Once' } else { '' }
  $psi.Arguments = ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -ApiUrl "{1}" -Secret "{2}" -PrinterName "{3}" -IntervalSeconds {4}{5}' -f `
    $c.AgentScript, $c.ApiUrl, $c.Secret, $c.PrinterName, [int]$c.IntervalSeconds, $extra)
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  try { $psi.StandardOutputEncoding = [Text.Encoding]::UTF8; $psi.StandardErrorEncoding = [Text.Encoding]::UTF8 } catch {}
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  Register-ObjectEvent -InputObject $p -EventName OutputDataReceived -SourceIdentifier agentOut -MessageData $script:logQueue -Action {
    if ($EventArgs.Data) { $Event.MessageData.Enqueue($EventArgs.Data) }
  } | Out-Null
  Register-ObjectEvent -InputObject $p -EventName ErrorDataReceived -SourceIdentifier agentErr -MessageData $script:logQueue -Action {
    if ($EventArgs.Data) { $Event.MessageData.Enqueue('[erro] ' + $EventArgs.Data) }
  } | Out-Null
  try {
    $p.Start() | Out-Null
    $p.BeginOutputReadLine(); $p.BeginErrorReadLine()
    $script:proc = $p
    Add-Log ($(if ($Once) { '=== Imprimindo o que está pendente (passada única) ===' } else { '=== Agente LIGADO ===' }))
  } catch {
    Add-Log "[erro] Falha ao iniciar: $($_.Exception.Message)"
  }
  Update-Status
}

function Stop-Agent {
  if ($script:proc -and -not $script:proc.HasExited) {
    try { $script:proc.Kill() } catch {}
    Add-Log '=== Agente DESLIGADO ==='
  }
  Update-Status
}

function Test-Printer {
  $name = $script:cfg.PrinterName
  Add-Log "Testando impressora '$name'..."
  $pr = Get-Printer -Name $name -ErrorAction SilentlyContinue
  if (-not $pr) {
    Add-Log "[erro] Impressora '$name' não encontrada. Veja a lista em Configurar."
    [Windows.Forms.MessageBox]::Show("Impressora '$name' não encontrada.`nAbra Configurar e selecione a correta.",'Impressora',
      [Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
    return
  }
  $dt = (Get-Date).ToString('dd/MM/yyyy HH:mm')
  $zpl = "^XA^PW812^LL0609^CF0,60^FO50,80^FDTESTE OK^FS^CF0,34^FO50,180^FDAgente de Impressao^FS^FO50,250^FD$dt^FS^XZ"
  try {
    [RawPrinterGui]::SendBytes($name, [Text.Encoding]::UTF8.GetBytes($zpl))
    Add-Log '[ok] Etiqueta de teste enviada. Confira a saída da impressora.'
  } catch {
    Add-Log "[erro] $($_.Exception.Message)"
  }
}

function Update-Queue {
  $c = $script:cfg
  if (-not "$($c.Secret)".Trim()) { $lblQueue.Text = 'Fila: configure o secret'; return }
  try {
    $u = "$($c.ApiUrl.TrimEnd('/'))/api/labels/pending?secret=$([uri]::EscapeDataString($c.Secret))"
    $r = Invoke-RestMethod -Uri $u -Method Get -TimeoutSec 4
    $n = @($r).Count
    $lblQueue.Text = "Fila: $n etiqueta(s) pendente(s)$(if ($n -ge 50) { ' (50+)' })"
  } catch { $lblQueue.Text = 'Fila: — (sem conexão)' }
}

function Show-Config {
  $f = New-Object Windows.Forms.Form
  $f.Text = 'Configurar Agente'; $f.Size = New-Object Drawing.Size(480, 320)
  $f.StartPosition = 'CenterParent'; $f.FormBorderStyle = 'FixedDialog'
  $f.MaximizeBox = $false; $f.MinimizeBox = $false; $f.Font = New-Object Drawing.Font('Segoe UI', 9)
  $mk = {
    param($text, $y)
    $l = New-Object Windows.Forms.Label; $l.Text = $text
    $l.Location = New-Object Drawing.Point(16, $y); $l.Size = New-Object Drawing.Size(120, 22)
    $f.Controls.Add($l)
  }
  & $mk 'Impressora:' 20
  $cbP = New-Object Windows.Forms.ComboBox
  $cbP.Location = New-Object Drawing.Point(140, 18); $cbP.Size = New-Object Drawing.Size(310, 24)
  $cbP.DropDownStyle = 'DropDown'
  try { Get-Printer | Select-Object -ExpandProperty Name | ForEach-Object { [void]$cbP.Items.Add($_) } } catch {}
  $cbP.Text = $script:cfg.PrinterName
  $f.Controls.Add($cbP)

  & $mk 'Secret:' 54
  $tbS = New-Object Windows.Forms.TextBox
  $tbS.Location = New-Object Drawing.Point(140, 52); $tbS.Size = New-Object Drawing.Size(310, 24)
  $tbS.Text = $script:cfg.Secret
  $f.Controls.Add($tbS)

  & $mk 'URL do backend:' 88
  $tbU = New-Object Windows.Forms.TextBox
  $tbU.Location = New-Object Drawing.Point(140, 86); $tbU.Size = New-Object Drawing.Size(310, 24)
  $tbU.Text = $script:cfg.ApiUrl
  $f.Controls.Add($tbU)

  & $mk 'Intervalo (s):' 122
  $tbI = New-Object Windows.Forms.TextBox
  $tbI.Location = New-Object Drawing.Point(140, 120); $tbI.Size = New-Object Drawing.Size(80, 24)
  $tbI.Text = "$($script:cfg.IntervalSeconds)"
  $f.Controls.Add($tbI)

  & $mk 'Script do agente:' 156
  $tbA = New-Object Windows.Forms.TextBox
  $tbA.Location = New-Object Drawing.Point(140, 154); $tbA.Size = New-Object Drawing.Size(310, 24)
  $tbA.Text = $script:cfg.AgentScript
  $f.Controls.Add($tbA)

  $ok = New-Object Windows.Forms.Button
  $ok.Text = 'Salvar'; $ok.Location = New-Object Drawing.Point(250, 230); $ok.Size = New-Object Drawing.Size(95, 32)
  $ok.DialogResult = [Windows.Forms.DialogResult]::OK
  $f.Controls.Add($ok); $f.AcceptButton = $ok
  $cancel = New-Object Windows.Forms.Button
  $cancel.Text = 'Cancelar'; $cancel.Location = New-Object Drawing.Point(355, 230); $cancel.Size = New-Object Drawing.Size(95, 32)
  $cancel.DialogResult = [Windows.Forms.DialogResult]::Cancel
  $f.Controls.Add($cancel); $f.CancelButton = $cancel

  if ($f.ShowDialog() -eq [Windows.Forms.DialogResult]::OK) {
    $iv = 5; [int]::TryParse($tbI.Text, [ref]$iv) | Out-Null
    $script:cfg = @{
      ApiUrl = $tbU.Text.Trim(); Secret = $tbS.Text.Trim()
      PrinterName = $cbP.Text.Trim(); IntervalSeconds = $iv; AgentScript = $tbA.Text.Trim()
    }
    Save-Config $script:cfg
    Add-Log 'Configuração salva.'
    Update-Queue
  }
}

# ── Eventos ──────────────────────────────────────────────────────────────────
$btnOn.Add_Click({ Start-Agent })
$btnOff.Add_Click({ Stop-Agent })
$btnOnce.Add_Click({ Start-Agent -Once })
$btnTest.Add_Click({ Test-Printer })
$btnConfig.Add_Click({ Show-Config })

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 800
$timer.Add_Tick({
  $line = $null; $changed = $false
  while ($script:logQueue.TryDequeue([ref]$line)) { $txtLog.AppendText($line + "`r`n"); $changed = $true }
  if ($changed) {
    if ($txtLog.TextLength -gt 60000) { $txtLog.Text = $txtLog.Text.Substring($txtLog.TextLength - 40000) }
    $txtLog.SelectionStart = $txtLog.TextLength; $txtLog.ScrollToCaret()
  }
  Update-Status
})
$timer.Start()

$qTimer = New-Object Windows.Forms.Timer
$qTimer.Interval = 20000
$qTimer.Add_Tick({ Update-Queue })
$qTimer.Start()

$form.Add_Shown({
  Add-Log 'Pronto. Clique LIGAR para começar a imprimir.'
  if (-not "$($script:cfg.Secret)".Trim()) { Add-Log 'Atenção: secret não configurado — abra Configurar.' }
  Update-Queue
})
$form.Add_FormClosing({ Stop-Agent })

[void]$form.ShowDialog()
