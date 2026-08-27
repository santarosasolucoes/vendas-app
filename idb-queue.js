// Fila de sincronização offline. Quando uma ação de escrita (criar pedido, confirmar
// pedido, marcar como pago...) falha por falta de conexão, ela é guardada aqui e
// reenviada automaticamente assim que o navegador detectar que voltou a internet.
// O celular NUNCA é a fonte da verdade — isso é só um buffer temporário até sincronizar
// com a planilha na nuvem.
const VENDAS_DB_NAME = 'vendas_offline';
const VENDAS_STORE = 'fila_acoes';

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VENDAS_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(VENDAS_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enfileirarAcaoOffline(action, payload) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VENDAS_STORE, 'readwrite');
    tx.objectStore(VENDAS_STORE).add({ action, payload, criadoEm: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listarFilaOffline() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VENDAS_STORE, 'readonly');
    const req = tx.objectStore(VENDAS_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function removerDaFilaOffline(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VENDAS_STORE, 'readwrite');
    tx.objectStore(VENDAS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Reenvia a fila em ordem, uma ação de cada vez. Para no primeiro erro real (não de
// rede) pra não perder a ordem cronológica dos pedidos/vendas.
async function sincronizarFilaOffline() {
  const fila = await listarFilaOffline();
  for (const item of fila) {
    try {
      await apiCallDireto(item.action, item.payload);
      await removerDaFilaOffline(item.id);
      document.dispatchEvent(new CustomEvent('vendas:sincronizado', { detail: item }));
    } catch (err) {
      console.warn('Falha ao sincronizar ação pendente, tentando de novo mais tarde:', item, err);
      break;
    }
  }
}

window.addEventListener('online', sincronizarFilaOffline);
