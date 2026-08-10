import { useEffect, useState } from "react";

type ApiStatus = "verificando" | "ok" | "erro";

function App() {
  const [status, setStatus] = useState<ApiStatus>("verificando");

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
    fetch(`${apiUrl}/health`)
      .then((res) => setStatus(res.ok ? "ok" : "erro"))
      .catch(() => setStatus("erro"));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Sistema de Contratos — Fase 0</h1>
      <p>Status da API: {status}</p>
    </main>
  );
}

export default App;
