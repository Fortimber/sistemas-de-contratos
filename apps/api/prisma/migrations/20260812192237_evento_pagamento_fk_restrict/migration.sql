-- DropForeignKey
ALTER TABLE "detalhes_financeiro" DROP CONSTRAINT "detalhes_financeiro_prazo_pagamento_evento_id_fkey";

-- AddForeignKey
ALTER TABLE "detalhes_financeiro" ADD CONSTRAINT "detalhes_financeiro_prazo_pagamento_evento_id_fkey" FOREIGN KEY ("prazo_pagamento_evento_id") REFERENCES "eventos_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
