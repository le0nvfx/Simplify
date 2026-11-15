#!/bin/bash
# Installs the Simplify panel for the current macOS user.
#   ./install/install-mac.sh          copy the extension
#   ./install/install-mac.sh --link   symlink it instead (for development: edits apply on panel reopen)
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/extension"
DEST_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$DEST_DIR/com.simplify.ae"

mkdir -p "$DEST_DIR"
rm -rf "$DEST"
if [ "${1:-}" = "--link" ]; then
  ln -s "$SRC" "$DEST"
else
  cp -R "$SRC" "$DEST"
fi

# The panel is not signed yet, so After Effects only loads it with the CEP debug flag set.
for v in 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

echo "Simplify installed to: $DEST"
echo "Restart After Effects, then open Window > Extensions > Simplify."
