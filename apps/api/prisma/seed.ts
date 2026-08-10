import "dotenv/config";
import { PrismaClient, PerfilAcesso } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const orgNome = process.env.SEED_ORG_NOME ?? "Minha Empresa";
  const adminLogin = process.env.SEED_ADMIN_LOGIN ?? "admin";
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminSenha = process.env.SEED_ADMIN_SENHA ?? "troque-esta-senha";

  // Single-tenant hoje: reaproveita a primeira organização se já existir,
  // em vez de criar uma nova a cada execução do seed.
  let organizacao = await prisma.organizacao.findFirst();
  if (!organizacao) {
    organizacao = await prisma.organizacao.create({ data: { nome: orgNome } });
  }

  const senhaHash = await bcrypt.hash(adminSenha, 10);

  const usuario = await prisma.usuario.upsert({
    where: {
      organizacaoId_login: {
        organizacaoId: organizacao.id,
        login: adminLogin,
      },
    },
    update: {},
    create: {
      organizacaoId: organizacao.id,
      login: adminLogin,
      email: adminEmail,
      senhaHash,
      nomeCompleto: "Administrador",
      perfilAcesso: PerfilAcesso.Administrador,
      deveTrocarSenha: true,
    },
  });

  console.log("Organização:", organizacao);
  console.log("Usuário admin:", { ...usuario, senhaHash: "[oculto]" });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
