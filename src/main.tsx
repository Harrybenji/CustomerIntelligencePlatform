import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./AppV16";
import "./stylesContrast.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
