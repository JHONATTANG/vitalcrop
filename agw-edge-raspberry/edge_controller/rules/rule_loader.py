"""
AGW Edge Gateway — Rule Loader
Carga y valida rules.yaml con Pydantic
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, field_validator

# Directorio del paquete edge_controller/ — ancla estable para resolver
# rutas relativas sin depender del directorio de trabajo del proceso.
_PACKAGE_DIR = Path(__file__).resolve().parent.parent


# ─────────────────────────────────────────────────────────────────
# Pydantic models para rules.yaml
# ─────────────────────────────────────────────────────────────────

class RuleCondition(BaseModel):
    sensor: str
    operator: Literal["<", "<=", ">", ">=", "==", "!="]
    threshold: float


class RuleAction(BaseModel):
    type: Literal["alert", "mqtt_publish", "log"]
    severity: Literal["INFO", "WARNING", "CRITICAL"] | None = None
    message: str | None = None
    topic: str | None = None
    payload: dict | None = None


class Rule(BaseModel):
    id: str
    name: str
    device_type: str
    condition: RuleCondition
    actions: list[RuleAction]
    enabled: bool = True

    @field_validator("device_type")
    @classmethod
    def normalize_device_type(cls, v: str) -> str:
        return v.upper()


class RulesFile(BaseModel):
    rules: list[Rule]


# ─────────────────────────────────────────────────────────────────
# Loader
# ─────────────────────────────────────────────────────────────────

def load_rules(rules_file: str | Path) -> list[Rule]:
    """
    Carga y valida rules.yaml.

    La ruta puede venir de config.yaml (relativa, "./rules/rules.yaml") o de
    AGW_RULES_FILE (absoluta). Se prueban varias ubicaciones porque el
    directorio de trabajo cambia entre ejecutar a mano y arrancar por systemd:
    fallar por un CWD distinto sería un error tonto y difícil de leer.
    """
    candidatos: list[Path] = []
    ruta = Path(rules_file)

    if ruta.is_absolute():
        candidatos.append(ruta)
        # Si la ruta absoluta no existe, quizá le falta el nivel del paquete
        candidatos.append(_PACKAGE_DIR / "rules" / ruta.name)
    else:
        candidatos.append(ruta)                                 # relativa al CWD
        candidatos.append(_PACKAGE_DIR / ruta)                  # relativa al paquete
        candidatos.append(_PACKAGE_DIR / "rules" / ruta.name)   # último recurso

    for candidato in candidatos:
        if candidato.is_file():
            with open(candidato, "r", encoding="utf-8") as f:
                raw = yaml.safe_load(f)
            parsed = RulesFile(**raw)
            return [r for r in parsed.rules if r.enabled]

    intentadas = "\n  ".join(str(c) for c in candidatos)
    raise FileNotFoundError(
        f"No se encontró el archivo de reglas '{rules_file}'.\n"
        f"Rutas probadas:\n  {intentadas}\n"
        f"Revisa AGW_RULES_FILE en el .env o rules.rules_file en config.yaml."
    )
