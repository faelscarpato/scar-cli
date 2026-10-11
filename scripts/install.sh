#!/usr/bin/env bash
# Antigravity CLI Linux & macOS Installer
# Usage: curl -fsSL https://.../install.sh | bash

set -e

INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_FILE="$SCRIPT_DIR/../dist/index.js"

if [ -f "$DIST_FILE" ]; then
    cp "$DIST_FILE" "$INSTALL_DIR/agent.js"
    cat << 'EOF' > "$INSTALL_DIR/agent"
#!/usr/bin/env bash
exec node "$(dirname "$0")/agent.js" "$@"
EOF
    chmod +x "$INSTALL_DIR/agent"
    echo "✔ Antigravity CLI instalado em $INSTALL_DIR/agent"
else
    echo "Aviso: dist/index.js não encontrado. Execute 'pnpm run build' primeiro."
fi

# Checa se ~/.local/bin está no PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "Dica: Adicione $INSTALL_DIR ao seu PATH:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo "✔ Instalação concluída com sucesso!"
