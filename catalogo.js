async function carregarCatalogo() {
  try {
    const [produtos, config] = await Promise.all([
      apiCall('getCatalogo'),
      apiCall('getConfigVendedor')
    ]);

    if (config && config.nome_marca) {
      document.getElementById('nome-marca').textContent = config.nome_marca;
      document.title = config.nome_marca + ' — Catálogo';
    }

    const grade = document.getElementById('grade-produtos');
    grade.innerHTML = '';

    if (!produtos.length) {
      document.getElementById('aviso-vazio').style.display = 'block';
      return;
    }

    produtos.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'cartao produto-card';
      card.innerHTML = `
        <img src="${p.foto_url || ''}" alt="${p.nome_produto}" onerror="this.style.opacity=0">
        <div class="categoria">${p.categoria || ''}</div>
        <div class="nome">${p.nome_produto}</div>
        <div class="preco">${formatarMoedaLocal(p.preco_venda)} / ${p.unidade_venda || 'un'}</div>
      `;
      grade.appendChild(card);
    });
  } catch (err) {
    document.getElementById('aviso-vazio').textContent = 'Não foi possível carregar o catálogo agora: ' + err.message;
    document.getElementById('aviso-vazio').style.display = 'block';
  }
}

function formatarMoedaLocal(valor) {
  return 'R$ ' + Number(valor || 0).toFixed(2).replace('.', ',');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW falhou:', e));
}

carregarCatalogo();
