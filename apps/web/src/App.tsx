import { Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { HomePage } from "@/pages/home-page";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
      </Route>
    </Routes>
  );
}

export default App;
