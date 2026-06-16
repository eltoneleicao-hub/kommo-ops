/**
 * Widget Kommo — Gerar Etiqueta
 *
 * Botões:
 *   📄 Gerar Etiqueta — gera etiqueta para o lead atual e deduz 1 convite do estoque
 *   📦 Gerar Lote     — gera etiquetas para todos os leads elegíveis da etapa
 *
 * A impressão acontece automaticamente via Print Agent local.
 */

Kommo.addPanel('lead_card', {
  title: 'Operações',

  async bind_actions() {
    const self = this;

    document.getElementById('kommo-btn-single')
      ?.addEventListener('click', () => self.openModal('single'));

    document.getElementById('kommo-btn-batch')
      ?.addEventListener('click', () => self.openModal('batch'));

    document.getElementById('kommo-modal-confirm')
      ?.addEventListener('click', async () => {
        const mode = document.getElementById('kommo-modal').dataset.mode;
        document.getElementById('kommo-modal').style.display = 'none';
        await self.execute(mode);
      });

    document.getElementById('kommo-modal-cancel')
      ?.addEventListener('click', () => {
        document.getElementById('kommo-modal').style.display = 'none';
      });

    document.getElementById('kommo-modal')
      ?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('kommo-modal')) {
          document.getElementById('kommo-modal').style.display = 'none';
        }
      });

    // Exibir estoque atual no painel ao carregar
    self.refreshStockDisplay();
  },

  // ── Exibição de estoque no painel ─────────────────────────────────────────

  async refreshStockDisplay() {
    const el = document.getElementById('kommo-stock-display');
    if (!el) return;
    try {
      const stock = await this.fetchStock();
      if (!stock.configured) {
        el.textContent = 'Estoque: não configurado';
        el.style.color = '#999';
      } else {
        el.textContent = `📦 Estoque: ${stock.availableQty} convites`;
        el.style.color = stock.availableQty > 5 ? '#4CAF50' : stock.availableQty > 0 ? '#FF9800' : '#f44336';
      }
    } catch {
      el.textContent = 'Estoque: —';
    }
  },

  // ── Modal de confirmação ──────────────────────────────────────────────────

  async openModal(mode) {
    const statusEl = document.getElementById('kommo-status');

    // Bloqueia se lead não pertence ao pipeline configurado
    if (this.settings.pipeline_id &&
        String(this.entity.pipeline_id) !== String(this.settings.pipeline_id)) {
      statusEl.innerHTML = '<span style="color:#999">⚠ Etiquetas não disponíveis para este pipeline</span>';
      return;
    }

    const modal = document.getElementById('kommo-modal');
    const titleEl  = document.getElementById('kommo-modal-title');
    const bodyEl   = document.getElementById('kommo-modal-body');
    const confirmBtn = document.getElementById('kommo-modal-confirm');

    statusEl.textContent = '⏳ Verificando estoque...';
    confirmBtn.disabled = true;

    const stock = await this.fetchStock();
    statusEl.textContent = '';

    modal.dataset.mode = mode;

    if (mode === 'single') {
      const leadName = this.entity.name || 'este lead';
      const ok = stock.availableQty >= 1;
      titleEl.textContent = '📄 Gerar Etiqueta';
      bodyEl.innerHTML = `
        Gerar etiqueta para <strong>${leadName}</strong>?<br><br>
        📦 Disponível: <strong>${stock.availableQty} convites</strong><br><br>
        ${ok
          ? 'Após confirmar, 1 convite será deduzido do estoque e a etiqueta será enviada para impressão.'
          : '<span style="color:#f44336;font-weight:bold">⚠ Estoque insuficiente!</span>'}
      `;
      confirmBtn.disabled = !ok;

    } else {
      // Batch: busca contagem de elegíveis
      titleEl.textContent = '📦 Gerar em Lote';
      bodyEl.innerHTML = '<em>Contando leads elegíveis...</em>';
      modal.style.display = 'flex';

      const count = await this.countBatch();
      const ok = stock.availableQty >= count && count > 0;

      bodyEl.innerHTML = `
        Gerar etiquetas para todos os leads elegíveis desta etapa?<br><br>
        👥 Leads elegíveis: <strong>${count}</strong><br>
        📦 Disponível: <strong>${stock.availableQty} convites</strong><br><br>
        ${count === 0
          ? '<span style="color:#999">Nenhum lead elegível nesta etapa.</span>'
          : stock.availableQty < count
            ? `<span style="color:#f44336;font-weight:bold">⚠ Estoque insuficiente! (faltam ${count - stock.availableQty} convites)</span>`
            : `Após confirmar, <strong>${count} convites</strong> serão deduzidos do estoque.`}
      `;
      confirmBtn.disabled = !ok;
    }

    modal.style.display = 'flex';
  },

  // ── Execução ──────────────────────────────────────────────────────────────

  async execute(mode) {
    const statusEl = document.getElementById('kommo-status');
    statusEl.innerHTML = '⏳ Processando...';

    try {
      if (mode === 'single') {
        await this.generateSingle();
      } else {
        await this.generateBatch();
      }
      await this.refreshStockDisplay();
    } catch (err) {
      statusEl.innerHTML = `<span style="color:#f44336">✗ ${err.message}</span>`;
    }
  },

  async generateSingle() {
    const statusEl = document.getElementById('kommo-status');
    const lead     = this.entity;
    const apiUrl   = this.settings.api_url.replace(/\/$/, '');

    const leadData = this.extractLeadData();

    const payload = {
      secret: this.settings.api_key,
      kommoLeadId: String(lead.id),
      kommoContactId: leadData.contact_id ? String(leadData.contact_id) : undefined,
      kommoPipelineId: String(lead.pipeline_id),
      kommoStageId: String(lead.status_id),
      recipientName: leadData.name || '',
      recipientPhone: leadData.phone || '',
      street: leadData.street || '',
      number: leadData.number || '',
      neighborhood: leadData.neighborhood || '',
      postalCode: leadData.postal_code || '',
      city: leadData.city || '',
      complement: leadData.complement || '',
      internalOrderNotes: leadData.internal_notes || '',
      kommoUrl: `https://${this.env.subdomain}.kommo.com/leads/detail/${lead.id}`,
      deductStock: true,
    };

    const res  = await fetch(`${apiUrl}/api/kommo/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || data.error || 'Erro ao gerar etiqueta');

    if (data.status === 'etiqueta_gerada') {
      statusEl.innerHTML = `
        <span style="color:#4CAF50;font-weight:bold">✓ Etiqueta gerada!</span><br>
        <small>ID: ${data.labelId}</small><br>
        <small>${data.stockDeducted ? '📦 1 convite deduzido do estoque' : ''}</small>
      `;
    } else if (data.status === 'campos_incompletos') {
      statusEl.innerHTML = `
        <span style="color:#FF9800;font-weight:bold">⚠ Campos faltando</span><br>
        <small>${data.missingFields?.join(', ')}</small>
      `;
    }
  },

  async generateBatch() {
    const statusEl = document.getElementById('kommo-status');
    const lead     = this.entity;
    const apiUrl   = this.settings.api_url.replace(/\/$/, '');

    const res  = await fetch(`${apiUrl}/api/kommo/requests-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: this.settings.api_key,
        kommoPipelineId: String(lead.pipeline_id),
        kommoStageId: String(lead.status_id),
        deductStock: true,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.error === 'insufficient_stock') {
        throw new Error(`Estoque insuficiente — disponível: ${data.available}, necessário: ${data.needed}`);
      }
      throw new Error(data.error || 'Erro ao gerar lote');
    }

    statusEl.innerHTML = `
      <span style="color:#4CAF50;font-weight:bold">✓ Lote processado!</span><br>
      <small>${data.generated} etiquetas geradas</small><br>
      ${data.incomplete > 0 ? `<small style="color:#FF9800">${data.incomplete} com campos incompletos</small><br>` : ''}
      <small>${data.stockDeducted > 0 ? `📦 ${data.stockDeducted} convites deduzidos` : ''}</small>
    `;
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  async fetchStock() {
    const apiUrl = this.settings.api_url.replace(/\/$/, '');
    try {
      const res = await fetch(
        `${apiUrl}/api/stock/summary?secret=${encodeURIComponent(this.settings.api_key)}`
      );
      if (!res.ok) return { configured: false, availableQty: 0 };
      return await res.json();
    } catch {
      return { configured: false, availableQty: 0 };
    }
  },

  async countBatch() {
    const lead   = this.entity;
    const apiUrl = this.settings.api_url.replace(/\/$/, '');
    try {
      const res = await fetch(`${apiUrl}/api/kommo/requests-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: this.settings.api_key,
          kommoPipelineId: String(lead.pipeline_id),
          kommoStageId: String(lead.status_id),
          countOnly: true,
        }),
      });
      if (!res.ok) return 0;
      const data = await res.json();
      return data.eligible ?? 0;
    } catch {
      return 0;
    }
  },

  extractLeadData() {
    const lead = this.entity;
    return {
      name: lead.name || '',
      phone: this.getCustomField('Telefone') || lead.phone || '',
      street: this.getCustomField('Rua/Avenida'),
      number: this.getCustomField('Numero'),
      neighborhood: this.getCustomField('Bairro'),
      postal_code: this.getCustomField('CEP'),
      city: this.getCustomField('Cidade'),
      complement: this.getCustomField('Complemento'),
      internal_notes: this.getCustomField('Anotacoes internas do pedido'),
      contact_id: lead.contact_id,
    };
  },

  getCustomField(fieldName) {
    if (!this.entity.custom_fields_values) return '';
    const field = this.entity.custom_fields_values.find(f => f.field_name === fieldName);
    return field?.value || '';
  },
});

// ── Render ──────────────────────────────────────────────────────────────────

Kommo.render(function(parent) {
  const container = document.createElement('div');
  container.id = 'kommo-widget-container';
  container.innerHTML = `
    <!-- Modal -->
    <div id="kommo-modal" style="
      display:none; position:fixed; top:0; left:0;
      width:100%; height:100%;
      background:rgba(0,0,0,0.5); z-index:10000;
      justify-content:center; align-items:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    ">
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:380px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3)">
        <div id="kommo-modal-title" style="font-size:17px;font-weight:700;color:#17202a;margin-bottom:12px"></div>
        <div id="kommo-modal-body" style="font-size:14px;color:#444;line-height:1.6;margin-bottom:24px"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="kommo-modal-cancel" style="
            padding:9px 16px;background:#e0e0e0;color:#333;
            border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer
          ">Cancelar</button>
          <button id="kommo-modal-confirm" style="
            padding:9px 16px;background:#2196F3;color:#fff;
            border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer
          ">Confirmar</button>
        </div>
      </div>
    </div>

    <!-- Painel -->
    <div style="padding:12px;background:#f9f9f9;border-radius:8px;margin:10px 0">
      <div id="kommo-stock-display" style="font-size:12px;margin-bottom:10px;color:#666">
        📦 Estoque: carregando...
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button id="kommo-btn-single" style="
          padding:10px 6px;background:#2196F3;color:#fff;
          border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer
        ">📄 Gerar Etiqueta</button>
        <button id="kommo-btn-batch" style="
          padding:10px 6px;background:#FF9800;color:#fff;
          border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer
        ">📦 Gerar Lote</button>
      </div>
      <div id="kommo-status" style="margin-top:8px;font-size:12px;color:#555;min-height:18px;line-height:1.5"></div>
    </div>
  `;
  parent.appendChild(container);
});
