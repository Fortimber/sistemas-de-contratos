# Blueprint de Arquitetura — Reescrita do Sistema de Contratos de Exportação

> Documento de handoff técnico. Objetivo: servir de contexto inicial para uma sessão de Claude Code que vai fazer o scaffold do projeto do zero.

## 1. Contexto

Sistema atual (referência, não será reaproveitado como runtime): export do Hostinger Horizons, stack React + Vite (frontend) e PocketBase + SQLite (backend). Domínio: gestão de **contratos de exportação de madeira**, cobrindo o fluxo completo entre 5 setores — Comercial, Produção, Ambiental, Financeiro, Logística.

Decisão de escopo (confirmada): **single-tenant em produção agora, schema multi-tenant desde o dia 1**. Ou seja, existe desde já uma tabela `organizacoes` e toda tabela de negócio carrega `organizacao_id`, mesmo que hoje só exista uma organização (a sua empresa) — isolar depois, com dado real em produção, é ordens de magnitude mais arriscado do que nascer isolado.

## 2. Stack definida

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript (fullstack) | Frontend já é React/JS; reaproveita conhecimento, evita contexto duplo de linguagem |
| Backend | Node.js + Fastify | Mais leve que NestJS pra esse porte de time (1 dev), tipagem end-to-end mais direta |
| Banco | PostgreSQL | Resolve o teto de concorrência do SQLite; suporta Row-Level Security nativo — importante para isolamento multi-tenant real, não só por convenção de código |
| ORM | Prisma | Schema declarativo, migrations versionadas automaticamente, gera types TS — essencial pra você que vem de low-code, reduz superfície de erro manual em SQL |
| Frontend | React + Vite (mantido) | Já validado, sem motivo técnico pra trocar |
| Auth | JWT (access + refresh token) + bcrypt | Padrão de mercado, sem dependência de serviço externo |
| Storage de anexos | S3-compatible (mesmo provedor definido para backup) | Mesma decisão já tomada — Backblaze B2 ou Wasabi |
| Deploy | Docker Compose na VM (containers: api, web, postgres) | Consistente com a decisão de infra já tomada (VM, sem AWS) |

## 3. Estratégia de isolamento multi-tenant (preparado, não ativo)

- Toda tabela de negócio tem `organizacao_id` (FK obrigatória).
- Toda query de aplicação filtra por `organizacao_id` do usuário autenticado — feito via middleware central, nunca manual por rota (elimina o risco de "esqueci o WHERE").
- Postgres Row-Level Security (RLS) habilitado como segunda camada de proteção: mesmo que uma query da aplicação esqueça o filtro, o banco recusa a leitura de dado de outra organização. **Isso é defesa em profundidade — não confiar só na disciplina do código de aplicação.**
- Hoje: uma única linha em `organizacoes` (sua empresa), criada via seed. Não requer fluxo de onboarding de tenant ainda — isso só é construído se/quando a decisão de vender avançar.
- **Modelo de venda futura confirmado: Modelo A — instância única compartilhada** (não cópia separada por cliente). Vender para um cliente novo significa criar uma nova linha em `organizacoes`, sem deploy novo, sem VM/banco separado. Decisão tomada considerando: o RLS já construído foi pensado exatamente para isso; clientes futuros previstos são do mesmo setor (baixa chance de exigir regra de negócio muito divergente por cliente); não há equipe de infraestrutura para manter N cópias do sistema. Ver seção 12 para o desenho de integrações plugáveis por cliente dentro desse modelo.

## 4. Modelo de dados

Ver `schema.prisma` anexo — é o schema completo, pronto para `prisma migrate dev`. Resumo das entidades (nomes de campo mantidos em português, fiéis ao domínio de negócio já validado no sistema atual):

- **organizacoes** — tabela de tenant (nova, não existia no sistema original)
- **usuarios** — login, perfil_acesso (Administrador/Comercial/Operacional/Financeiro/Ambiental)
- **especies, produtos, importadores, representantes, status_contrato** — tabelas de referência
- **contratos** — entidade central (numero, importador, representante, produto, status, tipo_frete, valores, moeda, comissões, local, relação com contrato_pai para aditivos)
- **historico_status_contrato** — trilha de mudança de status (append-only)
- **auditoria_contratos** — trilha de auditoria campo-a-campo (append-only)
- **anexos_contrato** — arquivos vinculados ao contrato (PDF/imagem, com tipo_documento)
- **detalhes_producao / detalhes_ambiental / detalhes_logistica / detalhes_financeiro** — extensões 1:1 de `contratos`, uma por setor (mesma separação de responsabilidade do sistema original — cada setor só escreve na sua tabela)
- **refresh_tokens** — sessões ativas por usuário (jti do JWT, expiração, revogação). Adicionada durante a Fase 1 ao identificar que refresh token puramente stateless não permite logout real nem revogação em caso de desligamento/perda de dispositivo. Permite também listar sessões ativas por usuário.

Tabelas append-only (`historico_status_contrato`, `auditoria_contratos`) devem ter `UPDATE`/`DELETE` bloqueados a nível de permissão de banco (role da aplicação sem grant de update/delete nessas tabelas) — replica a proteção que já existia nas regras do PocketBase (`updateRule: null, deleteRule: null`).

## 5. Estrutura de repositório (monorepo)

```
/
├── apps/
│   ├── api/                  # Fastify + Prisma
│   │   ├── src/
│   │   │   ├── modules/      # um módulo por entidade (contratos, usuarios, ...)
│   │   │   ├── middleware/   # auth, tenant-scoping, audit-logger
│   │   │   └── server.ts
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── migrations/
│   └── web/                  # React + Vite (herda estrutura do projeto atual)
├── packages/
│   └── shared-types/         # types TS compartilhados entre api e web (gerados do Prisma)
├── docker-compose.yml
├── .env.example
└── README.md
```

## 6. Convenções Git/GitHub

- **Branches**: `main` (produção) ← `develop` (opcional se for só você) ← `feat/nome-da-feature`
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`) — facilita gerar changelog automático depois e ajuda o próprio Claude Code a entender o histórico
- **Nunca commitar**: `.env`, `pb_data`/dumps de banco, chaves — usar `.env.example` como template versionado
- **Migrations do Prisma**: sempre commitadas (pasta `prisma/migrations`) — é o histórico de schema, equivalente ao que `pb_migrations` já fazia no sistema original

## 7. Roadmap de implementação (fases)

1. **Fase 0 — Fundação**: scaffold do monorepo, Docker Compose (Postgres + API + Web), Prisma schema aplicado, seed de 1 organização + 1 usuário admin
2. **Fase 1 — Auth**: login, JWT, middleware de tenant-scoping, perfis de acesso
3. **Fase 2 — CRUD core**: tabelas de referência (especies, produtos, importadores, representantes, status_contrato) + `contratos`
4. **Fase 3 — Módulos setoriais**: detalhes_producao/ambiental/logistica/financeiro, com permissão por perfil (replicando as regras de escrita que já existiam no PocketBase)
5. **Fase 4 — Auditoria e histórico**: triggers/middleware de auditoria automática, histórico de status
6. **Fase 5 — Anexos**: upload para storage S3-compatible
7. **Fase 6 — Migração de dados**: script único para ler o `data.db` do PocketBase atual e popular o Postgres novo (preserva histórico real, não começa do zero em produção)
8. **Fase 7 — Corte**: roda os dois sistemas em paralelo por um período curto, valida paridade, desliga o PocketBase

## 8. Deploy — da máquina local para a VM

Fluxo de 3 lugares: **máquina local** (desenvolvimento, com Claude Code) → **GitHub** (fonte da verdade do código, versionamento) → **VM** (produção, só consome, nunca é onde se escreve código).

O `docker-compose.yml` descreve o ambiente inteiro como código — o mesmo arquivo sobe o sistema idêntico nos dois lugares. A única coisa que muda entre eles é o `.env` (segredos/URLs por ambiente); ele nunca é versionado no Git.

### Passo a passo (a partir do fim da Fase 0, sistema já rodando local)

```bash
# 1. Na VM, via SSH
ssh usuario@ip-da-vm

# 2. Clonar o repositório (mesmo que já roda localmente)
git clone https://github.com/seu-usuario/sistema-contratos.git
cd sistema-contratos

# 3. Criar o .env de PRODUÇÃO na VM (valores reais, distintos do .env local de teste)
cp .env.example .env
nano .env

# 4. Subir os containers
docker compose up --build -d

# 5. Aplicar as migrations no banco de produção
docker compose exec api npx prisma migrate deploy
```

**Atenção ao passo 5**: `migrate deploy` (produção) é diferente de `migrate dev` (usado localmente). `dev` é interativo e pode resetar o banco se detectar schema drift — nunca rodar isso contra dado real. `deploy` só aplica migrations pendentes, sem perguntar nada, seguro pra produção.

### Boas práticas desse fluxo

- Nunca desenvolver direto na VM — se algo quebrar em teste, quebra só localmente; produção fica intacta.
- Deploy manual (os 5 passos acima) nas primeiras vezes, até o processo estar bem entendido — só então vale automatizar com GitHub Actions (push na `main` → deploy automático). Automatizar cedo demais tende a esconder problema, não evitar.
- Rollback: `git checkout` do commit anterior + `docker compose up --build -d` de novo — funciona porque tudo (código e schema) é versionado.

## 10. Regras de negócio pendentes — rastreamento por área

Checklist vivo, atualizado a cada rodada de revisão. Cada item nasceu de
uma decisão consciente de "não inventar regra sem confirmação" durante a
construção — agora é hora de fechar cada um com a informação real do
negócio.

| Área | Pendência | Status |
|---|---|---|
| Referências (`status_contrato`) | Campo `ordem` aceita valores duplicados entre status diferentes — sem validação de unicidade por organização | ⏳ Pendente |
| Logística | Nenhuma validação de ordem cronológica entre os 9 campos de data (prancha, draft, coleta de container, embarque, entrada no destino, etc.) | ⏳ Pendente |
| Logística | Não existe perfil de acesso dedicado — usa `Operacional` por aproximação | ⏳ Pendente (aguardando decisão de responsabilidade por setor/pessoa) |
| Financeiro | `statusEmbarqueXCambio`, `statusGeralCambio`, `formaPagamento` — texto livre, sem lista fixa de valores | ⏳ Pendente |
| Financeiro | `comissaoSobreVenda = true` não exige `valorComissaoReais`/`valorComissaoDolar` preenchido | ⏳ Pendente |
| Ambiental | (revisar na prática, tela por tela — nenhuma pendência registrada até aqui) | ✅ A confirmar |
| Produção | (revisar na prática, tela por tela — nenhuma pendência registrada até aqui) | ✅ A confirmar |
| Contratos | (revisar na prática, tela por tela — nenhuma pendência registrada até aqui) | ✅ A confirmar |
| Contratos | Itens de contrato — múltiplas linhas de especificação (espessura/largura/comprimento/volume/preço por m³) dentro de um contrato, sem soma automática pro volume/valor do contrato | ✅ Resolvido — implementado (backend `itens-contrato.routes.ts` + tabela `itens_contrato`, frontend seção "Especificações" na tela de detalhe, ver README) |

## 11. Prompt inicial sugerido para o Claude Code

Ao abrir o Claude Code na VM (com este repositório e o `schema.prisma` já dentro dele), um bom primeiro prompt:

```
Este repositório vai ser um sistema de gestão de contratos de exportação de
madeira, reescrito do zero a partir do blueprint em ARCHITECTURE.md e do
schema.prisma anexo. Stack: Node.js + Fastify + Prisma + PostgreSQL no
backend, React + Vite no frontend, monorepo com workspaces.

Comece pela Fase 0 do roadmap (seção 7 do ARCHITECTURE.md): monte o
scaffold do monorepo, o docker-compose.yml com Postgres, aplique o
schema.prisma via migration inicial, e crie um seed que cria 1 organização
e 1 usuário administrador. Não avance para as fases seguintes ainda —
quero revisar a Fase 0 rodando antes de continuar.
```

Isso mantém você no controle do ritmo, revisando fase por fase, em vez de pedir "constrói tudo" de uma vez — mais seguro para quem está aprendendo backend junto com o projeto.

## 12. Fase 8 (futura) — Integrações plugáveis por cliente

Registrado para quando a venda a outros clientes avançar de verdade — nenhuma ação necessária agora. Contexto: no Modelo A (seção 3), diferentes clientes podem precisar de diferentes integrações de terceiro (ex: um cliente usa Omie, outro usa Conta Azul, para lançamento automático de nota fiscal).

**Padrão de arquitetura:** Adapter/Strategy — o sistema não conhece "Omie" diretamente, conhece uma interface genérica (`IntegracaoContabil`), com uma implementação por provedor (`OmieAdapter`, `ContaAzulAdapter`). O restante do sistema chama a interface, não o provedor específico.

**Schema necessário (não existe ainda):** tabela `organizacao_integracoes` — `organizacaoId`, `tipo` (ex: "contabil"), `provedor` (ex: "omie"/"conta_azul"), credenciais, `ativo`. Mesma ideia de "feature flag por organização", com um campo a mais dizendo qual provedor.

**Cuidado de segurança específico, não coberto pelo RLS:** credenciais de terceiros (chave de API de cada cliente) guardadas nessa tabela precisam de **criptografia em repouso** — RLS protege quem vê qual linha, não protege um dump bruto do banco ou acesso administrativo amplo. Mesmo cuidado que já tivemos com `PB_ENCRYPTION_KEY` na era PocketBase, agora aplicado a segredo de terceiro dentro do próprio sistema.

**Identificação de webhook por cliente:** já que Omie/Conta Azul não sabem o que é uma "organização" do seu sistema, a URL do webhook precisa identificar o cliente e ter um token secreto próprio por organização: `POST /integracoes/{provedor}/webhook/{organizacaoId}/{token-secreto}`.

**Primeiro candidato concreto:** integração com Omie (empresa já usa hoje para lançar notas fiscais) — ideia original discutida: quando uma NF-e é emitida no Omie, um webhook popula automaticamente os campos correspondentes em `detalhes_financeiro`, com confirmação manual do Financeiro antes de virar oficial (não sobrescrever automaticamente sem revisão, dado o peso do dado financeiro).
