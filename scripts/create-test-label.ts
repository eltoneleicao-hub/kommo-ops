/**
 * scripts/create-test-label.ts
 *
 * Cria MaterialRequest e Label de teste para validação da impressora
 * Uso: npx ts-node scripts/create-test-label.ts
 */

import { prisma } from "../src/lib/prisma";

async function createTestLabel() {
  try {
    console.log("🔄 Criando dados de teste para impressora...\n");

    // 1. Criar MaterialRequest de teste
    const request = await prisma.materialRequest.create({
      data: {
        source: "manual",
        status: "etiqueta_gerada",
        recipientName: "Maria Silva",
        recipientPhone: "12 99999-0000",
        street: "Rua Manoel Fiel Filho",
        number: "204",
        neighborhood: "Bosque dos eucaliptos",
        postalCode: "12233690",
        city: "Sao Jose dos Campos",
        complement: "Apto 302",
        internalOrderNotes: "REGIAO LESTE",
        kommoUrl: "https://teste.kommo.com/leads/detail/test",
      },
    });

    console.log("✓ MaterialRequest criado:");
    console.log(`  ID: ${request.id}`);
    console.log(`  Nome: ${request.recipientName}`);
    console.log(`  Endereço: ${request.street}, ${request.number}`);
    console.log(`  Cidade: ${request.city}`);
    console.log("");

    // 2. Criar Label associada
    const labelContent = `MARIA SILVA

Rua Manoel Fiel Filho, 204
Apto 302
Bosque dos eucaliptos
Sao Jose dos Campos - CEP 12233690

Telefone: 12 99999-0000

REGIAO: REGIAO LESTE`;

    const label = await prisma.label.create({
      data: {
        requestId: request.id,
        format: "text",
        content: labelContent,
        printStatus: "pendente",
      },
    });

    console.log("✓ Label criada:");
    console.log(`  ID: ${label.id}`);
    console.log(`  Status: ${label.printStatus}`);
    console.log(`  Conteúdo (primeiras 100 chars): ${label.content.substring(0, 100)}...`);
    console.log("");

    // 3. Retornar IDs para teste
    console.log("================================");
    console.log("✅ DADOS DE TESTE CRIADOS COM SUCESSO!");
    console.log("================================");
    console.log("");
    console.log("USE ESTES IDs PARA TESTE:");
    console.log("");
    console.log(`  Label ID: ${label.id}`);
    console.log("");
    console.log("Comando para testar (copie e cole no PowerShell):");
    console.log("");
    console.log("$body = @{");
    console.log(`  labelId = "${label.id}"`);
    console.log('  secret = "seu-secret-aqui"');
    console.log('  dryRun = $true');
    console.log("} | ConvertTo-Json");
    console.log("");
    console.log("Invoke-RestMethod -Method Post \\");
    console.log("  -Uri \"http://localhost:3000/api/labels/print\" \\");
    console.log("  -ContentType 'application/json' \\");
    console.log("  -Body $body");
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao criar dados de teste:", error);
    process.exit(1);
  }
}

createTestLabel();
