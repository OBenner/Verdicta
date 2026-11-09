// Copyright 2026 The Verdicta Authors
// SPDX-License-Identifier: Apache-2.0

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
  },
});
