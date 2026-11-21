#!/usr/bin/env bash
# Crea (o reinicia) una línea de trabajo paralela: una copia del repo en ../lineas/<nombre> con su rama.
# Uso: bash scripts/crear-linea.sh <nombre>        (ej.: A, B, C)
# Comparte node_modules por enlace (no correr npm install dentro de la línea) y copia los archivos de claves.
set -euo pipefail
N="${1:?uso: bash scripts/crear-linea.sh <nombre>}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$RAIZ/../lineas/$N"
RAMA="linea-$N"
mkdir -p "$RAIZ/../lineas"
if [ -d "$DEST" ]; then git -C "$RAIZ" worktree remove --force "$DEST"; fi
git -C "$RAIZ" worktree prune
git -C "$RAIZ" branch -D "$RAMA" >/dev/null 2>&1 || true
git -C "$RAIZ" worktree add -b "$RAMA" "$DEST" master >/dev/null
cp "$RAIZ/.env.local" "$RAIZ/.env.secrets" "$DEST/"
mkdir -p "$DEST/.vercel" && cp "$RAIZ/.vercel/project.json" "$DEST/.vercel/"
# enlace de directorio (junction) a node_modules del repo principal
cmd //c mklink /J "$(cygpath -w "$DEST/node_modules")" "$(cygpath -w "$RAIZ/node_modules")" >/dev/null
echo "línea $N lista en $DEST (rama $RAMA, desde master $(git -C "$RAIZ" rev-parse --short master))"
