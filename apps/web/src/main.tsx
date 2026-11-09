// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root is missing in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
