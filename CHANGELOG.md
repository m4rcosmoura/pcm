# Changelog

Todas as mudanças relevantes do projeto são registradas aqui.

---

## [Não lançado]

### Adicionado
- **Ativar / Desativar cadastros**: itens de Local, Equipamento, Componente e Operador podem ser desativados pelo painel de Cadastros sem excluir o histórico de O.S.
- Itens inativos **não aparecem** nas caixas de seleção (dropdowns) do PCM e do Operador.
- O histórico de O.S. que já usou itens inativos é integralmente **preservado**.
- Badge visual `ATIVO` / `INATIVO` na lista de resultados de pesquisa de cadastros.
- Contador de inativos exibido no resumo de cadastros.
- Relatório de Cadastros agora inclui coluna `ativo` (SIM/NÃO) para todos os itens.
- Backup (`exportBackup`) agora inclui o objeto `inactive` com as listas desativadas.
- `db.js`: novas funções `getInactiveLists`, `setInactiveLists` e `toggleInactiveItem`.
- Estrutura de pastas profissional (`assets/`, `js/`, `pages/`, `config/`, `db/`)
- `utils.js` separado com helpers gerais
- `db.js` isolado como camada de acesso ao banco
- `README.md` e `CHANGELOG.md`
- `.gitignore` com `config/config.js` protegido

### Alterado
- `db_supabase.js` renomeado para `js/db.js`
- `styles.css` movido para `assets/css/`
- Ícones movidos para `assets/img/`
- HTMLs renomeados e movidos para `pages/`
- `config.js` e `config_example.js` movidos para `config/`
- `supabase_schema.sql` renomeado e movido para `db/schema.sql`

---

## [0.1.0] — fase de testes inicial

### Adicionado
- Tela Operador: abertura, início e finalização de OS
- Tela PCM: gestão completa, cadastros, KPIs
- Integração com Supabase (REST API)
- Tema claro / escuro
- KPIs: Top 10 locais, equipamentos, operador × atendimentos, homem × hora, MTTR
- MTTR Geral formatado como `Xh YYmin`
- Card de Pendentes removido dos KPIs
