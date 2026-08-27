let PRODUTOS_CACHE = [];
let CLIENTES_CACHE = [];
let FORNECEDORES_CACHE = [];
let CARRINHO = []; // [{id_produto, nome_produto, quantidade, preco_venda}]
let CARRINHO_COMPRA = []; // [{id_produto, nome_produto, quantidade, custo_unitario}]

function formatarMoedaLocal(valor) {
  return 'R$ ' + Number(valor || 0).toFixed(2).replace('.', ',');
}

// --- compartilhar o link do catálogo ---
document.getElementById('btn-compartilhar-catalogo').addEventListener('click', async () => {
  const urlCatalogo = new URL('catalogo.html', location.href).href;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Catálogo Empório RD',
        text: 'Confira nosso catálogo, com preços sempre atualizados:',
        url: urlCatalogo
      });
    } catch (err) {
      // usuário cancelou o compartilhamento — não é erro, não faz nada
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(urlCatalogo);
    alert('Link do catálogo copiado! Já pode colar e enviar pelo WhatsApp.');
  } catch (err) {
    prompt('Copie o link do catálogo abaixo:', urlCatalogo);
  }
});

// --- navegação entre abas ---
document.querySelectorAll('nav.abas button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav.abas button').forEach((b) => b.classList.remove('ativa'));
    btn.classList.add('ativa');
    ['pedido', 'pedidos', 'vendas', 'compras', 'cadastros'].forEach((aba) => {
      document.getElementById('aba-' + aba).style.display = aba === btn.dataset.aba ? 'block' : 'none';
    });
    if (btn.dataset.aba === 'pedidos') carregarPedidos();
    if (btn.dataset.aba === 'vendas') carregarVendas();
    if (btn.dataset.aba === 'compras') carregarDadosCompra();
    if (btn.dataset.aba === 'cadastros') carregarCadastros();
  });
});

// --- indicador de offline ---
function atualizarAvisoOffline() {
  document.getElementById('aviso-offline').classList.toggle('ativo', !navigator.onLine);
}
window.addEventListener('online', atualizarAvisoOffline);
window.addEventListener('offline', atualizarAvisoOffline);
document.addEventListener('vendas:sincronizado', () => {
  atualizarAvisoOffline();
});

// =====================================================
// NOVO PEDIDO
// =====================================================
async function carregarDadosPedido() {
  [PRODUTOS_CACHE, CLIENTES_CACHE] = await Promise.all([
    apiCall('listProdutos'),
    apiCall('listClientes')
  ]);

  const selectCliente = document.getElementById('select-cliente');
  selectCliente.innerHTML = CLIENTES_CACHE.map((c) => `<option value="${c.id_cliente}">${c.nome_cliente}</option>`).join('');

  const selectProduto = document.getElementById('select-produto');
  selectProduto.innerHTML = PRODUTOS_CACHE
    .filter((p) => Number(p.qtd_estoque) > 0)
    .map((p) => `<option value="${p.id_produto}">${p.nome_produto} (${formatarMoedaLocal(p.preco_venda)})</option>`)
    .join('');
}

document.getElementById('btn-add-item').addEventListener('click', () => {
  const idProduto = document.getElementById('select-produto').value;
  const quantidade = Number(document.getElementById('input-quantidade').value) || 1;
  const produto = PRODUTOS_CACHE.find((p) => p.id_produto === idProduto);
  if (!produto) return;

  const existente = CARRINHO.find((i) => i.id_produto === idProduto);
  if (existente) existente.quantidade += quantidade;
  else CARRINHO.push({ id_produto: idProduto, nome_produto: produto.nome_produto, quantidade, preco_venda: Number(produto.preco_venda) });

  renderCarrinho();
});

function renderCarrinho() {
  const lista = document.getElementById('lista-carrinho');
  lista.innerHTML = CARRINHO.map((i, idx) => `
    <div class="linha-item">
      <span>${i.nome_produto} x${i.quantidade}</span>
      <span>${formatarMoedaLocal(i.preco_venda * i.quantidade)} <a href="#" data-idx="${idx}" class="remover-item" style="color:#B23A3A;margin-left:8px;">remover</a></span>
    </div>
  `).join('');

  document.querySelectorAll('.remover-item').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      CARRINHO.splice(Number(a.dataset.idx), 1);
      renderCarrinho();
    });
  });

  const total = CARRINHO.reduce((soma, i) => soma + i.preco_venda * i.quantidade, 0);
  document.getElementById('total-carrinho').textContent = 'Total: ' + formatarMoedaLocal(total);
}

document.getElementById('btn-criar-pedido').addEventListener('click', async () => {
  const idCliente = document.getElementById('select-cliente').value;
  if (!idCliente) return alert('Selecione um cliente.');
  if (!CARRINHO.length) return alert('Adicione pelo menos um item ao pedido.');

  const payload = {
    id_cliente: idCliente,
    itens: CARRINHO.map((i) => ({ id_produto: i.id_produto, quantidade: i.quantidade }))
  };

  const pedido = await apiCall('criarPedido', payload);

  if (pedido._offline) {
    alert('Sem conexão: o pedido foi salvo localmente e será criado assim que a internet voltar. A mensagem de confirmação não pode ser gerada agora.');
    CARRINHO = [];
    renderCarrinho();
    return;
  }

  const resultadoTexto = await apiCall('gerarTextoConfirmacaoPedido', { id_pedido: pedido.id_pedido });
  document.getElementById('resultado-pedido').style.display = 'block';
  document.getElementById('texto-confirmacao').value = resultadoTexto.texto;
  document.getElementById('btn-abrir-whatsapp-confirmacao').onclick = () => window.open(resultadoTexto.link, '_blank');

  CARRINHO = [];
  renderCarrinho();
  carregarDadosPedido();
});

// =====================================================
// PEDIDOS AGUARDANDO CONFIRMAÇÃO
// =====================================================
async function carregarPedidos() {
  const pedidos = await apiCall('listPedidos', { status: 'Aguardando confirmação' });
  const lista = document.getElementById('lista-pedidos');

  if (!pedidos.length) {
    lista.innerHTML = '<div class="cartao">Nenhum pedido aguardando confirmação.</div>';
    return;
  }

  lista.innerHTML = pedidos.map((p) => `
    <div class="cartao">
      <span class="badge aguardando">Aguardando confirmação</span>
      <p><strong>Cliente:</strong> ${nomeClienteLocal(p.id_cliente)}</p>
      <p><strong>Total:</strong> ${formatarMoedaLocal(p.valor_total_estimado)}</p>
      <button data-id="${p.id_pedido}" class="btn-confirmar-pedido">Confirmar pedido</button>
      <button data-id="${p.id_pedido}" class="btn-cancelar-pedido perigo">Cancelar</button>
    </div>
  `).join('');

  document.querySelectorAll('.btn-confirmar-pedido').forEach((btn) => {
    btn.addEventListener('click', () => confirmarPedidoFluxo(btn.dataset.id));
  });
  document.querySelectorAll('.btn-cancelar-pedido').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancelar este pedido?')) return;
      await apiCall('cancelarPedido', { id_pedido: btn.dataset.id });
      carregarPedidos();
    });
  });
}

async function confirmarPedidoFluxo(idPedido) {
  const jaFoiPago = confirm('O cliente já pagou (à vista)? OK = já pago, Cancelar = fica pendente/fiado.');
  const opcoes = { id_pedido: idPedido, status_pagamento: jaFoiPago ? 'Pago' : 'Pendente' };
  if (!jaFoiPago) {
    const vencimento = prompt('Data de vencimento (AAAA-MM-DD):', '');
    if (vencimento) opcoes.data_vencimento = vencimento;
  }
  const venda = await apiCall('confirmarPedido', opcoes);
  if (venda._offline) {
    alert('Sem conexão: a confirmação foi salva localmente e será processada quando a internet voltar.');
    carregarPedidos();
    return;
  }
  const notinha = await apiCall('gerarTextoNotinha', { id_venda: venda.id_venda });
  alert('Pedido confirmado! Abrindo a notinha para envio por WhatsApp.');
  window.open(notinha.link, '_blank');
  carregarPedidos();
}

function nomeClienteLocal(idCliente) {
  const c = CLIENTES_CACHE.find((c) => c.id_cliente === idCliente);
  return c ? c.nome_cliente : idCliente;
}

// =====================================================
// VENDAS / COBRANÇA
// =====================================================
async function carregarVendas() {
  const [pendentes, painel] = await Promise.all([
    apiCall('listVendas', { status_pagamento: 'Pendente' }),
    apiCall('painelLucratividade')
  ]);

  document.getElementById('painel-lucratividade').innerHTML = `
    <h3>Lucratividade</h3>
    <div class="linha-item"><span>Total vendido</span><span>${formatarMoedaLocal(painel.total_vendido)}</span></div>
    <div class="linha-item"><span>Total recebido</span><span>${formatarMoedaLocal(painel.total_recebido)}</span></div>
    <div class="linha-item"><span>Saldo a receber (fiado)</span><span>${formatarMoedaLocal(painel.saldo_a_receber)}</span></div>
  `;

  const lista = document.getElementById('lista-vendas');
  if (!pendentes.length) {
    lista.innerHTML = '<div class="cartao">Nenhuma venda pendente. 🎉</div>';
    return;
  }

  lista.innerHTML = pendentes.map((v) => `
    <div class="cartao">
      <span class="badge pendente">Pendente</span>
      <p><strong>Cliente:</strong> ${nomeClienteLocal(v.id_cliente)}</p>
      <p><strong>Valor:</strong> ${formatarMoedaLocal(v.valor_total)} — <strong>Vencimento:</strong> ${v.data_vencimento || '-'}</p>
      <button data-id="${v.id_venda}" class="btn-cobrar secundario">Gerar cobrança</button>
      <button data-id="${v.id_venda}" class="btn-marcar-pago">Marcar como pago</button>
    </div>
  `).join('');

  document.querySelectorAll('.btn-cobrar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const cobranca = await apiCall('gerarTextoCobranca', { id_venda: btn.dataset.id });
        window.open(cobranca.link, '_blank');
      } catch (err) {
        alert('Não foi possível gerar a cobrança agora (precisa de conexão): ' + err.message);
      }
    });
  });

  document.querySelectorAll('.btn-marcar-pago').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const forma = prompt('Forma de pagamento (Dinheiro, Pix, Cartão):', 'Pix');
      const venda = await apiCall('marcarVendaPaga', { id_venda: btn.dataset.id, forma_pagamento: forma });
      if (!venda._offline) {
        const agradecimento = await apiCall('gerarTextoAgradecimento', { id_venda: btn.dataset.id });
        window.open(agradecimento.link, '_blank');
      }
      carregarVendas();
    });
  });
}

// =====================================================
// COMPRAS (pedido à fábrica/fornecedor)
// =====================================================
async function carregarDadosCompra() {
  FORNECEDORES_CACHE = await apiCall('listFornecedores');

  const selectFornecedor = document.getElementById('select-fornecedor');
  selectFornecedor.innerHTML = FORNECEDORES_CACHE.map((f) => `<option value="${f.id_fornecedor}">${f.nome_fabrica}</option>`).join('');

  const selectProduto = document.getElementById('select-produto-compra');
  selectProduto.innerHTML = PRODUTOS_CACHE
    .map((p) => `<option value="${p.id_produto}">${p.nome_produto} (custo ${formatarMoedaLocal(p.preco_custo_unidade_compra)}/${p.unidade_compra || 'un'})</option>`)
    .join('');

  carregarPedidosCompra();
}

document.getElementById('btn-add-item-compra').addEventListener('click', () => {
  const idProduto = document.getElementById('select-produto-compra').value;
  const quantidade = Number(document.getElementById('input-quantidade-compra').value) || 1;
  const produto = PRODUTOS_CACHE.find((p) => p.id_produto === idProduto);
  if (!produto) return;

  const existente = CARRINHO_COMPRA.find((i) => i.id_produto === idProduto);
  if (existente) existente.quantidade += quantidade;
  else CARRINHO_COMPRA.push({ id_produto: idProduto, nome_produto: produto.nome_produto, quantidade, custo_unitario: Number(produto.preco_custo_unidade_compra) });

  renderCarrinhoCompra();
});

function renderCarrinhoCompra() {
  const lista = document.getElementById('lista-carrinho-compra');
  lista.innerHTML = CARRINHO_COMPRA.map((i, idx) => `
    <div class="linha-item">
      <span>${i.nome_produto} x${i.quantidade}</span>
      <span>${formatarMoedaLocal(i.custo_unitario * i.quantidade)} <a href="#" data-idx="${idx}" class="remover-item-compra" style="color:#B23A3A;margin-left:8px;">remover</a></span>
    </div>
  `).join('');

  document.querySelectorAll('.remover-item-compra').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      CARRINHO_COMPRA.splice(Number(a.dataset.idx), 1);
      renderCarrinhoCompra();
    });
  });

  const total = CARRINHO_COMPRA.reduce((soma, i) => soma + i.custo_unitario * i.quantidade, 0);
  document.getElementById('total-carrinho-compra').textContent = 'Total estimado: ' + formatarMoedaLocal(total);
}

document.getElementById('btn-criar-pedido-compra').addEventListener('click', async () => {
  const idFornecedor = document.getElementById('select-fornecedor').value;
  if (!idFornecedor) return alert('Selecione um fornecedor.');
  if (!CARRINHO_COMPRA.length) return alert('Adicione pelo menos um item ao pedido de compra.');

  const payload = {
    id_fornecedor: idFornecedor,
    data_retirada_prevista: document.getElementById('data-retirada-prevista').value,
    itens: CARRINHO_COMPRA.map((i) => ({ id_produto: i.id_produto, quantidade: i.quantidade, custo_unitario_estimado: i.custo_unitario }))
  };

  const pedidoCompra = await apiCall('criarPedidoCompra', payload);

  if (pedidoCompra._offline) {
    alert('Sem conexão: o pedido de compra foi salvo localmente e será criado assim que a internet voltar. A mensagem não pode ser gerada agora.');
    CARRINHO_COMPRA = [];
    renderCarrinhoCompra();
    return;
  }

  const resultadoTexto = await apiCall('gerarTextoPedidoFornecedor', { id_pedido_compra: pedidoCompra.id_pedido_compra });
  document.getElementById('resultado-pedido-compra').style.display = 'block';
  document.getElementById('texto-pedido-compra').value = resultadoTexto.texto;
  document.getElementById('btn-abrir-whatsapp-compra').onclick = () => window.open(resultadoTexto.link, '_blank');

  CARRINHO_COMPRA = [];
  renderCarrinhoCompra();
  carregarPedidosCompra();
});

async function carregarPedidosCompra() {
  const pedidos = await apiCall('listPedidosCompra', { status: 'Enviado' });
  const lista = document.getElementById('lista-pedidos-compra');

  if (!pedidos.length) {
    lista.innerHTML = '<p>Nenhum pedido de compra aguardando retirada.</p>';
    return;
  }

  lista.innerHTML = pedidos.map((p) => `
    <div class="cartao">
      <span class="badge aguardando">Enviado</span>
      <p><strong>Fornecedor:</strong> ${nomeFornecedorLocal(p.id_fornecedor)}</p>
      <p><strong>Retirada prevista:</strong> ${p.data_retirada_prevista || '-'} — <strong>Total estimado:</strong> ${formatarMoedaLocal(p.valor_total_estimado)}</p>
      <button data-id="${p.id_pedido_compra}" class="btn-receber-compra">Marcar como recebido</button>
      <button data-id="${p.id_pedido_compra}" class="btn-cancelar-compra perigo">Cancelar</button>
    </div>
  `).join('');

  document.querySelectorAll('.btn-receber-compra').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Confirma o recebimento? Isso vai repor o estoque dos produtos e atualizar o custo de compra.')) return;
      await apiCall('receberPedidoCompra', { id_pedido_compra: btn.dataset.id });
      alert('Estoque reposto!');
      carregarPedidosCompra();
      carregarDadosPedido();
    });
  });

  document.querySelectorAll('.btn-cancelar-compra').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancelar este pedido de compra?')) return;
      await apiCall('cancelarPedidoCompra', { id_pedido_compra: btn.dataset.id });
      carregarPedidosCompra();
    });
  });
}

function nomeFornecedorLocal(idFornecedor) {
  const f = FORNECEDORES_CACHE.find((f) => f.id_fornecedor === idFornecedor);
  return f ? f.nome_fabrica : idFornecedor;
}

// =====================================================
// CADASTROS
// =====================================================
function formatarDataParaInput(valor) {
  return valor ? String(valor).slice(0, 10) : '';
}

// --- Produto ---
function limparFormularioProduto() {
  document.getElementById('prod-id').value = '';
  document.getElementById('prod-nome').value = '';
  document.getElementById('prod-categoria').value = '';
  document.getElementById('prod-foto').value = '';
  document.getElementById('prod-unid-compra').value = '';
  document.getElementById('prod-custo-compra').value = '';
  document.getElementById('prod-unid-venda').value = '';
  document.getElementById('prod-fator').value = '1';
  document.getElementById('prod-preco-venda').value = '';
  document.getElementById('prod-estoque').value = '';
  document.getElementById('prod-estoque-min').value = '';
  document.getElementById('prod-validade').value = '';
  document.getElementById('titulo-form-produto').textContent = 'Novo produto';
}

function preencherFormularioProduto(p) {
  document.getElementById('prod-id').value = p.id_produto;
  document.getElementById('prod-nome').value = p.nome_produto || '';
  document.getElementById('prod-categoria').value = p.categoria || '';
  document.getElementById('prod-foto').value = p.foto_url || '';
  document.getElementById('prod-unid-compra').value = p.unidade_compra || '';
  document.getElementById('prod-custo-compra').value = p.preco_custo_unidade_compra || '';
  document.getElementById('prod-unid-venda').value = p.unidade_venda || '';
  document.getElementById('prod-fator').value = p.fator_conversao || '1';
  document.getElementById('prod-preco-venda').value = p.preco_venda || '';
  document.getElementById('prod-estoque').value = p.qtd_estoque || '';
  document.getElementById('prod-estoque-min').value = p.estoque_minimo || '';
  document.getElementById('prod-validade').value = formatarDataParaInput(p.data_validade);
  document.getElementById('titulo-form-produto').textContent = 'Editar produto';
  document.getElementById('titulo-form-produto').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderListaProdutosCadastrados() {
  const lista = document.getElementById('lista-produtos-cadastrados');
  lista.innerHTML = PRODUTOS_CACHE.length
    ? PRODUTOS_CACHE.map((p) => `
      <div class="linha-item">
        <span>${p.nome_produto} — ${formatarMoedaLocal(p.preco_venda)} (${p.qtd_estoque} em estoque)</span>
        <a href="#" data-id="${p.id_produto}" class="editar-produto" style="color:var(--cobre);">editar</a>
      </div>
    `).join('')
    : '<p>Nenhum produto cadastrado ainda.</p>';

  lista.querySelectorAll('.editar-produto').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const produto = PRODUTOS_CACHE.find((p) => p.id_produto === a.dataset.id);
      if (produto) preencherFormularioProduto(produto);
    });
  });
}

document.getElementById('btn-novo-produto').addEventListener('click', limparFormularioProduto);

document.getElementById('btn-salvar-produto').addEventListener('click', async () => {
  const dados = {
    id_produto: document.getElementById('prod-id').value || undefined,
    nome_produto: document.getElementById('prod-nome').value,
    categoria: document.getElementById('prod-categoria').value,
    foto_url: document.getElementById('prod-foto').value,
    unidade_compra: document.getElementById('prod-unid-compra').value,
    preco_custo_unidade_compra: document.getElementById('prod-custo-compra').value,
    unidade_venda: document.getElementById('prod-unid-venda').value,
    fator_conversao: document.getElementById('prod-fator').value,
    preco_venda: document.getElementById('prod-preco-venda').value,
    qtd_estoque: document.getElementById('prod-estoque').value,
    estoque_minimo: document.getElementById('prod-estoque-min').value,
    data_validade: document.getElementById('prod-validade').value
  };
  await apiCall('upsertProduto', dados);
  alert('Produto salvo!');
  limparFormularioProduto();
  carregarDadosPedido();
  carregarCadastros();
});

// --- Cliente ---
function limparFormularioCliente() {
  document.getElementById('cli-id').value = '';
  document.getElementById('cli-nome').value = '';
  document.getElementById('cli-whatsapp').value = '';
  document.getElementById('cli-endereco').value = '';
  document.getElementById('titulo-form-cliente').textContent = 'Novo cliente';
}

function preencherFormularioCliente(c) {
  document.getElementById('cli-id').value = c.id_cliente;
  document.getElementById('cli-nome').value = c.nome_cliente || '';
  document.getElementById('cli-whatsapp').value = c.telefone_whatsapp || '';
  document.getElementById('cli-endereco').value = c.endereco || '';
  document.getElementById('titulo-form-cliente').textContent = 'Editar cliente';
  document.getElementById('titulo-form-cliente').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderListaClientesCadastrados() {
  const lista = document.getElementById('lista-clientes-cadastrados');
  lista.innerHTML = CLIENTES_CACHE.length
    ? CLIENTES_CACHE.map((c) => `
      <div class="linha-item">
        <span>${c.nome_cliente} — ${c.telefone_whatsapp || 'sem WhatsApp'}</span>
        <a href="#" data-id="${c.id_cliente}" class="editar-cliente" style="color:var(--cobre);">editar</a>
      </div>
    `).join('')
    : '<p>Nenhum cliente cadastrado ainda.</p>';

  lista.querySelectorAll('.editar-cliente').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const cliente = CLIENTES_CACHE.find((c) => c.id_cliente === a.dataset.id);
      if (cliente) preencherFormularioCliente(cliente);
    });
  });
}

document.getElementById('btn-novo-cliente').addEventListener('click', limparFormularioCliente);

document.getElementById('btn-salvar-cliente').addEventListener('click', async () => {
  const dados = {
    id_cliente: document.getElementById('cli-id').value || undefined,
    nome_cliente: document.getElementById('cli-nome').value,
    telefone_whatsapp: document.getElementById('cli-whatsapp').value,
    endereco: document.getElementById('cli-endereco').value
  };
  await apiCall('upsertCliente', dados);
  alert('Cliente salvo!');
  limparFormularioCliente();
  carregarDadosPedido();
  carregarCadastros();
});

// --- Fornecedor ---
function limparFormularioFornecedor() {
  document.getElementById('forn-id').value = '';
  document.getElementById('forn-nome').value = '';
  document.getElementById('forn-whatsapp').value = '';
  document.getElementById('forn-cidade').value = '';
  document.getElementById('titulo-form-fornecedor').textContent = 'Novo fornecedor';
}

function preencherFormularioFornecedor(f) {
  document.getElementById('forn-id').value = f.id_fornecedor;
  document.getElementById('forn-nome').value = f.nome_fabrica || '';
  document.getElementById('forn-whatsapp').value = f.contato_whatsapp || '';
  document.getElementById('forn-cidade').value = f.cidade || '';
  document.getElementById('titulo-form-fornecedor').textContent = 'Editar fornecedor';
  document.getElementById('titulo-form-fornecedor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderListaFornecedoresCadastrados() {
  const lista = document.getElementById('lista-fornecedores-cadastrados');
  lista.innerHTML = FORNECEDORES_CACHE.length
    ? FORNECEDORES_CACHE.map((f) => `
      <div class="linha-item">
        <span>${f.nome_fabrica} — ${f.cidade || 'sem cidade'}</span>
        <a href="#" data-id="${f.id_fornecedor}" class="editar-fornecedor" style="color:var(--cobre);">editar</a>
      </div>
    `).join('')
    : '<p>Nenhum fornecedor cadastrado ainda.</p>';

  lista.querySelectorAll('.editar-fornecedor').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const fornecedor = FORNECEDORES_CACHE.find((f) => f.id_fornecedor === a.dataset.id);
      if (fornecedor) preencherFormularioFornecedor(fornecedor);
    });
  });
}

document.getElementById('btn-novo-fornecedor').addEventListener('click', limparFormularioFornecedor);

document.getElementById('btn-salvar-fornecedor').addEventListener('click', async () => {
  const dados = {
    id_fornecedor: document.getElementById('forn-id').value || undefined,
    nome_fabrica: document.getElementById('forn-nome').value,
    contato_whatsapp: document.getElementById('forn-whatsapp').value,
    cidade: document.getElementById('forn-cidade').value
  };
  await apiCall('upsertFornecedor', dados);
  alert('Fornecedor salvo!');
  limparFormularioFornecedor();
  carregarCadastros();
});

async function carregarEstoqueBaixo() {
  const produtos = await apiCall('listProdutosEstoqueBaixo');
  const lista = document.getElementById('lista-estoque-baixo');
  lista.innerHTML = produtos.length
    ? produtos.map((p) => `<div class="linha-item"><span>${p.nome_produto}</span><span>${p.qtd_estoque} restantes</span></div>`).join('')
    : '<p>Nenhum produto abaixo do estoque mínimo.</p>';
}

async function carregarCadastros() {
  const [produtos, clientes, fornecedores] = await Promise.all([
    apiCall('listProdutos'),
    apiCall('listClientes'),
    apiCall('listFornecedores')
  ]);
  PRODUTOS_CACHE = produtos;
  CLIENTES_CACHE = clientes;
  FORNECEDORES_CACHE = fornecedores;
  renderListaProdutosCadastrados();
  renderListaClientesCadastrados();
  renderListaFornecedoresCadastrados();
  carregarEstoqueBaixo();
}

// =====================================================
// INICIALIZAÇÃO
// =====================================================
async function init() {
  atualizarAvisoOffline();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW falhou:', e));
  }
  try {
    const config = await apiCall('getConfigVendedor');
    if (config && config.nome_marca) document.getElementById('nome-marca').textContent = config.nome_marca;
  } catch (e) { /* offline no primeiro acesso — segue sem travar */ }
  await carregarDadosPedido();
  if (navigator.onLine) sincronizarFilaOffline();
}

init();
