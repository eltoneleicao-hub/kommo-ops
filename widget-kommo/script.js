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

    // Normaliza nome de campo: remove acentos, minúsculas, sem espaços extras
    function norm(s) {
      return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
    }

    // Extrai o valor textual de um custom field (lida com values[] do Kommo v4).
    function fieldValue(f) {
      var v = f.values || f.value;
      if (!v) return '';
      if (Array.isArray(v)) {
        if (!v.length) return '';
        var first = v[0];
        return String((first && first.value != null ? first.value : first) || '');
      }
      return String(v || '');
    }

    // Lê valor de custom field por nome (insensível a acento/maiúsculas).
    // Casamento em camadas: exato → prefixo → contém. Retorna o 1º valor NÃO vazio.
    // Isso tolera sufixos do Kommo como "... teste bling" ou "Número da casa".
    // Aceita lista de nomes alternativos.
    function extractField(fields, names) {
      if (!fields || !fields.length) return '';
      var wanted = (typeof names === 'string' ? [names] : names).map(norm);

      var matchers = [
        function (fname, w) { return fname === w; },            // exato
        function (fname, w) { return fname.indexOf(w) === 0; }, // prefixo
        function (fname, w) { return fname.indexOf(w) >= 0; }   // contém
      ];

      for (var m = 0; m < matchers.length; m++) {
        for (var i = 0; i < fields.length; i++) {
          var fname = norm(fields[i].field_name || fields[i].name);
          for (var k = 0; k < wanted.length; k++) {
            if (matchers[m](fname, wanted[k])) {
              var val = fieldValue(fields[i]);
              if (val) return val;
            }
          }
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
          if (data && data.id) {
            var nl = normalizeLead(data, id);
            try {
              console.log('[GE] campos do lead:', (nl.fields || []).map(function (f) {
                return (f.field_name || f.name) + ' = ' + fieldValue(f);
              }));
            } catch (e) {}
            callback(null, nl);
          }
          else { fallback('Lead vazio'); }
        },
        error: function (xhr) {
          console.log('[GE] erro v4 status=', xhr.status, xhr.responseText);
          fallback('Erro v4 (' + xhr.status + ')');
        }
      });
    }

    // Busca o telefone real no CONTATO (no Kommo o telefone fica no contato,
    // não no lead — o campo "Telefone continua o mesmo" do lead é só um dropdown).
    function getContactPhone(contactId, callback) {
      if (!contactId) { callback(''); return; }
      $.ajax({
        url: '/api/v4/contacts/' + contactId,
        method: 'GET',
        dataType: 'json',
        success: function (c) {
          var cf = (c && c.custom_fields_values) || [];
          var phone = '';
          // 1) telefone pelo field_code padrão do Kommo
          for (var i = 0; i < cf.length; i++) {
            if (String(cf[i].field_code || '').toUpperCase() === 'PHONE') {
              phone = fieldValue(cf[i]);
              if (phone) break;
            }
          }
          // 2) fallback por nome
          if (!phone) phone = extractField(cf, ['Telefone', 'Celular', 'Phone', 'Whatsapp', 'WhatsApp']);
          console.log('[GE] telefone do contato', contactId, '=', phone);
          callback(phone);
        },
        error: function (xhr) {
          console.log('[GE] erro ao buscar contato', contactId, xhr.status);
          callback('');
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

        // Telefone vem do contato; se não houver, tenta campo exato no lead.
        getContactPhone(lead.contactId, function (contactPhone) {
          var phone = contactPhone || extractField(fields, ['Telefone', 'Celular', 'Phone']);

          var payload = {
            secret: settings.api_key,
            kommoLeadId: lead.id,
            kommoPipelineId: lead.pipeline_id,
            kommoStageId: lead.status_id,
            recipientName: lead.name || '',
            recipientPhone: phone,
            street: extractField(fields, ['Rua/Avenida', 'Endereco', 'Endereço', 'Logradouro', 'Rua']),
            number: extractField(fields, ['Numero', 'Número', 'N°', 'Nº', 'Num']),
            neighborhood: extractField(fields, ['Bairro']),
            postalCode: extractField(fields, ['CEP', 'Cep']),
            city: extractField(fields, ['Cidade', 'Municipio', 'Município']),
            complement: extractField(fields, ['Complemento', 'Compl']),
            internalOrderNotes: extractField(fields, ['Anotacoes internas do pedido', 'Anotações internas', 'Anotacoes internas', 'Regiao', 'Região']),
            kommoUrl: 'https://' + self.system().subdomain + '.kommo.com/leads/detail/' + lead.id,
            deductStock: true
          };

          if (lead.contactId) {
            payload.kommoContactId = lead.contactId;
          }

          console.log('[GE] payload final:', payload);
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

    /* ── Definir Região ──────────────────────────────────────────────────── */

    // Descobre o field_id do campo "Região" lendo a definição de custom fields
    // do lead (funciona mesmo com o campo vazio no lead). Cacheado.
    var _regiaoFieldId = null;
    function getRegiaoFieldId(callback) {
      if (_regiaoFieldId) { callback(_regiaoFieldId); return; }
      $.ajax({
        url: '/api/v4/leads/custom_fields?limit=250',
        method: 'GET',
        dataType: 'json',
        success: function (data) {
          var fields = (data && data._embedded && data._embedded.custom_fields) || [];
          var alvo = norm('Região');
          for (var i = 0; i < fields.length; i++) {
            var fname = norm(fields[i].name);
            if (fname === alvo || fname.indexOf(alvo) === 0) {
              _regiaoFieldId = fields[i].id;
              break;
            }
          }
          console.log('[GE] field_id Região =', _regiaoFieldId);
          callback(_regiaoFieldId);
        },
        error: function (xhr) {
          console.log('[GE] erro ao listar custom_fields', xhr.status);
          callback(null);
        }
      });
    }

    function doSetRegion() {
      setStatus('⏳ Lendo endereço do lead...');

      getLead(function (err, lead) {
        if (err) {
          setStatus('<span style="color:#f44336">✗ ' + err.message + '</span>');
          return;
        }

        var fields = lead.fields;
        var bairro = extractField(fields, ['Bairro']);
        var cep = extractField(fields, ['CEP', 'Cep']);

        setStatus('⏳ Resolvendo região...');

        // 1. Backend resolve a região (bairro + CEP)
        $.ajax({
          url: apiBase() + '/api/region/resolve',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({ secret: cfg().api_key, bairro: bairro, cep: cep }),
          success: function (res) {
            if (!res || !res.regiao) {
              setStatus(
                '<span style="color:#FF9800;font-weight:bold">⚠ Região indefinida</span><br>' +
                '<small>Bairro "' + (bairro || '—') + '" não reconhecido. Revise manualmente.</small>'
              );
              return;
            }

            // Confiança baixa: NÃO grava — apenas sugere e pede revisão do operador.
            if (res.confidence === 'baixa') {
              setStatus(
                '<span style="color:#FF9800;font-weight:bold">⚠ Sugestão: ' + res.regiao + '</span><br>' +
                '<small>Confiança baixa (bairro "' + (bairro || '—') + '" é de fronteira/incerto).<br>' +
                'Não gravei — confira e defina manualmente se estiver correto.</small>'
              );
              return;
            }

            // 2. Descobre o field_id e grava no lead via sessão
            getRegiaoFieldId(function (fieldId) {
              if (!fieldId) {
                setStatus('<span style="color:#f44336">✗ Campo "Região" não encontrado no Kommo</span>');
                return;
              }

              setStatus('⏳ Gravando "' + res.regiao + '"...');

              $.ajax({
                url: '/api/v4/leads/' + lead.id,
                method: 'PATCH',
                contentType: 'application/json',
                dataType: 'json',
                data: JSON.stringify({
                  custom_fields_values: [
                    { field_id: fieldId, values: [{ value: res.regiao }] }
                  ]
                }),
                success: function () {
                  var aviso = res.confidence === 'media'
                    ? '<br><small style="color:#999">via ' + res.method + '</small>'
                    : '';
                  setStatus(
                    '<span style="color:#4CAF50;font-weight:bold">✓ Região: ' + res.regiao + '</span>' + aviso
                  );
                },
                error: function (xhr) {
                  console.log('[GE] erro PATCH lead', xhr.status, xhr.responseText);
                  setStatus('<span style="color:#f44336">✗ Falha ao gravar região (' + xhr.status + ')</span>');
                }
              });
            });
          },
          error: function (xhr) {
            var msg = 'Erro ao resolver região';
            try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) {}
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
              '<button id="ge-btn-region" style="width:100%;margin-top:6px;padding:8px 4px;background:#673AB7;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer">📍 Definir Região</button>' +
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
          .on('click.ge', '#ge-btn-region', function () {
            showModal(
              '📍 Definir Região',
              'Resolver a região pelo bairro/CEP deste lead e gravar no campo "Região"?',
              doSetRegion
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
