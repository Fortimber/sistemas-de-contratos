import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { ContratoCreatePage } from "@/features/contratos/contrato-create-page";
import { ContratoDetailPage } from "@/features/contratos/contrato-detail-page";
import { ContratoEditPage } from "@/features/contratos/contrato-edit-page";
import { ContratosListPage } from "@/features/contratos/contratos-list-page";
import { EspeciesPage } from "@/features/referencias/especies-page";
import { EventosPagamentoPage } from "@/features/referencias/eventos-pagamento-page";
import { ImportadoresPage } from "@/features/referencias/importadores-page";
import { ProdutosPage } from "@/features/referencias/produtos-page";
import { RepresentantesPage } from "@/features/referencias/representantes-page";
import { StatusContratoPage } from "@/features/referencias/status-contrato-page";
import { LoginPage } from "@/pages/login-page";
import { ProtectedRoute, PublicOnlyRoute } from "@/routes/route-guards";

function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/contratos" replace />} />

          <Route path="/contratos" element={<ContratosListPage />} />
          <Route path="/contratos/novo" element={<ContratoCreatePage />} />
          <Route path="/contratos/:id" element={<ContratoDetailPage />} />
          <Route path="/contratos/:id/editar" element={<ContratoEditPage />} />

          <Route path="/referencias/especies" element={<EspeciesPage />} />
          <Route path="/referencias/produtos" element={<ProdutosPage />} />
          <Route path="/referencias/importadores" element={<ImportadoresPage />} />
          <Route path="/referencias/representantes" element={<RepresentantesPage />} />
          <Route path="/referencias/status-contrato" element={<StatusContratoPage />} />
          <Route path="/referencias/eventos-pagamento" element={<EventosPagamentoPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
