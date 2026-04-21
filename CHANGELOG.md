# Changelog - Book Reader

Todos los cambios notables realizados en este proyecto se documentarán en este archivo.

## [0.1.2] - 2026-04-21
### Añadido
- **Búsqueda Integrada:** Implementación de búsqueda de texto con resaltado dinámico para PDF y ePUB.
- **Navegación de Búsqueda:** Botones Anterior/Siguiente y contador de resultados en el lector.
- **Modal de Traducción Arrastrable:** Ahora el popup de traducción puede moverse por la pantalla para no tapar el contenido.

### Cambiado
- **Optimización de Recursos:** El checkbox de traducción automática al subir libros ahora está desactivado por defecto para evitar carga innecesaria en el servidor.
- **Seguridad en Sincronización:** El workflow de Github Actions ahora excluye la configuración de Actions (`.github/`) al publicar en el repositorio público.

## [0.1.1] - 2026-04-17
### Añadido
- Soporte profesional para **Kubernetes** con Helm Charts.
- Sistema de **NetworkPolicies** para seguridad Zero Trust.
- Configuración de **HPA (Horizontal Pod Autoscaler)** para backend y frontend.
- Scripts de despliegue segmentados (`k8s_build_push.sh` y `k8s_deploy.sh`).
- Manual de Ajustes del Sistema para administradores.

## [0.1.0] - 2026-04-14
### Añadido
- Migración completa a **PostgreSQL** con Prisma ORM.
- Implementación de **Rescue Mode** para configuración inicial de base de datos.
- Soporte para bases de datos externas.
- Integración de traducción de libros completos en segundo plano.
- Sistema de categorías con Drag & Drop.
- Autenticación con LDAP y Microsoft Entra ID.
- Temas Claro/Oscuro.

---
*Formato basado en [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)*
