-- Fase 4 — proteção append-only pro role de runtime da API.
--
-- historico_status_contrato e auditoria_contratos são trilhas de auditoria:
-- a API só deve INSERIR (a cada mudança) e LER nelas, nunca alterar ou
-- apagar um registro já gravado — senão a trilha deixa de ser confiável
-- (alguém poderia "corrigir a história"). Ver ARCHITECTURE.md seção 4.
--
-- IMPORTANTE: o role app_runtime, na migration add_row_level_security
-- (Fase 1), recebeu `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN
-- SCHEMA public` — um grant em massa que, sem querer, incluiu UPDATE/DELETE
-- nessas duas tabelas também. Este REVOKE não é só postura defensiva: ele
-- remove um privilégio que hoje EXISTE de verdade e não deveria. Explícito
-- é melhor que implícito — mesmo espírito do FORCE ROW LEVEL SECURITY da
-- migration add_row_level_security: não confiar que "provavelmente ninguém
-- vai chamar UPDATE nessas tabelas", garantir que o Postgres recuse.
REVOKE UPDATE, DELETE ON "historico_status_contrato" FROM app_runtime;
REVOKE UPDATE, DELETE ON "auditoria_contratos" FROM app_runtime;
