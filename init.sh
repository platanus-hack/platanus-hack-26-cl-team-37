#!/usr/bin/env bash
# ManoViva — arranque y verificación obligatoria de cada sesión.
# Uso: bash init.sh            (verificación completa)
#      bash init.sh --rapido   (sin build ni verificación de BD)
# Termina con "INIT OK" o con el primer error y su causa.
set -euo pipefail

cd "$(dirname "$0")"
RAPIDO=0
[ "${1:-}" = "--rapido" ] && RAPIDO=1

paso() { printf '\n== %s\n' "$1"; }
falla() { printf '\nINIT FALLÓ: %s\n' "$1"; exit 1; }

paso "Directorio"
[ -f package.json ] && grep -q '"name": "manoviva"' package.json || falla "no estoy en la carpeta manoviva"
pwd

paso "Node"
NODE_V=$(node -p 'process.versions.node')
echo "node $NODE_V"
NODE_VIEJO=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);console.log(a<20||(a===20&&b<19)?1:0)')
[ "$NODE_VIEJO" = "1" ] && echo "AVISO: Vite 8 pide Node >= 20.19. Se instalan a mano los binarios nativos de Windows (ver abajo)."

paso "Dependencias"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm install --no-audit --no-fund || falla "npm install"
fi
# npm omite los binarios nativos opcionales cuando Node es más viejo de lo que piden.
# Se instalan sin guardar en package.json (en Linux/Vercel no hacen falta). Juntos, o el segundo borra al primero.
if [ "$(node -p 'process.platform')" = "win32" ]; then
  FALTAN=()
  RV=$(node -p "require('./node_modules/rolldown/package.json').version")
  OV=$(node -p "require('./node_modules/oxlint/package.json').version")
  [ -d node_modules/@rolldown/binding-win32-x64-msvc ] || FALTAN+=("@rolldown/binding-win32-x64-msvc@$RV")
  [ -d node_modules/@oxlint/binding-win32-x64-msvc ] || FALTAN+=("@oxlint/binding-win32-x64-msvc@$OV")
  if [ ${#FALTAN[@]} -gt 0 ]; then
    echo "instalando binarios nativos: ${FALTAN[*]}"
    npm install --no-save --no-audit --no-fund \
      "@rolldown/binding-win32-x64-msvc@$RV" "@oxlint/binding-win32-x64-msvc@$OV" >/dev/null || falla "binarios nativos"
  fi
fi
echo "ok"

paso "Navegador de pruebas (Playwright Chromium)"
if ! node -e "const {chromium}=require('@playwright/test');require('fs').accessSync(chromium.executablePath())" 2>/dev/null; then
  npx playwright install chromium || echo "AVISO: no se pudo instalar Chromium; e2e y capturas no correrán"
fi
echo "ok"

paso "Configuración y secretos (solo se verifica que existan)"
for v in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
  grep -q "^$v=." .env.local 2>/dev/null || falla "falta $v en .env.local"
done
for v in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_PASSWORD; do
  grep -q "^$v=." .env.secrets 2>/dev/null || falla "falta $v en .env.secrets"
done
git check-ignore -q .env.secrets && git check-ignore -q .env.local || falla ".env.* no está en .gitignore"
grep -q '^\.env\*' .vercelignore || falla ".vercelignore no excluye .env*"
echo "ok"

paso "Archivos de MediaPipe locales"
[ -s public/mediapipe/hand_landmarker.task ] || falla "falta public/mediapipe/hand_landmarker.task"
[ -s public/mediapipe/wasm/vision_wasm_internal.wasm ] || falla "faltan los wasm de MediaPipe en public/mediapipe/wasm"
echo "ok"

paso "Estado del harness"
node -e "JSON.parse(require('fs').readFileSync('feature_list.json','utf8'))" || falla "feature_list.json inválido"
node scripts/siguiente-feature.mjs --resumen
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git log --oneline -3 || echo "AVISO: sin repositorio git"

paso "Tipos";        npm run -s typecheck || falla "typecheck"
paso "Lint";         npm run -s lint      || falla "lint"
paso "Unitarias";    npm test --silent    || falla "pruebas unitarias"

if [ $RAPIDO -eq 0 ]; then
  paso "Build";      npm run -s build >/dev/null || falla "build"; echo "ok"
  paso "Base de datos (RLS, inmutabilidad, hashes)"
  npm run -s verify:db || falla "verificación de base de datos (¿sin internet?)"
fi

printf '\nINIT OK\n'
