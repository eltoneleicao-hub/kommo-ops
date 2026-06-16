window.KommoWidget = window.KommoWidget || {};

define(['jquery'], function ($) {
  'use strict';

  return function () {
    var self = this;

    // Registro do widget no framework (necessário p/ interface_version 2)
    self.config = {
      code: 'gerar_etiqueta',
      prefix: 'ge'
    };

    /* ── Helpers ─────────────────────────────────────────────────────────── */

    function cfg() { return self.get_settings(); }

    function apiBase() {
      return (cfg().api_url || '').replace(/\/$/, '');
    }

    function currentLeadId() {
      try {
        if (APP.data && APP.data.current_card && APP.data.current_card.id) {
          return String(APP.data.current_card.id);
        }
      } catch (e) {}
      try { return String(APP.constant('id')); } catch (e) {}
      return '';
    }

    // Lê valor de custom field por nome (estrutura v4: field_name + values[].value)
    function extractField(fields, name) {
      if (!fields) return '';
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var fname = f.field_name || f.name;
        if (fname === name) {
          var v = f.values;
          return (v && v.length) ? String(v[0].value || '') : '';
        }
      }
      return '';
    }

    /* ── UI ──────────────────────────────────────────────────────────────── */

    function setStatus(html) {
      $('#ge-status').html(html);
    }

    function setStock(data) {
      var $el = $('#ge-stock');
      if (!$el.length) return;
      if (!data || !data.configured) {
        $el.text('Estoque: não configurado').css('color', '#999');
        return;
      }
      var qty = data.availableQty;
      $el.text('📦 Estoque: ' + qty + ' convites')
         .css('color', qty > 5 ? '#4CAF50' : qty > 0 ? '#FF9800' : '#f44336');
    }

    function refreshStock() {
      $.ajax({
        url: apiBase() + '/api/stock/summary',
        data: { secret: cfg().api_key },
        success: setStock,
        error: function () { setStock(null); }
      });
    }

    function showModal(title, body, onConfirm) {
      var $modal = $('#ge-modal');
      $modal.find('#ge-modal-title').html(title);
      $modal.find('#ge-modal-body').html(body);
      $modal.find('#ge-modal-confirm').off('click').on('click', function () {
        $modal.css('display', 'none');
        onConfirm();
      });
      $modal.css('display', 'flex');
    }

    /* ── API calls ───────────────────────────────────────────────────────── */

    // Normaliza um lead (v4 ou current_card) para um formato único
    function normalizeLead(raw, fallbackId) {
      var contactId = '';
      try {
        if (raw._embedded && raw._embedded.contacts && raw._embedded.contacts.length) {
          contactId = String(raw._embedded.contacts[0].id);
        } else if (raw.contacts && raw.contacts.id) {
          contactId = String(raw.contacts.id);
        }
      } catch (e) {}

      return {
        id: String(raw.id || fallbackId || ''),
        name: raw.name || '',
        pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : '',
        status_id: raw.status_id != null ? String(raw.status_id) : '',
        fields: raw.custom_fields_values || raw.custom_fields || raw.cf || [],
        contactId: contactId
      };
    }

    // Busca o lead atual: $.ajax direto à API v4 (mesma origem, cookie de sessão),
    // com fallback p/ APP.data.current_card
    function getLead(callback) {
      var id = currentLeadId();
      console.log('[GE] getLead id=', id);
      if (!id) { callback(new Error('Lead não identificado')); return; }

      function fallback(reason) {
        try {
          var c = APP.data && APP.data.current_card;
          console.log('[GE] fallback current_card:', c);
          if (c && c.id) { callback(null, normalizeLead(c, id)); return; }
        } catch (e) {}
        callback(new Error(reason || 'Erro ao carregar lead'));
      }

      $.ajax({
        url: '/api/v4/leads/' + id + '?with=contacts',
        method: 'GET',
        dataType: 'json',
        success: function (data) {
          console.log('[GE] lead v4:', data);
          if (data && data.id) { callback(null, normalizeLead(data, id)); }
          else { fallback('Lead vazio'); }
        },
        error: function (xhr) {
          console.log('[GE] erro v4 status=', xhr.status, xhr.responseText);
          fallback('Erro v4 (' + xhr.status + ')');
        }
      });
    }

    /* ── Generate single ─────────────────────────────────────────────────── */

    function doGenerateSingle() {
      setStatus('⏳ Buscando dados do lead...');
      var settings = cfg();

      getLead(function (err, lead) {
        if (err) {
          setStatus('<span style="color:#f44336">✗ ' + err.message + '</span>');
          return;
        }

        if (settings.pipeline_id && lead.pipeline_id && lead.pipeline_id !== String(settings.pipeline_id)) {
          setStatus('<span style="color:#999">⚠ Etiquetas não disponíveis para este pipeline</span>');
          return;
        }

        var fields = lead.fields;
        var payload = {
          secret: settings.api_key,
          kommoLeadId: lead.id,
          kommoPipelineId: lead.pipeline_id,
          kommoStageId: lead.status_id,
          recipientName: lead.name || '',
          recipientPhone: extractField(fields, 'Telefone'),
          street: extractField(fields, 'Rua/Avenida'),
          number: extractField(fields, 'Numero'),
          neighborhood: extractField(fields, 'Bairro'),
          postalCode: extractField(fields, 'CEP'),
          city: extractField(fields, 'Cidade'),
          complement: extractField(fields, 'Complemento'),
          internalOrderNotes: extractField(fields, 'Anotacoes internas do pedido'),
          kommoUrl: 'https://' + self.system().subdomain + '.kommo.com/leads/detail/' + lead.id,
          deductStock: true
        };

        if (lead.contactId) {
          payload.kommoContactId = lead.contactId;
        }

        setStatus('⏳ Gerando etiqueta...');

        $.ajax({
          url: apiBase() + '/api/kommo/requests',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(payload),
          success: function (data) {
            if (data.status === 'etiqueta_gerada') {
              setStatus(
                '<span style="color:#4CAF50;font-weight:bold">✓ Etiqueta gerada!</span>' +
                (data.stockDeducted ? '<br><small>📦 1 convite deduzido do estoque</small>' : '')
              );
            } else if (data.status === 'campos_incompletos') {
              setStatus(
                '<span style="color:#FF9800;font-weight:bold">⚠ Campos faltando</span><br>' +
                '<small>' + (data.missingFields || []).join(', ') + '</small>'
              );
            }
            refreshStock();
          },
          error: function (xhr) {
            var msg = 'Erro ao gerar etiqueta';
            try { msg = JSON.parse(xhr.responseText).message || msg; } catch (e) {}
            setStatus('<span style="color:#f44336">✗ ' + msg + '</span>');
          }
        });
      });
    }

    /* ── Generate batch ──────────────────────────────────────────────────── */

    function doGenerateBatch() {
      setStatus('⏳ Buscando dados...');
      var settings = cfg();

      getLead(function (err, lead) {
        if (err) {
          setStatus('<span style="color:#f44336">✗ ' + err.message + '</span>');
          return;
        }

        if (settings.pipeline_id && lead.pipeline_id && lead.pipeline_id !== String(settings.pipeline_id)) {
          setStatus('<span style="color:#999">⚠ Etiquetas não disponíveis para este pipeline</span>');
          return;
        }

        $.ajax({
          url: apiBase() + '/api/kommo/requests-batch',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
            secret: settings.api_key,
            kommoPipelineId: String(lead.pipeline_id),
            kommoStageId: String(lead.status_id),
            deductStock: true
          }),
          success: function (data) {
            setStatus(
              '<span style="color:#4CAF50;font-weight:bold">✓ Lote processado!</span><br>' +
              '<small>' + data.generated + ' etiquetas geradas</small>' +
              (data.incomplete > 0 ? '<br><small style="color:#FF9800">' + data.incomplete + ' incompletos</small>' : '') +
              (data.stockDeducted > 0 ? '<br><small>📦 ' + data.stockDeducted + ' convites deduzidos</small>' : '')
            );
            refreshStock();
          },
          error: function (xhr) {
            var msg = 'Erro ao gerar lote';
            try {
              var d = JSON.parse(xhr.responseText);
              if (d.error === 'insufficient_stock') {
                msg = 'Estoque insuficiente — disponível: ' + d.available + ', necessário: ' + d.needed;
              } else {
                msg = d.message || d.error || msg;
              }
            } catch (e) {}
            setStatus('<span style="color:#f44336">✗ ' + msg + '</span>');
          }
        });
      });
    }

    /* ── Callbacks ───────────────────────────────────────────────────────── */

    this.callbacks = {

      render: function () {
        console.log('[GE] render area=', self.system().area);
        if (self.system().area !== 'lcard') return true;
        console.log('[GE] renderizando botões no lead card');

        self.render_template({
          body: '',
          caption: { class_name: 'ge_widget' },
          render:
            '<div id="ge-widget" style="padding:4px 0">' +
              '<div id="ge-stock" style="font-size:11px;margin-bottom:8px;color:#666">📦 Carregando estoque...</div>' +
              '<div style="display:flex;gap:6px">' +
                '<button id="ge-btn-single" style="flex:1;padding:8px 4px;background:#2196F3;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer">📄 Gerar Etiqueta</button>' +
                '<button id="ge-btn-batch" style="flex:1;padding:8px 4px;background:#FF9800;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer">📦 Gerar Lote</button>' +
              '</div>' +
              '<div id="ge-status" style="margin-top:6px;font-size:11px;min-height:14px;line-height:1.4"></div>' +
            '</div>'
        });

        if (!$('#ge-modal').length) {
          $('body').append(
            '<div id="ge-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;' +
            'background:rgba(0,0,0,.5);z-index:99999;justify-content:center;align-items:center">' +
              '<div style="background:#fff;border-radius:10px;padding:22px;max-width:360px;width:90%;' +
              'box-shadow:0 8px 32px rgba(0,0,0,.25)">' +
                '<div id="ge-modal-title" style="font-size:15px;font-weight:700;margin-bottom:10px"></div>' +
                '<div id="ge-modal-body" style="font-size:13px;color:#444;line-height:1.5;margin-bottom:18px"></div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end">' +
                  '<button id="ge-modal-cancel" style="padding:8px 14px;background:#e0e0e0;color:#333;border:none;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>' +
                  '<button id="ge-modal-confirm" style="padding:8px 14px;background:#2196F3;color:#fff;border:none;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer">Confirmar</button>' +
                '</div>' +
              '</div>' +
            '</div>'
          );
        }

        return true;
      },

      init: function () {
        if (self.system().area !== 'lcard') return true;
        refreshStock();
        return true;
      },

      bind_actions: function () {
        if (self.system().area !== 'lcard') return true;

        $(document)
          .off('.ge')
          .on('click.ge', '#ge-btn-single', function () {
            showModal(
              '📄 Gerar Etiqueta',
              'Gerar etiqueta para este lead e deduzir 1 convite do estoque?',
              doGenerateSingle
            );
          })
          .on('click.ge', '#ge-btn-batch', function () {
            showModal(
              '📦 Gerar Lote',
              'Gerar etiquetas para todos os leads elegíveis desta etapa e deduzir do estoque?',
              doGenerateBatch
            );
          })
          .on('click.ge', '#ge-modal-cancel', function () {
            $('#ge-modal').css('display', 'none');
          })
          .on('click.ge', '#ge-modal', function (e) {
            if (e.target === this) $('#ge-modal').css('display', 'none');
          });

        return true;
      },

      settings: function () { return true; },

      onSave: function () { return true; },

      destroy: function () {
        $(document).off('.ge');
        $('#ge-modal').remove();
        return true;
      }
    };

    return this;
  };
});
