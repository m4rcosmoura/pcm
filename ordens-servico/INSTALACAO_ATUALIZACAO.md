# Atualização de estabilidade — instruções

Esta versão reduz o volume de dados transferido, impede sincronizações sobrepostas e mantém uma cópia local para contingência.

## 1. Atualizar o Google Apps Script

1. Abra a planilha usada pelo sistema.
2. Acesse **Extensões → Apps Script**.
3. Abra o arquivo `Code.gs`.
4. Faça uma cópia do código atual antes de alterar.
5. Apague o conteúdo atual e cole o conteúdo de `apps-script/Code.gs` deste pacote.
6. Clique em **Salvar**.
7. Acesse **Implantar → Gerenciar implantações**.
8. Clique no lápis da implantação existente.
9. Em **Versão**, selecione **Nova versão**.
10. Clique em **Implantar**.
11. Mantenha a mesma URL terminada em `/exec`. Não crie outra implantação sem necessidade.

Configuração recomendada da implantação:
- Executar como: **você/proprietário**.
- Quem pode acessar: a mesma opção já utilizada pelo sistema.

## 2. Atualizar os arquivos do site

Substitua no seu site/repositório:

- `js/db.js`
- `pcm.html`
- `operador.html`
- `pages/pcm.html`
- `pages/operador.html`

O ZIP completo já contém todos eles nas posições corretas.

Não substitua `config/config.js` por um arquivo vazio. Ele contém a URL do Apps Script usada pelo sistema.

## 3. Publicar

Se usa GitHub Pages:

1. Envie os arquivos alterados para o mesmo repositório.
2. Aguarde a publicação do GitHub Pages.
3. Abra o sistema.
4. Pressione **Ctrl + F5** para ignorar arquivos antigos do navegador.

Se abre os HTMLs diretamente no computador:

1. Extraia o ZIP completo.
2. Abra `operador.html` ou `pcm.html` da nova pasta.
3. Não misture arquivos novos com cópias antigas em outras pastas.

## 4. Teste mínimo

1. Abra o sistema em dois computadores ou duas abas.
2. Crie uma OS na primeira.
3. Verifique se a segunda atualiza em até 30 segundos.
4. Edite e finalize uma OS.
5. Recarregue a página algumas vezes.
6. Desconecte a internet e recarregue: depois de ao menos um acesso bem-sucedido, o sistema deve exibir a última cópia local com aviso de contingência.

## 5. Como confirmar que a versão nova está ativa

Abra no navegador a URL do Apps Script acrescentando:

`?action=getVersion`

A resposta correta será semelhante a:

`{"ok":true,"data":"1754330000000"}`

Se aparecer “Ação GET desconhecida: getVersion”, a implantação ainda está usando o código antigo. Volte ao Apps Script e publique uma **nova versão** da implantação.

## Mudanças aplicadas

- Polling consulta apenas uma pequena versão antes de baixar todos os dados.
- Sincronizações sobrepostas são agrupadas; a fila não cresce indefinidamente.
- Cache do Apps Script passou de 45 para 600 segundos e continua sendo invalidado nas escritas.
- Apenas uma execução reconstrói o cache por vez.
- Criação de OS mantém contador e inserção no mesmo bloqueio.
- `getOrder` e `getMeta` enviam o ID corretamente.
- Última carga válida fica salva no navegador para contingência.
