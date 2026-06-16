/**
 * Widget Kommo - Gerar Etiqueta (v2)
 *
 * Features:
 * - Gerar etiqueta para lead único
 * - Gerar etiquetas em lote (todos da etapa atual)
 * - Modal de confirmação contra toques acidentais
 * - Validação e feedback em tempo real
 */

Kommo.addPanel('lead_card', {
  title: 'Operações',

  async bind_actions() {
    const self = this;

    // Botão: Gerar Único
    const btnSingle = document.getElementById('kommo-widget-generate-single');
    if (btnSingle) {
      btnSingle.addEventListener('click', () => self.openConfirmModal('single'));
    }

    // Botão: Gerar Lote
    const btnBatch = document.getElementById('kommo-widget-generate-batch');
    if (btnBatch) {
      btnBatch.addEventListener('click', () => self.openConfirmModal('batch'));
    }

    // Botão: Imprimir
    const btnPrint = document.getElementById('kommo-widget-print-btn');
    if (btnPrint) {
      btnPrint.addEventListener('click', async () => {
        await self.printLabel();
      });
    }

    // Modal: Confirmar
    const btnConfirm = document.getElementById('kommo-widget-confirm-btn');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        const mode = document.getElementById('kommo-widget-modal').dataset.mode;
        document.getElementById('kommo-widget-modal').style.display = 'none';
        await self.generateLabels(mode);
      });
    }

    // Modal: Cancelar
    const btnCancel = document.getElementById('kommo-widget-cancel-btn');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        document.getElementById('kommo-widget-modal').style.display = 'none';
      });
    }

    // Fechar modal ao clicar fora
    const modal = document.getElementById('kommo-widget-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    }
  },

  /**
   * Abre modal de confirmação
   */
  openConfirmModal(mode) {
    const modal = document.getElementById('kommo-widget-modal');
    const title = document.getElementById('kommo-widget-modal-title');
    const desc = document.getElementById('kommo-widget-modal-desc');

    modal.dataset.mode = mode;

    if (mode === 'single') {
      title.textContent = '🔒 Gerar Etiqueta';
      desc.textContent = `Deseja gerar etiqueta para "${this.entity.name}"?`;
    } else {
      title.textContent = '🔒 Gerar em Lote';
      desc.innerHTML = `<strong>⚠️ ATENÇÃO:</strong><br/>Isso vai gerar etiquetas para <strong>TODOS</strong> os leads desta etapa.<br/><br/>Tem certeza?`;
    }

    modal.style.display = 'flex';
  },

  /**
   * Gera etiqueta(s) após confirmação
   */
  async generateLabels(mode) {
    const statusEl = document.getElementById('kommo-widget-status');
    statusEl.innerHTML = '⏳ Processando...';

    try {
      if (mode === 'single') {
        await this.generateLabelSingle();
      } else {
        await this.generateLabelBatch();
      }
    } catch (error) {
      console.error('[Kommo Widget] Erro:', error);
      statusEl.innerHTML = `
        <strong style="color: #f44336;">✗ Erro</strong><br/>
        ${error.message}
      `;
    }
  },

  /**
   * Gera etiqueta para um único lead
   */
  async generateLabelSingle() {
    const statusEl = document.getElementById('kommo-widget-status');

    try {
      const lead = this.entity;
      const leadData = await this.getLeadData(lead.id);

      const payload = {
        kommoLeadId: String(lead.id),
        kommoContactId: leadData.contact_id ? String(leadData.contact_id) : undefined,
        kommoPipelineId: String(lead.pipeline_id),
        kommoStageId: String(lead.status_id),
        recipientName: leadData.name || 'Sem nome',
        recipientPhone: leadData.phone || '',
        street: leadData.street || '',
        number: leadData.number || '',
        neighborhood: leadData.neighborhood || '',
        postalCode: leadData.postal_code || '',
        city: leadData.city || '',
        complement: leadData.complement || '',
        internalOrderNotes: leadData.internal_notes || '',
        kommoUrl: `https://${this.env.subdomain}.kommo.com/leads/detail/${lead.id}`,
        secret: this.settings.api_key
      };

      const apiUrl = this.settings.api_url.replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/api/kommo/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar etiqueta');
      }

      if (data.status === 'etiqueta_gerada') {
        statusEl.innerHTML = `
          <strong style="color: #4CAF50;">✓ Sucesso!</strong><br/>
          Etiqueta #${data.labelId} gerada<br/>
          <small>Etiqueta pronta para impressão</small>
        `;
      } else if (data.status === 'campos_incompletos') {
        statusEl.innerHTML = `
          <strong style="color: #ff9800;">⚠ Campos Faltando</strong><br/>
          ${data.missingFields.join(', ')}<br/>
          <small>Atualize e tente novamente</small>
        `;
      }

      console.log('[Kommo Widget] Etiqueta gerada (único):', data);

    } catch (error) {
      throw error;
    }
  },

  /**
   * Gera etiquetas em lote para todos os leads da etapa
   */
  async generateLabelBatch() {
    const statusEl = document.getElementById('kommo-widget-status');

    try {
      const lead = this.entity;
      const payload = {
        kommoPipelineId: String(lead.pipeline_id),
        kommoStageId: String(lead.status_id),
        secret: this.settings.api_key
      };

      const apiUrl = this.settings.api_url.replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/api/kommo/requests-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar etiquetas em lote');
      }

      const generated = data.generated || 0;
      const incomplete = data.incomplete || 0;
      const total = generated + incomplete;

      statusEl.innerHTML = `
        <strong style="color: #4CAF50;">✓ Lote Processado!</strong><br/>
        <strong>${generated}</strong> etiquetas geradas<br/>
        ${incomplete > 0 ? `<small style="color: #ff9800;">${incomplete} com campos incompletos</small><br/>` : ''}
        <small>Total de ${total} leads processados</small>
      `;

      console.log('[Kommo Widget] Lote gerado:', data);

    } catch (error) {
      throw error;
    }
  },

  /**
   * Busca dados completos do lead
   */
  async getLeadData(leadId) {
    const lead = this.entity;

    return {
      id: lead.id,
      name: lead.name || '',
      phone: lead.phone || this.getCustomField('Telefone'),
      street: this.getCustomField('Rua/Avenida'),
      number: this.getCustomField('Numero'),
      neighborhood: this.getCustomField('Bairro'),
      postal_code: this.getCustomField('CEP'),
      city: this.getCustomField('Cidade'),
      complement: this.getCustomField('Complemento'),
      internal_notes: this.getCustomField('Anotacoes internas do pedido'),
      contact_id: lead.contact_id
    };
  },

  /**
   * Imprime a etiqueta do lead atual na Zebra
   */
  async printLabel() {
    const statusEl = document.getElementById('kommo-widget-status');
    const printBtn = document.getElementById('kommo-widget-print-btn');

    printBtn.disabled = true;
    printBtn.textContent = '⏳ Imprimindo...';
    statusEl.textContent = '';

    try {
      // Buscar a label mais recente do lead
      const lead = this.entity;
      const requests = await this.fetchMaterialRequestsForLead(lead.id);

      if (!requests || requests.length === 0) {
        throw new Error('Nenhuma etiqueta encontrada para este lead');
      }

      // Usar a mais recente
      const request = requests[0];
      const labels = request.labels || [];

      if (labels.length === 0) {
        throw new Error('Lead não tem etiqueta gerada ainda');
      }

      const label = labels[0];

      // Chamar endpoint de impressão
      const apiUrl = this.settings.api_url.replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/api/labels/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labelId: label.id,
          secret: this.settings.api_key
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao imprimir');
      }

      // Sucesso!
      printBtn.textContent = '✓ Impressa';
      printBtn.style.backgroundColor = '#4CAF50';

      statusEl.innerHTML = `
        <strong style="color: #4CAF50;">✓ Impressão Enviada!</strong><br/>
        Etiqueta enviada para Zebra ZD220T<br/>
        <small>Verifique a impressora em alguns segundos</small>
      `;

      console.log('[Kommo Widget] Etiqueta impressa:', data);

    } catch (error) {
      console.error('[Kommo Widget] Erro ao imprimir:', error);
      printBtn.textContent = '✗ Erro';
      printBtn.style.backgroundColor = '#f44336';
      statusEl.innerHTML = `
        <strong style="color: #f44336;">✗ Erro na Impressão</strong><br/>
        ${error.message}
      `;
    } finally {
      setTimeout(() => {
        printBtn.disabled = false;
        if (printBtn.textContent !== '✓ Impressa') {
          printBtn.textContent = '🖨️ Imprimir';
          printBtn.style.backgroundColor = '';
        }
      }, 3000);
    }
  },

  /**
   * Busca material requests do lead atual na API
   * (Normalmente não precisaria, mas como estamos no widget da Kommo,
   * buscamos no nosso backend para pegar os dados de label)
   */
  async fetchMaterialRequestsForLead(leadId) {
    try {
      const apiUrl = this.settings.api_url.replace(/\/$/, '');
      const response = await fetch(
        `${apiUrl}/api/material-requests?kommoLeadId=${leadId}&secret=${this.settings.api_key}`
      );

      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.warn('[Kommo Widget] Erro ao buscar requests:', error);
      return [];
    }
  },

  /**
   * Helper para custom fields
   */
  getCustomField(fieldName) {
    if (!this.entity.custom_fields_values) {
      return '';
    }

    const field = this.entity.custom_fields_values.find(f => f.field_name === fieldName);
    return field?.value || '';
  }
});

// Render do widget
Kommo.render(function(parent) {
  const container = document.createElement('div');
  container.id = 'kommo-widget-container';
  container.innerHTML = `
    <!-- Modal de Confirmação -->
    <div id="kommo-widget-modal" style="
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      justify-content: center;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      ">
        <div style="
          font-size: 18px;
          font-weight: bold;
          color: #17202a;
          margin-bottom: 12px;
        " id="kommo-widget-modal-title">
          Confirmar Ação
        </div>

        <div style="
          font-size: 14px;
          color: #666;
          margin-bottom: 24px;
          line-height: 1.5;
        " id="kommo-widget-modal-desc">
          Tem certeza?
        </div>

        <div style="
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        ">
          <button id="kommo-widget-cancel-btn" style="
            padding: 10px 16px;
            background: #e0e0e0;
            color: #333;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          "
          onmouseover="this.style.background='#d0d0d0'"
          onmouseout="this.style.background='#e0e0e0'"
          >
            Cancelar
          </button>
          <button id="kommo-widget-confirm-btn" style="
            padding: 10px 16px;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          "
          onmouseover="this.style.background='#1976D2'"
          onmouseout="this.style.background='#2196F3'"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>

    <!-- Controles do Widget -->
    <div style="padding: 12px; background: #f5f5f5; border-radius: 8px; margin: 12px 0;">
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
        <button
          id="kommo-widget-generate-single"
          style="
            padding: 10px;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
          "
          onmouseover="this.style.background='#1976D2'"
          onmouseout="this.style.background='#2196F3'"
          title="Gerar etiqueta apenas para este lead"
        >
          📄 Único
        </button>
        <button
          id="kommo-widget-generate-batch"
          style="
            padding: 10px;
            background: #FF9800;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
          "
          onmouseover="this.style.background='#F57C00'"
          onmouseout="this.style.background='#FF9800'"
          title="Gerar etiquetas para TODOS os leads da etapa"
        >
          📦 Lote
        </button>
        <button
          id="kommo-widget-print-btn"
          style="
            padding: 10px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
          "
          onmouseover="this.style.background='#388E3C'"
          onmouseout="this.style.background='#4CAF50'"
          title="Imprimir etiqueta na Zebra ZD220T"
        >
          🖨️ Imprimir
        </button>
      </div>

      <div
        id="kommo-widget-status"
        style="
          margin-top: 8px;
          padding: 8px;
          font-size: 12px;
          color: #666;
          min-height: 20px;
        "
      ></div>
    </div>
  `;

  parent.appendChild(container);
});
