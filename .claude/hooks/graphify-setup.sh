#!/bin/bash
# Instala graphify y reconstruye el grafo del código al abrir una sesión en la nube.
# Solo AST (sin LLM ni API keys): tarda unos segundos.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

export PATH="$HOME/.local/bin:$PATH"
if ! command -v graphify >/dev/null 2>&1; then
  uv tool install graphifyy >/dev/null 2>&1 || pip install --user graphifyy >/dev/null 2>&1 || exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
GRAPHIFY_BACKEND=none graphify update . >/dev/null 2>&1 || true
