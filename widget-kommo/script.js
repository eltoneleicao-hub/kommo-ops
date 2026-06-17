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

    // Pipelines sempre liberados (hardcode), somados ao setting do widget.
    var EXTRA_PIPELINES = ['13533275', '13680395'];

    // Lista de pipelines permitidos (setting pipeline_id, separado por vírgula).
    // Vazio = todos os pipelines liberados.
    function allowedPipelines() {
      return String(cfg().pipeline_id || '')
        .split(/[\s,;]+/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    }

    function pipelineAllowed(leadPipelineId) {
      var id = String(leadPipelineId);
      if (EXTRA_PIPELINES.indexOf(id) >= 0) return true; // sempre liberados
      var list = allowedPipelines();
      if (!list.length) return true;                     // setting vazio = todos
      return list.indexOf(id) >= 0;
    }

    function pipelineBlocked() {
      setStatus('<span style="color:#999">⚠ Etiquetas não disponíveis para este pipeline</span>');
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
      $modal.find('#ge-modal-confirm').show().off('click').on('click', function () {
        $modal.css('display', 'none');
        onConfirm();
      });
      $modal.css('display', 'flex');
    }

    var REGIOES = ['Centro', 'Norte', 'Sul', 'Leste', 'Oeste', 'Sudeste'];

    // Seletor de região (1ª etapa da dupla confirmação). A escolha em si não
    // dispara o lote — leva à contagem + modal de confirmação.
    function showRegionPicker() {
      var $modal = $('#ge-modal');
      $modal.find('#ge-modal-title').html('🗺️ Lote por Região');
      var btns = REGIOES.map(function (r) {
        return '<button class="ge-region-opt" data-region="' + r + '" ' +
          'style="padding:10px 4px;background:#673AB7;color:#fff;border:none;border-radius:5px;' +
          'font-size:12px;font-weight:700;cursor:pointer">' + r + '</button>';
      }).join('');
      $modal.find('#ge-modal-body').html(
        '<div style="font-size:12px;color:#666;margin-bottom:10px">Escolha a região para gerar o lote desta etapa do funil:</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' + btns + '</div>'
      );
      $modal.find('#ge-modal-confirm').hide(); // a escolha da região é a ação
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

    // Escolhe o telefone do campo PHONE (multivalor), priorizando "Tel. comercial"
    // (enum WORK). Se não houver comercial, cai pro primeiro número preenchido.
    function pickPhoneValue(values) {
      if (!values || !values.length) return '';
      var preferCode = ['WORK', 'WORKDD', 'COML'];
      // 1ª passada: tipo comercial/trabalho
      for (var i = 0; i < values.length; i++) {
        var code = String(values[i].enum_code || '').toUpperCase();
        var label = norm(values[i].enum || '');
        var isComercial = preferCode.indexOf(code) >= 0 ||
                          label.indexOf('comercial') >= 0 || label.indexOf('trabalho') >= 0;
        if (isComercial && values[i].value) return String(values[i].value);
      }
      // 2ª passada: primeiro não-vazio
      for (var j = 0; j < values.length; j++) {
        if (values[j].value) return String(values[j].value);
      }
      return '';
    }

    // Busca dados do CONTATO (no Kommo o telefone e o nome do destinatário ficam
    // no contato, não no lead). Telefone prioriza "Tel. comercial".
    // Retorna { name, phone }.
    function getContact(contactId, callback) {
      if (!contactId) { callback({ name: '', phone: '' }); return; }
      $.ajax({
        url: '/api/v4/contacts/' + contactId,
        method: 'GET',
        dataType: 'json',
        success: function (c) {
          var cf = (c && c.custom_fields_values) || [];
          var phone = '';
          // 1) campo PHONE (multivalor) — prioriza Tel. comercial
          for (var i = 0; i < cf.length; i++) {
            if (String(cf[i].field_code || '').toUpperCase() === 'PHONE') {
              try { console.log('[GE] telefones do contato:', JSON.stringify(cf[i].values)); } catch (e) {}
              phone = pickPhoneValue(cf[i].values);
              if (phone) break;
            }
          }
          // 2) fallback por nome de campo custom
          if (!phone) phone = extractField(cf, ['Tel. comercial', 'Telefone comercial', 'Telefone', 'Celular', 'Phone']);
          var name = (c && c.name) ? String(c.name) : '';
          console.log('[GE] contato nome=', name, 'tel=', phone);
          callback({ name: name, phone: phone });
        },
        error: function (xhr) {
          console.log('[GE] erro ao buscar contato', contactId, xhr.status);
          callback({ name: '', phone: '' });
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

        if (!pipelineAllowed(lead.pipeline_id)) { pipelineBlocked(); return; }

        var fields = lead.fields;

        // Nome e telefone vêm do contato; se não houver, cai para o lead/campos.
        getContact(lead.contactId, function (contact) {
          var phone = contact.phone || extractField(fields, ['Telefone', 'Celular', 'Phone']);
          var name = contact.name || lead.name || '';

          var payload = {
            secret: settings.api_key,
            kommoLeadId: lead.id,
            kommoPipelineId: lead.pipeline_id,
            kommoStageId: lead.status_id,
            recipientName: name,
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
                  '<span style="color:#4CAF50;font-weight:bold">✓ ' +
                  (data.reprint ? 'Reimpressão enviada!' : 'Etiqueta gerada!') + '</span>' +
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
              console.log('[GE] erro requests status=', xhr.status, 'resp=', xhr.responseText);
              var msg = 'Erro ao gerar etiqueta';
              try { var d = JSON.parse(xhr.responseText); msg = d.message || d.error || msg; } catch (e) {}
              var dica = xhr.status === 401 ? ' — confira o api_key (secret)' :
                         xhr.status === 0 ? ' — CORS/conexão (verifique api_url)' : '';
              setStatus('<span style="color:#f44336">✗ ' + msg + ' (HTTP ' + xhr.status + ')' + dica + '</span>');
            }
          });
        });
      });
    }

    /* ── Lote (com seleção) ──────────────────────────────────────────────── */

    // Erro padrão de chamadas de lote (trata estoque insuficiente).
    function batchError(xhr, fallback) {
      var msg = fallback;
      try {
        var d = JSON.parse(xhr.responseText);
        if (d.error === 'insufficient_stock') {
          msg = 'Estoque insuficiente — disponível: ' + d.available + ', necessário: ' + d.needed;
        } else { msg = d.message || d.error || msg; }
      } catch (e) {}
      setStatus('<span style="color:#f44336">✗ ' + msg + '</span>');
    }

    // Modal de SELEÇÃO de leads (checkboxes). Usado por Lote e Lote por Região.
    function showLeadSelection(title, leads, onConfirm) {
      var $modal = $('#ge-modal');
      $modal.find('#ge-modal-title').html(title);

      var eligibles = leads.filter(function (l) { return l.eligible; });
      if (!eligibles.length) {
        $modal.find('#ge-modal-body').html(
          '<div style="font-size:12px;color:#999">Nenhum lead elegível (todos com campos faltando).</div>'
        );
        $modal.find('#ge-modal-confirm').hide();
        $modal.css('display', 'flex');
        return;
      }

      var rows = leads.map(function (l) {
        var sub = [l.neighborhood, l.regiao].filter(Boolean).join(' · ');
        if (l.eligible) {
          return '<label style="display:flex;gap:6px;align-items:flex-start;padding:5px 0;font-size:12px;cursor:pointer">' +
            '<input type="checkbox" class="ge-sel" value="' + l.kommoLeadId + '" checked style="margin-top:2px">' +
            '<span>' + (l.recipientName || '(sem nome)') +
            (sub ? ' <small style="color:#999">' + sub + '</small>' : '') + '</span></label>';
        }
        return '<div style="padding:5px 0;font-size:12px;color:#c0c0c0">⚠ ' + (l.recipientName || '(sem nome)') +
          ' <small>falta: ' + (l.missingFields || []).join(', ') + '</small></div>';
      }).join('');

      $modal.find('#ge-modal-body').html(
        '<label style="display:flex;gap:6px;align-items:center;font-size:12px;font-weight:700;margin-bottom:6px;cursor:pointer">' +
          '<input type="checkbox" id="ge-sel-all" checked> Selecionar todos (' + eligibles.length + ' elegíveis)</label>' +
        '<div style="max-height:240px;overflow:auto;border-top:1px solid #eee;padding-top:6px">' + rows + '</div>'
      );

      $modal.find('#ge-modal-confirm').show().off('click').on('click', function () {
        var ids = [];
        $modal.find('.ge-sel:checked').each(function () { ids.push(String($(this).val())); });
        if (!ids.length) return; // nada selecionado → não faz nada
        $modal.css('display', 'none');
        onConfirm(ids);
      });

      $modal.css('display', 'flex');
    }

    // Busca os candidatos (modo lista) e abre o seletor. region = null => todos.
    function fetchAndSelect(region) {
      setStatus('⏳ Buscando leads' + (region ? ' da região ' + region : '') + '...');
      getLead(function (err, lead) {
        if (err) { setStatus('<span style="color:#f44336">✗ ' + err.message + '</span>'); return; }
        if (!pipelineAllowed(lead.pipeline_id)) { pipelineBlocked(); return; }
        var body = {
          secret: cfg().api_key,
          kommoPipelineId: String(lead.pipeline_id),
          kommoStageId: String(lead.status_id),
          list: true
        };
        if (region) body.region = region;
        $.ajax({
          url: apiBase() + '/api/kommo/requests-batch',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(body),
          success: function (data) {
            var leads = (data && data.leads) || [];
            if (!leads.length) {
              setStatus('<span style="color:#999">Nenhum lead' + (region ? ' na região ' + region : '') + ' nesta etapa</span>');
              return;
            }
            var title = region ? ('🗺️ Lote — ' + region) : '📦 Gerar Lote';
            showLeadSelection(title, leads, function (ids) { doBatchSelected(region, ids, lead); });
          },
          error: function (xhr) { batchError(xhr, 'Erro ao buscar leads'); }
        });
      });
    }

    // Gera apenas os leads selecionados.
    function doBatchSelected(region, ids, lead) {
      setStatus('⏳ Gerando ' + ids.length + ' etiqueta(s)...');
      var body = {
        secret: cfg().api_key,
        kommoPipelineId: String(lead.pipeline_id),
        kommoStageId: String(lead.status_id),
        kommoLeadIds: ids,
        deductStock: true
      };
      if (region) body.region = region;
      $.ajax({
        url: apiBase() + '/api/kommo/requests-batch',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(body),
        success: function (data) {
          setStatus(
            '<span style="color:#4CAF50;font-weight:bold">✓ ' + (region ? 'Lote ' + region : 'Lote') + ' processado!</span><br>' +
            '<small>' + data.generated + ' etiqueta(s)</small>' +
            (data.incomplete > 0 ? '<br><small style="color:#FF9800">' + data.incomplete + ' incompletos</small>' : '') +
            (data.stockDeducted > 0 ? '<br><small>📦 ' + data.stockDeducted + ' convites deduzidos</small>' : '')
          );
          refreshStock();
        },
        error: function (xhr) { batchError(xhr, 'Erro ao gerar lote'); }
      });
    }

    /* ── Definir Região ──────────────────────────────────────────────────── */

    // Descobre o campo "Região" (id, tipo e opções) lendo os custom fields do
    // lead — funciona mesmo com o campo vazio. Cacheado.
    var _regiaoField = null;
    function getRegiaoField(callback) {
      if (_regiaoField) { callback(_regiaoField); return; }
      $.ajax({
        url: '/api/v4/leads/custom_fields?limit=250',
        method: 'GET',
        dataType: 'json',
        success: function (data) {
          var fields = (data && data._embedded && data._embedded.custom_fields) || [];
          var alvo = norm('Região');
          var found = null;
          for (var i = 0; i < fields.length; i++) {
            var fname = norm(fields[i].name);
            if (fname === alvo || fname.indexOf(alvo) === 0) { found = fields[i]; break; }
          }
          _regiaoField = found;
          try {
            console.log('[GE] campo Região:', found ? { id: found.id, type: found.type, enums: found.enums } : null);
          } catch (e) {}
          callback(found);
        },
        error: function (xhr) {
          console.log('[GE] erro ao listar custom_fields', xhr.status);
          callback(null);
        }
      });
    }

    // Monta o values[] do PATCH conforme o tipo do campo (select usa enum_id).
    function buildRegionValues(field, regiao) {
      var type = String(field.type || 'text').toLowerCase();
      if (type === 'select' || type === 'multiselect' || type === 'radiobutton') {
        var enums = field.enums || [];
        var want = norm(regiao);
        for (var i = 0; i < enums.length; i++) {
          var ev = norm(enums[i].value);
          if (ev === want || ev.indexOf(want) >= 0 || want.indexOf(ev) >= 0) {
            return [{ enum_id: enums[i].id }];
          }
        }
        return null; // nenhuma opção do dropdown corresponde à região
      }
      return [{ value: regiao }]; // texto/textarea
    }

    function doSetRegion() {
      setStatus('⏳ Lendo endereço do lead...');

      getLead(function (err, lead) {
        if (err) {
          setStatus('<span style="color:#f44336">✗ ' + err.message + '</span>');
          return;
        }
        if (!pipelineAllowed(lead.pipeline_id)) { pipelineBlocked(); return; }

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

            // 2. Descobre o campo (tipo + opções) e grava no lead via sessão
            getRegiaoField(function (field) {
              if (!field) {
                setStatus('<span style="color:#f44336">✗ Campo "Região" não encontrado no Kommo</span>');
                return;
              }

              var values = buildRegionValues(field, res.regiao);
              if (!values) {
                setStatus(
                  '<span style="color:#FF9800;font-weight:bold">⚠ Sem opção para "' + res.regiao + '"</span><br>' +
                  '<small>O campo "Região" é uma lista e não tem a opção "' + res.regiao + '". Crie essa opção no Kommo.</small>'
                );
                return;
              }

              setStatus('⏳ Gravando "' + res.regiao + '"...');

              $.ajax({
                url: '/api/v4/leads/' + lead.id,
                method: 'PATCH',
                contentType: 'application/json',
                dataType: 'json',
                data: JSON.stringify({
                  custom_fields_values: [{ field_id: field.id, values: values }]
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
                  var detail = '';
                  try {
                    var d = JSON.parse(xhr.responseText);
                    detail = d['validation-errors'] ? ' — ' + JSON.stringify(d['validation-errors']) : (d.title ? ' — ' + d.title : '');
                  } catch (e) {}
                  setStatus('<span style="color:#f44336">✗ Falha ao gravar região (' + xhr.status + ')' + detail + '</span>');
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
              '<button id="ge-btn-region-batch" style="width:100%;margin-top:6px;padding:8px 4px;background:#009688;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer">🗺️ Lote por Região</button>' +
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
            fetchAndSelect(null);
          })
          .on('click.ge', '#ge-btn-region', function () {
            showModal(
              '📍 Definir Região',
              'Resolver a região pelo bairro/CEP deste lead e gravar no campo "Região"?',
              doSetRegion
            );
          })
          .on('click.ge', '#ge-btn-region-batch', function () {
            showRegionPicker();
          })
          .on('click.ge', '.ge-region-opt', function () {
            var region = String($(this).attr('data-region'));
            $('#ge-modal').css('display', 'none');
            fetchAndSelect(region);
          })
          .on('change.ge', '#ge-sel-all', function () {
            $('#ge-modal').find('.ge-sel').prop('checked', $(this).prop('checked'));
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
