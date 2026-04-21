#!/bin/bash
# =====================================================================
# Script de Despliegue K8s Dual (Helm / Static) — Book Reader
# =====================================================================
# Uso:
#   ./scripts/k8s_deploy.sh [TIPO_REGISTRO] [PATH] [TAG] [MODO]
#
# Modos:
#   - helm (por defecto): Despliega usando charts/book-reader (incluye HPA/NetworkRules)
#   - static: Despliega directamente los manifiestos YAML de k8s/ (sin HPA/NetworkRules)
#
# Ejemplos:
#   ./scripts/k8s_deploy.sh harbor harbor.empresa.com/book-reader 1.0.0
#   ./scripts/k8s_deploy.sh dockerhub albertodocker 1.0.0 static
# =====================================================================

set -e

# ── Parámetros ────────────────────────────────────────────────────────
REGISTRY_TYPE="${1:-harbor}"
REGISTRY_PATH="${2:-YOUR_REGISTRY_PATH}"
TAG="${3:-latest}"
MODE="${4:-helm}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Configurar prefijos de imagen detectando el tipo de registro
if [ "$REGISTRY_TYPE" == "dockerhub" ]; then
    BACKEND_REPO="${REGISTRY_PATH}/book-reader-backend"
    FRONTEND_REPO="${REGISTRY_PATH}/book-reader-frontend"
else
    BACKEND_REPO="${REGISTRY_PATH}/backend"
    FRONTEND_REPO="${REGISTRY_PATH}/frontend"
fi

BACKEND_IMAGE="${BACKEND_REPO}:${TAG}"
FRONTEND_IMAGE="${FRONTEND_REPO}:${TAG}"

echo "=============================================="
echo "  🚀 Book Reader — Despliegue en Kubernetes"
echo "=============================================="
echo "  Tipo Registro : ${REGISTRY_TYPE}"
echo "  Path/User     : ${REGISTRY_PATH}"
echo "  Tag           : ${TAG}"
echo "  Modo          : ${MODE}"
echo "=============================================="

if [ "$MODE" == "helm" ]; then
    # ── MODO HELM ─────────────────────────────────────────────────────────
    echo ""
    echo "☸️  Instalando/Actualizando con Helm..."

    HELM_VALUES=""
    if [ "$REGISTRY_TYPE" == "dockerhub" ]; then
        HELM_VALUES="--set registry.url=docker.io \
                     --set backend.image.repository=${BACKEND_REPO} \
                     --set frontend.image.repository=${FRONTEND_REPO} \
                     --set backend.image.tag=${TAG} \
                     --set frontend.image.tag=${TAG}"
    else
        HELM_VALUES="--set registry.url=${REGISTRY_PATH} \
                     --set backend.image.repository=backend \
                     --set frontend.image.repository=frontend \
                     --set backend.image.tag=${TAG} \
                     --set frontend.image.tag=${TAG}"
    fi

    helm upgrade --install book-reader "${PROJECT_ROOT}/charts/book-reader" \
        --namespace book-reader \
        --create-namespace \
        ${HELM_VALUES}

elif [ "$MODE" == "static" ]; then
    # ── MODO ESTÁTICO (YAML) ──────────────────────────────────────────────
    echo ""
    echo "📄 Aplicando manifiestos YAML estáticos..."
    
    echo "🏗️  Aplicando Namespace..."
    kubectl apply -f "${PROJECT_ROOT}/k8s/namespace.yaml"
    
    echo "🔄 Actualizando referencias de imagen temporalmente en manifiestos..."
    # Se cambian los placeholders YOUR_HARBOR_URL...
    sed -i.bak "s|YOUR_HARBOR_URL/book-reader/backend:latest|${BACKEND_IMAGE}|g" "${PROJECT_ROOT}/k8s/backend/deployment.yaml"
    sed -i.bak "s|YOUR_HARBOR_URL/book-reader/frontend:latest|${FRONTEND_IMAGE}|g" "${PROJECT_ROOT}/k8s/frontend/deployment.yaml"

    echo "🗄️  Desplegando PostgreSQL..."
    kubectl apply -f "${PROJECT_ROOT}/k8s/postgres/" -n book-reader
    
    echo "⚙️  Desplegando Backend..."
    kubectl apply -f "${PROJECT_ROOT}/k8s/backend/" -n book-reader
    
    echo "🖥️  Desplegando Frontend y Translator..."
    kubectl apply -f "${PROJECT_ROOT}/k8s/frontend/" -n book-reader
    kubectl apply -f "${PROJECT_ROOT}/k8s/translator/" -n book-reader

    echo ""
    echo "🧹 Restaurando manifiestos locales a su estado original..."
    mv "${PROJECT_ROOT}/k8s/backend/deployment.yaml.bak" "${PROJECT_ROOT}/k8s/backend/deployment.yaml" 2>/dev/null || true
    mv "${PROJECT_ROOT}/k8s/frontend/deployment.yaml.bak" "${PROJECT_ROOT}/k8s/frontend/deployment.yaml" 2>/dev/null || true

else
    echo "❌ Error: Modo desconocido '$MODE'. Usa 'helm' o 'static'."
    exit 1
fi

# ── Espera y Verificación Final ───────────────────────────────────────
echo ""
echo "⏳ Esperando a que los componentes principales estén listos..."
kubectl rollout status deployment/postgres -n book-reader --timeout=120s
kubectl rollout status deployment/backend -n book-reader --timeout=180s
kubectl rollout status deployment/frontend -n book-reader --timeout=60s

echo ""
echo "=============================================="
echo "  ✅ Despliegue completado"
echo "=============================================="
echo ""
kubectl get pods -n book-reader
echo ""
echo "🌐 Ingress:"
kubectl get ingress -n book-reader
