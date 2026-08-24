#!/bin/bash
# ============================================================
#  deploy_edge.sh — Instala el AGW Edge Controller en la Raspberry Pi
# ============================================================
#  Uso:  sudo bash deploy_edge.sh
#
#  Idempotente: se puede re-ejecutar para actualizar el codigo sin
#  perder el buffer SQLite ni el .env.
# ============================================================
set -euo pipefail

DEST=/opt/agw-edge
VENV=$DEST/venv
DBDIR=/var/lib/agw
LOGDIR=/var/log/agw
SVC=agw-edge

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Ejecutar con sudo"
[ -d "./edge_controller" ] || die "Ejecutar desde agw-edge-raspberry/ (no encuentro edge_controller/)"

# ── Dependencias del sistema ─────────────────────────────────
say "Instalando dependencias del sistema"
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip sqlite3

# ── Estructura ───────────────────────────────────────────────
say "Creando directorios"
mkdir -p "$DEST" "$DBDIR" "$LOGDIR"

# ── Codigo ───────────────────────────────────────────────────
say "Copiando edge_controller"
rm -rf "$DEST/edge_controller"
cp -r ./edge_controller "$DEST/"
find "$DEST" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true

# El .env NO se sobrescribe si ya existe: puede tener secretos ajustados
if [ -f ./.env ] && [ ! -f "$DEST/.env" ]; then
    cp ./.env "$DEST/.env"
    say "Copiado .env inicial"
elif [ -f "$DEST/.env" ]; then
    say "Conservando el .env existente (no se sobrescribe)"
else
    die "No hay .env ni en el repo ni en $DEST"
fi
chmod 600 "$DEST/.env"
chown root:root "$DEST/.env"

# ── Entorno virtual ──────────────────────────────────────────
if [ ! -d "$VENV" ]; then
    say "Creando entorno virtual"
    python3 -m venv "$VENV"
fi

say "Instalando dependencias Python"
# --prefer-binary  → usa wheel precompilado si existe. Sin esto, pip puede
#                    intentar compilar pydantic-core desde Rust (~15 min y
#                    propenso a fallar en ARM).
# --retries/--timeout → la Pi da RemoteDisconnected esporadicos contra PyPI.
PIP_OPTS="--prefer-binary --retries 5 --timeout 60"
"$VENV/bin/pip" install --quiet --upgrade pip $PIP_OPTS
"$VENV/bin/pip" install $PIP_OPTS -r ./requirements.txt

# Verificacion: que todo lo critico importe de verdad antes de seguir
say "Verificando importaciones"
"$VENV/bin/python" - <<'PY'
import sys
faltan = []
for mod in ("aiomqtt", "httpx", "structlog", "yaml",
            "pydantic", "aiosqlite", "fastapi", "uvicorn"):
    try:
        __import__(mod)
    except Exception as exc:
        faltan.append(f"{mod}: {exc}")
if faltan:
    print("FALLO al importar:")
    for f in faltan:
        print("  -", f)
    sys.exit(1)
import pydantic, aiomqtt
print(f"  pydantic {pydantic.VERSION} · aiomqtt {aiomqtt.__version__} · python {sys.version.split()[0]}")
PY

# ── Servicio systemd ─────────────────────────────────────────
say "Registrando servicio systemd"
cat > /etc/systemd/system/$SVC.service <<'UNIT'
[Unit]
Description=VitalCrop AGW Edge Controller (Fog Gateway)
Documentation=file:///opt/agw-edge/edge_controller
# Espera al broker local: sin Mosquitto no hay nada que suscribir.
After=network-online.target mosquitto.service
Wants=network-online.target
Requires=mosquitto.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/agw-edge/edge_controller
EnvironmentFile=-/opt/agw-edge/.env
ExecStart=/opt/agw-edge/venv/bin/python -u main.py

# Reinicio agresivo: es el proceso que mantiene vivo el cultivo.
Restart=always
RestartSec=5
StartLimitBurst=0

StandardOutput=journal
StandardError=journal
SyslogIdentifier=agw-edge

# Endurecimiento razonable sin romper el acceso a /var/lib/agw
NoNewPrivileges=yes

# PrivateTmp=no A PROPOSITO. Con /tmp privado, hostapd_cli crea su
# socket de cliente dentro del namespace del servicio y hostapd, que
# vive fuera, no puede responderle: todos los sondeos del vigilante del
# AP fallaban en silencio. El unico dato sensible del servicio es el
# .env, que ya esta en chmod 600 y fuera de /tmp.
PrivateTmp=no
ProtectSystem=full
ReadWritePaths=/var/lib/agw /var/log/agw

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable $SVC >/dev/null

say "Instalacion completa"
cat <<TXT

  Codigo    $DEST/edge_controller
  Entorno   $VENV
  Config    $DEST/.env            (chmod 600)
  Buffer    $DBDIR/buffer.db
  Servicio  $SVC.service          (enabled, Restart=always)

  Arrancar:   sudo systemctl start $SVC
  Ver logs:   sudo journalctl -u $SVC -f
  Estado:     systemctl status $SVC
  Salud:      curl -s http://localhost:8080/health/info

TXT
