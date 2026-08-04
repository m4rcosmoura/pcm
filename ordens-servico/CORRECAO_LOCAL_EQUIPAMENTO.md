# Correção dos campos Local e Equipamento

## Sintoma
No formulário **Nova Ordem de Serviço**, os rótulos "Local" e "Equipamento" apareciam, mas as caixas de seleção ficavam em branco.

## Causa
Essas mesmas chaves de dropdown aparecem em mais de um modal da página. A função `renderDropdown` usava `document.querySelector`, que atualiza apenas a primeira ocorrência encontrada. A primeira ocorrência ficava no modal de finalização, oculto naquele momento.

## Correção
A função agora usa `document.querySelectorAll` e renderiza todas as ocorrências da mesma chave. A restauração de foco da pesquisa também foi ajustada para permanecer no dropdown que o usuário está utilizando.

## Arquivos alterados
- `pcm.html`
- `operador.html`
- `pages/pcm.html`
- `pages/operador.html`

O Apps Script e a planilha não precisam ser alterados para esta correção.
