# PCM System — Ordens de Serviço

Sistema de Planejamento e Controle de Manutenção.  
Idealizado e desenvolvido por Marcos Moura.

---

## Estrutura do projeto

```
pcm-system/
├── assets/
│   ├── css/
│   │   └── styles.css
│   └── img/
│       ├── operador.ico
│       └── pcm.ico
├── config/
│   ├── config.js          ← NÃO versionar (.gitignore)
│   └── config.example.js  ← modelo, versionar este
├── db/
│   └── schema.sql         ← estrutura do banco Supabase
├── js/
│   ├── utils.js           ← helpers gerais (datas, escape, etc.)
│   └── db.js              ← camada de acesso ao banco
├── pages/
│   ├── operador.html      ← visão do operador
│   └── pcm.html           ← visão do PCM (gestão completa)
├── .gitignore
├── CHANGELOG.md
└── README.md
```

---

## Configuração

1. Copie `config/config.example.js` para `config/config.js`
2. Preencha com as credenciais do Supabase
3. **Nunca envie `config.js` para o repositório**

---

## Banco de dados

O arquivo `db/schema.sql` contém a estrutura completa do banco.  
Execute no Supabase SQL Editor para criar as tabelas e políticas.

---

## Acesso

| Perfil   | Arquivo (uso local)  | URL (GitHub Pages)         |
|----------|----------------------|----------------------------|
| Operador | `operador.html`      | `/operador.html`           |
| PCM      | `pcm.html`           | `/pcm.html`                |

> Os HTMLs ficam na raiz do projeto para funcionar via `file://` durante o desenvolvimento.
> A pasta `pages/` mantém cópias com caminhos ajustados para quando houver um servidor.

---

## Ativar / Desativar cadastros

Itens de **Local**, **Equipamento**, **Componente** e **Operador** podem ser desativados sem excluir histórico:

1. Acesse a aba **Cadastros** no PCM
2. Pesquise o item desejado
3. Clique em **⛔ Desativar** (ou **✅ Ativar** para reativar)

| Comportamento         | Detalhe |
|-----------------------|---------|
| Dropdowns             | Itens inativos **não aparecem** nas caixas de seleção |
| Histórico de O.S.     | **Preservado** — nenhum dado é excluído |
| Relatório de Cadastros | Inclui coluna `ativo` (SIM/NÃO) para rastreabilidade |
| Backup                | O objeto `inactive` é exportado e importado junto com os dados |

---

## Roadmap

- [ ] Migração para servidor corporativo
- [ ] Login com autenticação real (JWT)
- [ ] Controle de acesso por perfil
- [ ] Troca do banco de dados
