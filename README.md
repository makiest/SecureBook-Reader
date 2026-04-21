# Book Reader

Una plataforma moderna de lectura y gestión de libros en formato PDF y EPUB, diseñada para ser auto-alojada y compatible con entornos Cloud-Native.

## Características Principales

- **Gestión Multi-formato**: Soporte completo para PDF y EPUB con generación automática de portadas.
- **Traducción Inteligente**: Capacidad para solicitar traducciones de libros al español en segundo plano.
- **Organización por Categorías**: Clasifica tus libros y ordénalos mediante arrastrar y soltar (Drag & Drop).
- **Búsqueda Integrada**: Localiza términos con resaltado dinámico en PDF y ePUB.
- **Personalización de Interfaz**: Temas Claro/Oscuro/Sistema y leyendas de ayuda integradas.
- **Seguridad y Roles**: Autenticación local, por AD Local (LDAP) o Microsoft Entra ID. Roles de Administrador y Visor.
- **Despliegue Profesional**: Preparado para Docker Compose y Kubernetes (Helm & Manifiestos Estáticos).

## Inicio Rápido

### Despliegue en Kubernetes
El proyecto incluye scripts automatizados para facilitar la construcción de imágenes y el despliegue en K8s:

1.  **Construir y Subir Imágenes**:
    ```bash
    ./scripts/k8s_build_push.sh dockerhub tu_usuario_docker 0.1.0
    ```
2.  **Desplegar**:
    ```bash
    # Modo Helm (Recomendado)
    ./scripts/k8s_deploy.sh dockerhub tu_usuario_docker 0.1.0 helm

    # Modo Estático (YAML Limpio)
    ./scripts/k8s_deploy.sh dockerhub tu_usuario_docker 0.1.0 static
    ```

> [!IMPORTANT]
> Antes de desplegar, asegúrate de configurar tus credenciales en los manifiestos de la carpeta `k8s/` o en `values.yaml`.

## Configuración y Ajustes

Para aprender a configurar la biblioteca, los usuarios o los servicios de directorio una vez desplegado, consulta el siguiente manual:

👉 **[Manual de Ajustes del Sistema](SETTINGS_GUIDE.md)**

---

Desarrollado con ❤️ para amantes de la lectura y la infraestructura.
