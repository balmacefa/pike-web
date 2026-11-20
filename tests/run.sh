#!/usr/bin/env bash
# Runner de tests del backend de workers (CLI olimpo-registry.mjs) — MVC + UI↔backend.
set -u
cd "$(dirname "$0")/.." || exit 2
echo "▶ Test dinámico CLI de workers (MVC: Modelo·Controlador·Vista + UI Godot)"
node tests/cli-workers.test.mjs
