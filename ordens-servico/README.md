# PCM — Ordens de Serviço

Sistema de Planejamento e Controle de Manutenção com frontend em HTML/JavaScript e banco no Google Planilhas por meio do Google Apps Script.

## Comece por aqui

Leia **`INSTALACAO_ATUALIZACAO.md`**. A atualização possui duas partes obrigatórias:

1. publicar o novo `apps-script/Code.gs` na implantação existente;
2. substituir os arquivos do site.

## Estrutura

```text
ordens-servico/
├── apps-script/
│   └── Code.gs
├── assets/
├── config/
│   ├── config.js
│   └── config.example.js
├── js/
│   ├── db.js
│   └── utils.js
├── pages/
│   ├── operador.html
│   └── pcm.html
├── operador.html
├── pcm.html
├── INSTALACAO_ATUALIZACAO.md
└── CHANGELOG.md
```

## Arquivos de acesso

- `operador.html`: tela operacional.
- `pcm.html`: tela de gestão PCM.
- A pasta `pages/` contém versões com caminhos relativos para uso em servidor.

## Configuração

O arquivo `config/config.js` deve conter:

- `GS_URL`: URL `/exec` da implantação do Apps Script;
- `PCM_PASSWORD`: trava organizacional da tela PCM.

A senha no JavaScript não é segurança real. Qualquer segredo colocado no frontend pode ser lido pelo navegador.

## Principais melhorias desta versão

- consulta leve de versão antes de baixar o banco completo;
- bloqueio de sincronizações automáticas sobrepostas;
- cache local de contingência;
- cache do Apps Script protegido contra reconstrução simultânea;
- correção das consultas individuais de OS e metadados;
- criação de OS com contador e inserção dentro do mesmo bloqueio.
