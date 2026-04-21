#!/bin/bash

# Script de Limpieza TIC - Book Reader
# Resetea la base de datos y configuraciones dinamicas sin borrar los libros ni los JSON de origen.

echo "🧹 Iniciando limpieza profunda del entorno..."

# 1. Detener contenedores y borrar VOLUMENES (wipes pgdata)
echo "🐳 Deteniendo contenedores y eliminando volúmenes de base de datos..."
docker compose down -v

# 2. Eliminar configuraciones dinámicas y datos de prueba previos
echo "📄 Eliminando db_config.json y ficheros .json (reseteo a Cero Absoluto)..."
rm -f ./resources/db_config.json
rm -f ./resources/*.json

# 3. Limpiar portadas generadas (opcional, para rehacer el escaneo)
echo "🖼️ Limpiando portadas generadas en backend/covers..."
rm -rf ./backend/covers/*

# 4. Mantener books y JSONs (fuente de datos para migración)
echo "✅ Los directorios 'books' y 'resources/*.json' se han mantenido intactos."

echo "🚀 El entorno está limpio. Para volver a arrancar:"
echo "   docker compose up -d --build"
