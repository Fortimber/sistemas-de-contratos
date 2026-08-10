# Sistema de Contratos de Exportação

Ver `ARCHITECTURE.md` para o blueprint completo. Estado atual: **Fase 0 — Fundação** (ver seção 7).

## Rodando localmente (Docker)

```bash
cp .env.example .env
# edite .env se quiser trocar usuário/senha do Postgres e do admin inicial

docker compose up --build -d

# aplica o schema (primeira vez / após mudar prisma/schema.prisma)
docker compose exec api npx prisma migrate dev

# popula 1 organização + 1 usuário administrador
docker compose exec api npx prisma db seed
```

- API: http://localhost:3000/health
- Web: http://localhost:5173

## Estrutura

```
apps/api/             # Fastify + Prisma
apps/web/              # React + Vite
packages/shared-types/ # types compartilhados (ainda vazio na Fase 0)
```
