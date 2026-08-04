# Correção 2.0.2 — timeout em getInitialData

## Sintoma

O sistema exibia:

> Servidor temporariamente indisponível: Falha ao comunicar com o servidor na ação "getInitialData"...

## Causa corrigida

A versão 2.0.1 colocava `getInitialData_()` dentro de um `ScriptLock` com espera de até 15 segundos, enquanto o navegador encerrava cada tentativa em 20 segundos. Em concorrência, sobravam poucos segundos para ler a planilha, montar aproximadamente 700 KB de JSON e gravar dezenas de blocos no CacheService.

A versão 2.0.2:

- remove o `ScriptLock` das leituras;
- remove o cache grande dividido em blocos;
- mantém lock apenas nas gravações;
- mantém a consulta leve `getVersion`;
- lê a aba `listas` somente uma vez;
- evita três repetições do `getInitialData`;
- usa uma rota alternativa com leituras separadas caso o carregamento consolidado falhe;
- não repete gravações automaticamente, evitando OS duplicada quando a resposta do servidor se perde;
- adiciona a ação `health` para diagnóstico rápido.

## Instalação

1. Na planilha, abra **Extensões → Apps Script**.
2. Substitua todo o conteúdo do `Code.gs` pelo arquivo `apps-script/Code.gs` deste pacote.
3. Salve.
4. Abra **Implantar → Gerenciar implantações**.
5. Edite a implantação atual, selecione **Nova versão** e clique em **Implantar**.
6. Substitua `js/db.js` no site.
7. Publique o site e pressione **Ctrl + F5**.

## Teste do backend

Abra no navegador, acrescentando ao final da URL `/exec`:

- `?action=health`
- `?action=getVersion`
- `?action=getInitialData`

`health` deve responder quase imediatamente com `{"ok":true,...}`.

## Conferência no Apps Script

Abra **Execuções** e procure a execução `getInitialData` mais recente. O novo código registra no log:

- `durationMs`
- `orderCount`

Se `health` responder e `getInitialData` continuar demorando mais de 30 segundos, a lentidão está no acesso à própria planilha ou em uma execução de escrita/importação muito pesada.
