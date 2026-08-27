// Cliente da API do backend Apps Script. Ações de leitura vão por GET (assim o
// Service Worker consegue cachear pra uso offline); ações de escrita vão por POST em
// texto puro (evita o preflight CORS que o Apps Script não responde) e, se falharem
// por falta de rede, caem na fila de sincronização (idb-queue.js).
const ACOES_LEITURA = new Set([
  'getCatalogo', 'getConfigVendedor', 'listProdutos', 'listClientes', 'listFornecedores',
  'listPedidos', 'listVendas', 'listVendasPendentesVencidas', 'listProdutosEstoqueBaixo',
  'painelLucratividade', 'gerarTextoConfirmacaoPedido', 'gerarTextoNotinha',
  'gerarTextoCobranca', 'gerarTextoAgradecimento', 'gerarPixPayload',
  'listPedidosCompra', 'gerarTextoPedidoFornecedor'
]);

function apiUrl() {
  const url = window.VENDAS_CONFIG && window.VENDAS_CONFIG.API_URL;
  if (!url || url.indexOf('COLE_AQUI') === 0) {
    throw new Error('Configure a URL do Apps Script em config.js antes de usar o app.');
  }
  return url;
}

// Chamada direta à API, sem passar pela fila offline — usada tanto pelas chamadas
// normais quanto para reenviar itens da fila.
async function apiCallDireto(action, payload = {}) {
  const base = apiUrl();
  if (ACOES_LEITURA.has(action)) {
    const params = new URLSearchParams({ action, ...normalizarParams(payload) });
    const res = await fetch(`${base}?${params.toString()}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    return json.data;
  }
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

function normalizarParams(payload) {
  const out = {};
  Object.keys(payload || {}).forEach((k) => {
    if (payload[k] !== undefined && payload[k] !== null && typeof payload[k] !== 'object') {
      out[k] = payload[k];
    }
  });
  return out;
}

// Chamada usada pelas telas. Em ações de escrita, se a rede falhar, enfileira para
// sincronizar depois em vez de travar a tela.
async function apiCall(action, payload = {}) {
  try {
    return await apiCallDireto(action, payload);
  } catch (err) {
    if (!ACOES_LEITURA.has(action)) {
      await enfileirarAcaoOffline(action, payload);
      return { _offline: true };
    }
    throw err;
  }
}
