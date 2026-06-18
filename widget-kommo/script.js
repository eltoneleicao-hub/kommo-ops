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

    // Núcleo da região a partir do valor do campo (tolera nomes do dropdown como
    // "Região Sul" vs "Sul"): devolve uma das 6 regiões em forma normalizada, ou
    // o próprio valor normalizado se nenhuma casar. Usado pra comparar com robustez.
    function regionCore(value) {
      var n = norm(value);
      if (!n) return '';
      for (var i = 0; i < REGIOES.length; i++) {
        var rn = norm(REGIOES[i]);
        if (n === rn || n.indexOf(rn) >= 0) return rn;
      }
      return n;
    }

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

    // Seletor de MODO do "Definir Região (Lote)": só os sem região (fallback,
    // não regrava quem já tem) ou todos. A escolha dispara doSetRegionBatch.
    function showSetRegionBatchChoice() {
      var $modal = $('#ge-modal');
      $modal.find('#ge-modal-title').html('🧭 Definir Região em Lote');
      $modal.find('#ge-modal-body').html(
        '<div style="font-size:12px;color:#666;margin-bottom:10px">Buscar <b>todos os leads desta etapa</b> no Kommo e gravar a região. Escolha o alcance:</div>' +
        '<div style="display:grid;gap:6px">' +
          '<button class="ge-setregion-mode" data-mode="empty" style="padding:10px 4px;background:#3F51B5;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">Só quem está SEM região</button>' +
          '<button class="ge-setregion-mode" data-mode="all" style="padding:10px 4px;background:#5C6BC0;color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer">Todos (regrava todos)</button>' +
        '</div>' +
        '<div style="font-size:11px;color:#999;margin-top:8px">Sem bairro reconhecido, de divisa (baixa confiança) ou de outra cidade ficam de fora p/ revisão manual.</div>'
      );
      $modal.find('#ge-modal-confirm').hide(); // a escolha do modo é a ação
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
            internalOrderNotes: extractField(fields, ['Região', 'Regiao']),
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

    // Guarda os não-elegíveis da última seleção (p/ o botão "⬇️ CSV não elegíveis").
    var _lastIneligible = [];
    function exportIneligibleCsv() {
      if (!_lastIneligible.length) return;
      var sub = '';
      try { sub = self.system().subdomain; } catch (e) {}
      var header = ['Lead ID', 'Nome', 'Bairro', 'Região', 'Campos faltando', 'Link Kommo'];
      var rows = _lastIneligible.map(function (l) {
        var id = l.kommoLeadId || '';
        var link = (sub && id) ? ('https://' + sub + '.kommo.com/leads/detail/' + id) : '';
        return [id, l.recipientName || '', l.neighborhood || '', l.regiao || '',
          (l.missingFields || []).join(', '), link];
      });
      downloadCsv('leads-nao-elegiveis.csv', header, rows);
    }

    // Botão de CSV dos não-elegíveis (só aparece quando há algum).
    function ineligibleCsvButton(n) {
      if (!n) return '';
      return '<button id="ge-csv-ineligible" style="padding:3px 8px;background:#607D8B;color:#fff;' +
        'border:none;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer">' +
        '⬇️ CSV não elegíveis (' + n + ')</button>';
    }

    // Modal de SELEÇÃO de leads (checkboxes). Usado por Lote e Lote por Região.
    function showLeadSelection(title, leads, onConfirm) {
      var $modal = $('#ge-modal');
      $modal.find('#ge-modal-title').html(title);

      var eligibles = leads.filter(function (l) { return l.eligible; });
      var ineligibles = leads.filter(function (l) { return !l.eligible; });
      _lastIneligible = ineligibles;

      if (!eligibles.length) {
        $modal.find('#ge-modal-body').html(
          '<div style="font-size:12px;color:#999;margin-bottom:8px">Nenhum lead elegível (todos com campos faltando).</div>' +
          ineligibleCsvButton(ineligibles.length)
        );
        $modal.find('#ge-modal-confirm').hide();
        $modal.find('#ge-csv-ineligible').off('click').on('click', exportIneligibleCsv);
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
        (ineligibles.length
          ? '<div style="margin-bottom:6px">' + ineligibleCsvButton(ineligibles.length) +
            ' <small style="color:#999">' + ineligibles.length + ' sem etiqueta (campos faltando)</small></div>'
          : '') +
        '<div style="max-height:240px;overflow:auto;border-top:1px solid #eee;padding-top:6px">' + rows + '</div>'
      );

      $modal.find('#ge-csv-ineligible').off('click').on('click', exportIneligibleCsv);

      $modal.find('#ge-modal-confirm').show().off('click').on('click', function () {
        var ids = [];
        $modal.find('.ge-sel:checked').each(function () { ids.push(String($(this).val())); });
        if (!ids.length) return; // nada selecionado → não faz nada
        $modal.css('display', 'none');
        onConfirm(ids);
      });

      $modal.css('display', 'flex');
    }

    // ID do contato principal de um lead vindo do Kommo (_embedded.contacts).
    function mainContactId(l) {
      try {
        var cs = l._embedded && l._embedded.contacts;
        if (cs && cs.length) {
          for (var i = 0; i < cs.length; i++) { if (cs[i].is_main) return String(cs[i].id); }
          return String(cs[0].id);
        }
      } catch (e) {}
      return '';
    }

    // Busca nome+telefone de vários contatos do Kommo de uma vez (chunks de 250).
    function fetchContactsByIds(ids, onDone) {
      var map = {};
      var unique = [], seen = {};
      ids.forEach(function (id) { if (id && !seen[id]) { seen[id] = 1; unique.push(String(id)); } });
      if (!unique.length) { onDone(map); return; }
      var CH = 100, idx = 0;
      (function next() {
        if (idx >= unique.length) { onDone(map); return; }
        var chunk = unique.slice(idx, idx + CH); idx += chunk.length;
        var qs = chunk.map(function (id) { return 'filter[id][]=' + encodeURIComponent(id); }).join('&');
        setStatus('⏳ Lendo contatos... (' + Math.min(idx, unique.length) + '/' + unique.length + ')');
        $.ajax({
          url: '/api/v4/contacts?' + qs + '&limit=250',
          method: 'GET',
          dataType: 'json',
          success: function (data) {
            var contacts = (data && data._embedded && data._embedded.contacts) || [];
            contacts.forEach(function (c) {
              var cf = c.custom_fields_values || [];
              var phone = '';
              for (var i = 0; i < cf.length; i++) {
                if (String(cf[i].field_code || '').toUpperCase() === 'PHONE') {
                  phone = pickPhoneValue(cf[i].values);
                  if (phone) break;
                }
              }
              if (!phone) phone = extractField(cf, ['Tel. comercial', 'Telefone comercial', 'Telefone', 'Celular', 'Phone']);
              map[String(c.id)] = { name: c.name ? String(c.name) : '', phone: phone };
            });
            next();
          },
          error: function () { next(); } // tolera falha de um chunk
        });
      })();
    }

    // Monta o payload de etiqueta de um lead do Kommo (campos do lead + contato).
    function buildLeadRecord(l, pipelineId, stageId, contactMap) {
      var fields = l.custom_fields_values || [];
      var cid = mainContactId(l);
      var contact = (cid && contactMap[cid]) || { name: '', phone: '' };
      var rec = {
        kommoLeadId: String(l.id),
        kommoPipelineId: String(pipelineId),
        kommoStageId: String(stageId),
        recipientName: contact.name || l.name || '',
        recipientPhone: contact.phone || extractField(fields, ['Telefone', 'Celular', 'Phone']),
        street: extractField(fields, ['Rua/Avenida', 'Endereco', 'Endereço', 'Logradouro', 'Rua']),
        number: extractField(fields, ['Numero', 'Número', 'N°', 'Nº', 'Num']),
        neighborhood: extractField(fields, ['Bairro']),
        postalCode: extractField(fields, ['CEP', 'Cep']),
        city: extractField(fields, ['Cidade', 'Municipio', 'Município']),
        complement: extractField(fields, ['Complemento', 'Compl']),
        internalOrderNotes: extractField(fields, ['Região', 'Regiao']),
        kommoUrl: 'https://' + self.system().subdomain + '.kommo.com/leads/detail/' + l.id
      };
      if (cid) rec.kommoContactId = cid;
      return rec;
    }

    // Valida leads no backend em chunks (evita request gigante / timeout).
    function validateLeadsInChunks(records, onDone) {
      var CH = 200, idx = 0, all = [];
      (function next() {
        if (idx >= records.length) { onDone(all); return; }
        var chunk = records.slice(idx, idx + CH); idx += chunk.length;
        setStatus('⏳ Validando ' + Math.min(idx, records.length) + '/' + records.length + '...');
        $.ajax({
          url: apiBase() + '/api/kommo/requests-batch-direct',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({ secret: cfg().api_key, validateOnly: true, leads: chunk }),
          success: function (data) { all = all.concat((data && data.leads) || []); next(); },
          error: function (xhr) { batchError(xhr, 'Erro ao validar leads'); }
        });
      })();
    }

    // Lê os leads (e contatos) da etapa DIRETO do Kommo, filtra por região
    // (campo Região), valida no backend e abre o seletor. region=null => todos.
    function fetchAndSelect(region) {
      setStatus('⏳ Lendo leads da etapa no Kommo...');
      getLead(function (err, lead) {
        if (err) { setStatus('<span style="color:#f44336">✗ ' + err.message + '</span>'); return; }
        if (!pipelineAllowed(lead.pipeline_id)) { pipelineBlocked(); return; }

        fetchAllLeadsInStage(lead.pipeline_id, lead.status_id, function (kommoLeads) {
          if (!kommoLeads.length) {
            setStatus('<span style="color:#999">Nenhum lead nesta etapa</span>');
            return;
          }

          // 1. Telefones dos contatos (em lote).
          fetchContactsByIds(kommoLeads.map(mainContactId), function (contactMap) {
            // 2. Monta payloads e filtra pela região do lead (campo Região).
            var wantRegion = region ? norm(region) : '';
            var records = [];
            var byId = {};
            kommoLeads.forEach(function (l) {
              var rec = buildLeadRecord(l, lead.pipeline_id, lead.status_id, contactMap);
              // compara por NÚCLEO da região (tolera "Região Sul" no campo vs "Sul")
              if (!wantRegion || regionCore(rec.internalOrderNotes) === wantRegion) {
                records.push(rec);
                byId[rec.kommoLeadId] = rec;
              }
            });
            if (!records.length) {
              setStatus('<span style="color:#999">Nenhum lead' + (region ? ' na região ' + region : '') + ' nesta etapa</span>');
              return;
            }

            // 3. Valida (em chunks) e abre o seletor.
            validateLeadsInChunks(records, function (validated) {
              validated.forEach(function (ml) {
                var rec = byId[String(ml.kommoLeadId)];
                if (rec && rec.internalOrderNotes) ml.regiao = rec.internalOrderNotes; // região do campo
              });
              var title = region ? ('🗺️ Lote — ' + region) : '📦 Gerar Lote';
              showLeadSelection(title, validated, function (ids) { doBatchSelected(ids, byId); });
            });
          });
        }, function (xhr) {
          setStatus('<span style="color:#f44336">✗ Erro ao ler leads do Kommo (HTTP ' + xhr.status + ')</span>');
        });
      });
    }

    // Gera etiqueta dos leads selecionados, em chunks (seguro p/ timeout e estoque).
    function doBatchSelected(ids, recordsById) {
      var payloads = ids.map(function (id) { return recordsById[String(id)]; }).filter(Boolean);
      if (!payloads.length) return;
      var CH = 40, idx = 0, gen = 0, inc = 0, ded = 0;

      function summary(prefix, extra) {
        setStatus(
          prefix +
          '<br><small>' + gen + ' etiqueta(s)</small>' +
          (inc > 0 ? '<br><small style="color:#FF9800">' + inc + ' incompletos</small>' : '') +
          (ded > 0 ? '<br><small>📦 ' + ded + ' convites deduzidos</small>' : '') +
          (extra || '')
        );
        refreshStock();
      }

      (function next() {
        if (idx >= payloads.length) {
          summary('<span style="color:#4CAF50;font-weight:bold">✓ Lote processado!</span>');
          return;
        }
        var chunk = payloads.slice(idx, idx + CH); idx += chunk.length;
        setStatus('⏳ Gerando ' + Math.min(idx, payloads.length) + '/' + payloads.length + '...');
        $.ajax({
          url: apiBase() + '/api/kommo/requests-batch-direct',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({ secret: cfg().api_key, deductStock: true, leads: chunk }),
          success: function (data) {
            gen += (data.generated || 0); inc += (data.incomplete || 0); ded += (data.stockDeducted || 0);
            next();
          },
          error: function (xhr) {
            var motivo;
            try {
              var d = JSON.parse(xhr.responseText);
              motivo = d.error === 'insufficient_stock'
                ? 'estoque acabou (disponível: ' + d.available + ')'
                : (d.message || d.error || 'HTTP ' + xhr.status);
            } catch (e) { motivo = 'HTTP ' + xhr.status; }
            summary('<span style="color:#FF9800;font-weight:bold">⚠ Parou no meio do lote</span>',
              '<br><small style="color:#f44336">' + motivo + '</small>');
          }
        });
      })();
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
              try {
                console.log('[GE] PATCH Região → field', field.id, 'type', field.type,
                  'values', JSON.stringify(values));
              } catch (e) {}

              $.ajax({
                url: '/api/v4/leads/' + lead.id,
                method: 'PATCH',
                contentType: 'application/json',
                dataType: 'json',
                data: JSON.stringify({
                  custom_fields_values: [{ field_id: field.id, values: values }]
                }),
                success: function () {
                  // Kommo pode responder 200 sem aplicar o campo (tipo divergente,
                  // opção inexistente no dropdown ou campo trocado). Relê o lead e
                  // confirma o valor antes de mostrar "✓".
                  $.ajax({
                    url: '/api/v4/leads/' + lead.id,
                    method: 'GET',
                    dataType: 'json',
                    success: function (fresh) {
                      var saved = extractField(
                        normalizeLead(fresh, lead.id).fields, ['Região', 'Regiao']);
                      var ok = norm(saved) === norm(res.regiao);
                      try {
                        console.log('[GE] read-back Região =', JSON.stringify(saved),
                          '| esperado', res.regiao, '| ok', ok);
                      } catch (e) {}
                      if (!ok) {
                        setStatus(
                          '<span style="color:#FF9800;font-weight:bold">⚠ Kommo aceitou mas não gravou</span><br>' +
                          '<small>Esperado "' + res.regiao + '", campo lê "' + (saved || '—') + '".<br>' +
                          'Veja o console [GE] (tipo/opções do campo Região).</small>'
                        );
                        return;
                      }
                      var aviso = res.confidence === 'media'
                        ? '<br><small style="color:#999">via ' + res.method + '</small>'
                        : '';
                      setStatus(
                        '<span style="color:#4CAF50;font-weight:bold">✓ Região: ' + res.regiao + '</span>' + aviso +
                        '<br><small style="color:#999">Reabra/atualize o card se o campo não mudar.</small>'
                      );
                      // best-effort: recarrega o card aberto sem F5 manual
                      try {
                        var card = APP.data && APP.data.current_card;
                        if (card && typeof card.fetch === 'function') card.fetch();
                      } catch (e) {}
                    },
                    error: function () {
                      setStatus(
                        '<span style="color:#4CAF50;font-weight:bold">✓ Região: ' + res.regiao + '</span>' +
                        '<br><small style="color:#999">(não consegui reler p/ confirmar — atualize o card)</small>'
                      );
                    }
                  });
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

    /* ── Definir Região em LOTE ──────────────────────────────────────────── */

    // Monta o resumo final do lote (gravados, falhas e a lista de pendências
    // que o operador precisa resolver na mão).
    // Gera um CSV (com BOM p/ Excel abrir acentos) e dispara o download no navegador.
    function downloadCsv(filename, header, rows) {
      function esc(v) {
        var s = String(v == null ? '' : v);
        return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }
      var lines = [header.map(esc).join(';')];
      rows.forEach(function (r) { lines.push(r.map(esc).join(';')); });
      var csv = '﻿' + lines.join('\r\n'); // BOM + CRLF
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    }

    // Guarda a última lista manual p/ o botão de CSV.
    var _lastManual = [];
    function exportManualCsv() {
      if (!_lastManual.length) return;
      var sub = '';
      try { sub = self.system().subdomain; } catch (e) {}
      var header = ['Lead ID', 'Nome', 'Bairro', 'Endereço (Rua/Avenida)', 'Sugestão região', 'Motivo', 'Link Kommo'];
      var rows = _lastManual.map(function (m) {
        var link = sub ? ('https://' + sub + '.kommo.com/leads/detail/' + m.id) : '';
        // endereço cru numa célula só (troca quebras de linha por " | " p/ ler no Excel)
        var end = String(m.endereco || '').replace(/[\r\n]+/g, ' | ').trim();
        return [m.id, m.name || '', m.bairro || '', end, m.sugestao || '', m.motivo || '', link];
      });
      downloadCsv('leads-sem-regiao.csv', header, rows);
    }

    function renderRegionBatchSummary(ok, fail, manual, skipped) {
      _lastManual = manual || [];
      var html = '<span style="color:#4CAF50;font-weight:bold">✓ ' + ok +
        ' região(ões) gravada(s)</span>';
      if (skipped) {
        html += '<br><small style="color:#999">↷ ' + skipped + ' já tinham região (pulados)</small>';
      }
      if (fail) {
        html += '<br><span style="color:#f44336">✗ ' + fail + ' falha(s) ao gravar</span>';
      }
      if (manual.length) {
        var items = manual.map(function (m) {
          return '<li style="margin:2px 0">' + m.name +
            ' <small style="color:#999">(' + m.motivo + ')</small></li>';
        }).join('');
        html += '<br><span style="color:#FF9800;font-weight:bold">⚠ ' + manual.length +
          ' p/ revisar manual:</span> ' +
          '<button id="ge-csv-manual" style="padding:2px 8px;background:#607D8B;color:#fff;border:none;' +
          'border-radius:4px;font-size:11px;font-weight:700;cursor:pointer">⬇️ CSV</button>' +
          '<ul style="margin:4px 0 0 16px;padding:0;max-height:140px;overflow:auto">' +
          items + '</ul>';
        try { console.log('[GE] região em lote — pendências manuais:', manual); } catch (e) {}
      } else {
        html += '<br><small style="color:#999">Nenhum lead pendente 🎉</small>';
      }
      setStatus(html);
    }

    // Busca TODOS os leads de uma etapa direto do Kommo (paginado, via sessão).
    // NÃO depende do banco local (que só guarda leads já etiquetados).
    function fetchAllLeadsInStage(pipelineId, statusId, onDone, onError) {
      var all = [];
      function page(p) {
        var url = '/api/v4/leads'
          + '?filter[statuses][0][pipeline_id]=' + encodeURIComponent(pipelineId)
          + '&filter[statuses][0][status_id]=' + encodeURIComponent(statusId)
          + '&with=contacts&limit=250&page=' + p;
        $.ajax({
          url: url,
          method: 'GET',
          dataType: 'json',
          success: function (data) {
            var leads = (data && data._embedded && data._embedded.leads) || [];
            if (p === 1 && leads.length) {
              try {
                var f0 = leads[0];
                console.log('[GE] amostra do 1º lead — campos:', (f0.custom_fields_values || []).length,
                  '| contatos:', ((f0._embedded && f0._embedded.contacts) || []).length);
              } catch (e) {}
            }
            all = all.concat(leads);
            setStatus('⏳ Lendo leads do Kommo... (' + all.length + ')');
            var hasNext = !!(data && data._links && data._links.next);
            if (hasNext && leads.length) { page(p + 1); }
            else { onDone(all); }
          },
          error: function (xhr) { onError(xhr); }
        });
      }
      page(1);
    }

    // Resolve + grava a região de todos os leads da ETAPA ATUAL, lidos direto do
    // Kommo (não só os já etiquetados). Bairros sem região, de baixa confiança
    // (divisa) ou sem opção no dropdown ficam de fora p/ revisão manual.
    function doSetRegionBatch(onlyEmpty) {
      setStatus('⏳ Lendo leads da etapa no Kommo...');

      getLead(function (err, lead) {
        if (err) { setStatus('<span style="color:#f44336">✗ ' + err.message + '</span>'); return; }
        if (!pipelineAllowed(lead.pipeline_id)) { pipelineBlocked(); return; }

        // 1. Busca TODOS os leads da etapa direto do Kommo (paginado).
        fetchAllLeadsInStage(lead.pipeline_id, lead.status_id, function (kommoLeads) {
          if (!kommoLeads.length) {
            setStatus('<span style="color:#999">Nenhum lead nesta etapa</span>');
            return;
          }

          // 2. Descobre o campo Região (tipo + opções) uma vez só.
          getRegiaoField(function (field) {
            if (!field) {
              setStatus('<span style="color:#f44336">✗ Campo "Região" não encontrado no Kommo</span>');
              return;
            }

            // 3. Extrai bairro/CEP de cada lead p/ resolver no backend em 1 chamada.
            //    Modo "onlyEmpty" (fallback): pula quem já tem região gravada.
            var meta = {};
            var items = [];
            var skipped = 0; // já tinham região (só no modo onlyEmpty)
            kommoLeads.forEach(function (l) {
              var fields = l.custom_fields_values || [];
              if (onlyEmpty && extractField(fields, ['Região', 'Regiao'])) { skipped++; return; }
              var info = {
                id: String(l.id),
                name: l.name || ('Lead ' + l.id),
                bairro: extractField(fields, ['Bairro']),
                cep: extractField(fields, ['CEP', 'Cep']),
                // bloco de endereço (fallback p/ leads agrupados Origem/Destino,
                // onde o Bairro separado vem vazio) — backend parseia o Destino.
                endereco: extractField(fields, ['Rua/Avenida', 'Endereco', 'Endereço', 'Logradouro', 'Rua'])
              };
              meta[info.id] = info;
              items.push({ id: info.id, bairro: info.bairro, cep: info.cep, endereco: info.endereco });
            });

            if (!items.length) {
              setStatus('<span style="color:#999">' +
                (onlyEmpty ? 'Todos os ' + skipped + ' leads desta etapa já têm região 🎉' : 'Nenhum lead nesta etapa') +
                '</span>');
              return;
            }

            setStatus('⏳ Resolvendo ' + items.length + ' região(ões)' +
              (skipped ? ' (' + skipped + ' já tinham, pulados)' : '') + '...');
            $.ajax({
              url: apiBase() + '/api/region/resolve-batch',
              method: 'POST',
              contentType: 'application/json',
              data: JSON.stringify({ secret: cfg().api_key, items: items }),
              success: function (resp) {
                var results = (resp && resp.results) || [];

                // 4. Particiona: graváveis x manuais.
                var toWrite = [];
                var manual = [];
                results.forEach(function (r) {
                  var info = meta[String(r.id)] || { name: 'Lead ' + r.id, bairro: '' };
                  if (!r.regiao) {
                    manual.push({ id: r.id, name: info.name, bairro: info.bairro || '', endereco: info.endereco || '', sugestao: '',
                      motivo: 'sem região — bairro "' + (info.bairro || '—') + '"' });
                  } else if (r.confidence === 'baixa') {
                    manual.push({ id: r.id, name: info.name, bairro: info.bairro || '', endereco: info.endereco || '', sugestao: r.regiao,
                      motivo: 'divisa/incerto → sugestão ' + r.regiao });
                  } else {
                    var values = buildRegionValues(field, r.regiao);
                    if (!values) {
                      manual.push({ id: r.id, name: info.name, bairro: info.bairro || '', endereco: info.endereco || '', sugestao: r.regiao,
                        motivo: 'sem opção "' + r.regiao + '" no dropdown' });
                    } else {
                      toWrite.push({ id: Number(r.id) || r.id,
                        custom_fields_values: [{ field_id: field.id, values: values }] });
                    }
                  }
                });

                if (!toWrite.length) {
                  renderRegionBatchSummary(0, 0, manual, skipped);
                  return;
                }

                // 5. Grava em LOTE: PATCH /api/v4/leads com array (<=50/req), em
                //    chunks sequenciais (respeita o rate limit do Kommo).
                var CHUNK = 50, ok = 0, fail = 0, idx = 0, total = toWrite.length;
                (function nextChunk() {
                  if (idx >= total) { renderRegionBatchSummary(ok, fail, manual, skipped); return; }
                  var chunk = toWrite.slice(idx, idx + CHUNK);
                  idx += chunk.length;
                  setStatus('⏳ Gravando ' + Math.min(idx, total) + '/' + total + '...');
                  $.ajax({
                    url: '/api/v4/leads',
                    method: 'PATCH',
                    contentType: 'application/json',
                    dataType: 'json',
                    data: JSON.stringify(chunk),
                    success: function () { ok += chunk.length; nextChunk(); },
                    error: function (xhr) {
                      fail += chunk.length;
                      chunk.forEach(function (c) {
                        var mi = meta[String(c.id)] || { name: 'Lead ' + c.id, bairro: '' };
                        manual.push({ id: c.id, name: mi.name, bairro: mi.bairro || '', endereco: mi.endereco || '', sugestao: '',
                          motivo: 'falha no lote (HTTP ' + xhr.status + ')' });
                      });
                      nextChunk();
                    }
                  });
                })();
              },
              error: function (xhr) { batchError(xhr, 'Erro ao resolver regiões'); }
            });
          });
        }, function (xhr) {
          setStatus('<span style="color:#f44336">✗ Erro ao ler leads do Kommo (HTTP ' + xhr.status + ')</span>');
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
              '<button id="ge-btn-setregion-batch" style="width:100%;margin-top:6px;padding:8px 4px;background:#3F51B5;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer">🧭 Definir Região (Lote)</button>' +
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
          .on('click.ge', '#ge-btn-setregion-batch', function () {
            showSetRegionBatchChoice();
          })
          .on('click.ge', '.ge-setregion-mode', function () {
            var mode = String($(this).attr('data-mode'));
            $('#ge-modal').css('display', 'none');
            doSetRegionBatch(mode === 'empty');
          })
          .on('click.ge', '#ge-csv-manual', function () {
            exportManualCsv();
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
