import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Providers } from "./wallet/Providers";
import { ProgramProvider } from "./ProgramContext";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <Providers>
      <ProgramProvider>
        <App />
      </ProgramProvider>
    </Providers>
  </StrictMode>
);
