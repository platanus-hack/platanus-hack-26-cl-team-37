#!/usr/bin/env bash
# Crea una línea de trabajo paralela: una copia del repo en ../lineas/<nombre> con su rama linea-<nombre>.
# Uso: bash scripts/crear-linea.sh <nombre>        (el nombre debe ser nuevo)
# node_modules se COPIA (robocopy): un enlace no sirve porque init.sh corre npm install en la copia.
set -euo pipefail
N="${1:?uso: bash scripts/crear-linea.sh <nombre>}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$RAIZ/../lineas/$N"
RAMA="linea-$N"
[ -e "$DEST" ] && { echo "ya existe $DEST: usa otro nombre"; exit 1; }
mkdir -p "$RAIZ/../lineas"
git -C "$RAIZ" worktree prune
git -C "$RAIZ" worktree add -b "$RAMA" "$DEST" master >/dev/null 2>&1
cp "$RAIZ/.env.local" "$RAIZ/.env.secrets" "$DEST/"
mkdir -p "$DEST/.vercel" && cp "$RAIZ/.vercel/project.json" "$DEST/.vercel/"
[ -d "$RAIZ/supabase/.temp" ] && mkdir -p "$DEST/supabase" && cp -r "$RAIZ/supabase/.temp" "$DEST/supabase/.temp"
# robocopy devuelve 0–7 si fue bien
MSYS_NO_PATHCONV=1 robocopy "$(cygpath -w "$RAIZ/node_modules")" "$(cygpath -w "$DEST/node_modules")" /E /NFL /NDL /NJH /NJS /NP /MT:16 >/dev/null || [ $? -lt 8 ]
echo "línea $N lista en $DEST (rama $RAMA, desde master $(git -C "$RAIZ" rev-parse --short master))"
