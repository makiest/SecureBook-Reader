#!/bin/bash
# =====================================================================
# Script de Construcción y Publicación de Imágenes — Book Reader
# =====================================================================
# Uso:
#   ./scripts/k8s_build_push.sh [TIPO_REGISTRO] [PATH] [TAG]
#
# Ejemplos:
#   ./scripts/k8s_build_push.sh harbor harbor.empresa.com/book-reader 1.0.0
#   ./scripts/k8s_build_push.sh dockerhub albertodocker 1.0.0
# =====================================================================

set -e

# ── Parámetros ────────────────────────────────────────────────────────
REGISTRY_TYPE="${1:-harbor}"
REGISTRY_PATH="${2:-YOUR_REGISTRY_PATH}"
TAG="${3:-latest}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Configurar prefijos según el tipo de registro
if [ "$REGISTRY_TYPE" == "dockerhub" ]; then
    # Docker Hub: usuario/imagen:tag
    BACKEND_IMAGE="${REGISTRY_PATH}/book-reader-backend:${TAG}"
    FRONTEND_IMAGE="${REGISTRY_PATH}/book-reader-frontend:${TAG}"
else
    # Harbor/Generic: url/proyecto/imagen:tag
    BACKEND_IMAGE="${REGISTRY_PATH}/backend:${TAG}"
    FRONTEND_IMAGE="${REGISTRY_PATH}/frontend:${TAG}"
fi

echo "=============================================="
echo "  📦 Book Reader — Build & Push"
echo "=============================================="
echo "  Tipo Registro : ${REGISTRY_TYPE}"
echo "  Path/User     : ${REGISTRY_PATH}"
echo "  Tag           : ${TAG}"
echo "  Backend       : ${BACKEND_IMAGE}"
echo "  Frontend      : ${FRONTEND_IMAGE}"
echo "=============================================="

# ── Build Backend ─────────────────────────────────────────────────────
echo ""
echo "🏗️  Construyendo Backend..."
docker build -t "${BACKEND_IMAGE}" "${PROJECT_ROOT}/backend"

# ── Build Frontend ────────────────────────────────────────────────────
echo ""
echo "🏗️  Construyendo Frontend (Producción)..."
docker build -f "${PROJECT_ROOT}/frontend/Dockerfile.prod" -t "${FRONTEND_IMAGE}" "${PROJECT_ROOT}/frontend"

# ── Push ─────────────────────────────────────────────────────────────
echo ""
echo "⬆️  Subiendo imágenes a ${REGISTRY_TYPE}..."
docker push "${BACKEND_IMAGE}"
docker push "${FRONTEND_IMAGE}"

echo ""
echo "✅ Proceso completado con éxito."
echo "👉 Ahora puedes ejecutar: ./scripts/k8s_deploy.sh ${REGISTRY_TYPE} ${REGISTRY_PATH} ${TAG}"
