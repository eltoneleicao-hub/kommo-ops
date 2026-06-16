/**
 * printer-adapter.ts
 *
 * Adapter abstrato para diferentes métodos de impressão
 * Suporta: direct (USB), file, network
 */

import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import net from "net";

/**
 * Envia ZPL para impressora Zebra
 *
 * @param zplContent - Conteúdo ZPL
 * @param labelId - ID da etiqueta (para logging)
 * @param mode - "direct" | "file" | "network"
 */
export async function sendToZebraPrinter(
  zplContent: string,
  labelId: string,
  mode: string
): Promise<void> {
  switch (mode) {
    case "direct":
      return sendDirect(zplContent, labelId);
    case "file":
      return sendViaFile(zplContent, labelId);
    case "network":
      return sendViaNetwork(zplContent, labelId);
    default:
      throw new Error(`Unknown print mode: ${mode}`);
  }
}

/**
 * Modo 1: Enviar direto via comando do sistema (Windows)
 * Requer: Zebra registrada como impressora padrão do Windows
 *
 * IMPORTANTE: Isso precisa rodar no mesmo PC da impressora ou na rede local
 */
async function sendDirect(zplContent: string, labelId: string): Promise<void> {
  const printerName = process.env.ZEBRA_PRINTER_NAME || "Zebra ZD220T";

  try {
    if (process.platform === "win32") {
      // Windows: usar PowerShell Out-Printer (mais confiável que comando PRINT)
      const tempFile = path.join(process.env.TEMP || "C:\\temp", `label-${labelId}.txt`);

      // Escrever ZPL em arquivo temporário
      fs.writeFileSync(tempFile, zplContent, "utf-8");

      // Enviar para impressora via PowerShell como RAW bytes (sem quebras de página)
      // Get-Content sem -Raw envia linha por linha causando múltiplas páginas
      const psCommand = `powershell -Command "$content = [System.IO.File]::ReadAllText('${tempFile}'); $bytes = [System.Text.Encoding]::ASCII.GetBytes($content); $ps = New-Object System.Printing.PrintServer; $queue = $ps.GetPrintQueue('${printerName}'); Add-Type -AssemblyName System.Printing; $ticket = New-Object System.Printing.PrintTicket; $job = $queue.AddJob('ZPL_Label', '${tempFile}', $false); $job.Commit()"`;
      execSync(psCommand, { stdio: "pipe" });

      console.log(`[Printer] ZPL enviado para ${printerName} (Windows via Out-Printer)`);

      // Limpar arquivo temporário após envio
      fs.unlinkSync(tempFile);
    } else {
      // Linux/Mac: usar lpr
      const command = `echo "${zplContent.replace(/"/g, '\\"')}" | lp -d "${printerName}"`;
      execSync(command, { stdio: "pipe" });

      console.log(`[Printer] ZPL enviado para ${printerName} (Unix)`);
    }
  } catch (error) {
    console.error(`[Printer] Erro ao enviar para ${printerName}:`, error);
    throw new Error(`Failed to print to ${printerName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Modo 2: Salvar em arquivo
 * Útil para testes, debugging, ou quando impressora não está acessível
 */
async function sendViaFile(zplContent: string, labelId: string): Promise<void> {
  const outputDir = process.env.PRINT_OUTPUT_DIR || "./zpl-output";

  try {
    // Criar diretório se não existir
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = path.join(outputDir, `label-${labelId}-${timestamp}.zpl`);

    fs.writeFileSync(filename, zplContent, "utf-8");

    console.log(`[Printer] ZPL salvo em ${filename}`);
  } catch (error) {
    console.error(`[Printer] Erro ao salvar arquivo:`, error);
    throw new Error(`Failed to save ZPL file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Modo 3: Enviar via TCP/IP para Zebra (se conectada em rede)
 *
 * Uso: ZEBRA_PRINTER_IP=192.168.1.100 ZEBRA_PRINTER_PORT=9100
 */
async function sendViaNetwork(zplContent: string, labelId: string): Promise<void> {
  const printerIp = process.env.ZEBRA_PRINTER_IP;
  const printerPort = parseInt(process.env.ZEBRA_PRINTER_PORT || "9100");

  if (!printerIp) {
    throw new Error("ZEBRA_PRINTER_IP not configured for network mode");
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host: printerIp, port: printerPort },
      () => {
        socket.write(zplContent, "utf-8", () => {
          socket.end();
          console.log(`[Printer] ZPL enviado para ${printerIp}:${printerPort}`);
          resolve();
        });
      }
    );

    socket.on("error", (error) => {
      console.error(`[Printer] Erro de conexão com ${printerIp}:${printerPort}:`, error);
      reject(new Error(`Failed to connect to printer: ${error.message}`));
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error("Printer connection timeout"));
    });
  });
}

/**
 * Função auxiliar: Testar conexão com impressora
 */
export async function testPrinterConnection(mode: string): Promise<boolean> {
  try {
    if (mode === "network") {
      const printerIp = process.env.ZEBRA_PRINTER_IP;
      const printerPort = parseInt(process.env.ZEBRA_PRINTER_PORT || "9100");

      if (!printerIp) {
        console.warn("[Printer] ZEBRA_PRINTER_IP not configured");
        return false;
      }

      return new Promise((resolve) => {
        const socket = net.createConnection(
          { host: printerIp, port: printerPort },
          () => {
            socket.end();
            console.log(`[Printer] ✓ Conexão OK com ${printerIp}:${printerPort}`);
            resolve(true);
          }
        );

        socket.on("error", (error) => {
          console.warn(`[Printer] ✗ Falha ao conectar: ${error.message}`);
          resolve(false);
        });

        socket.setTimeout(3000, () => {
          socket.destroy();
          resolve(false);
        });
      });
    } else if (mode === "direct") {
      const printerName = process.env.ZEBRA_PRINTER_NAME || "Zebra ZD220T";
      console.log(`[Printer] Modo direto para ${printerName}`);
      return true;
    } else if (mode === "file") {
      const outputDir = process.env.PRINT_OUTPUT_DIR || "./zpl-output";
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      console.log(`[Printer] Modo arquivo para ${outputDir}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error("[Printer] Erro ao testar:", error);
    return false;
  }
}
