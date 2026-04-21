# Manual de Ajustes del Sistema

Este documento describe cómo configurar y gestionar el sistema **Book Reader** a través del panel de ajustes integrado en la aplicación.

> [!NOTE]
> El botón de **⚙️ Ajustes** solo es visible para usuarios con el rol **Admin**.

## Contenido

1.  [Gestión de Biblioteca](#1-gestión-de-biblioteca)
2.  [Categorías y Organización](#2-categorías-y-organización)
3.  [Preferencias de Interfaz](#3-preferencias-de-interfaz)
4.  [Servicios de Directorio (SSO)](#4-servicios-de-directorio-sso)
5.  [Base de Datos](#5-base-de-datos)
6.  [Gestión de Usuarios](#6-gestión-de-usuarios)

---

## 1. Gestión de Biblioteca 📚
Permite controlar los archivos físicos de los libros.

- **Recargar Colección**: Escanea de nuevo la carpeta `/books` en el servidor para detectar archivos añadidos o borrados manualmente por FTP/SSH.
- **Gestor de Libros**: Permite subir archivos PDF/EPUB directamente desde el navegador y eliminarlos.
- **Traducción**: Al subir un libro, puedes marcar la opción de traducción automática. El sistema usará el servicio interno para generar una versión en español en segundo plano.

## 2. Categorías y Organización 📁
Utiliza este menú para crear categorías temáticas.

- **Crear/Eliminar**: Añade categorías personalizadas.
- **Clasificar**: Una vez creadas, puedes cerrar el menú de ajustes y **arrastrar libros** desde la sección "Sin Categoría" hacia el panel de la categoría deseada.
- **Reordenar**: Puedes arrastrar las propias categorías (desde el icono ☰) para cambiar el orden en que aparecen en la biblioteca.

## 3. Preferencias de Interfaz 🎨
- **Tema Predeterminado**: Define el tema (Claro, Oscuro o Sistema) que verán los nuevos usuarios por defecto.
- **Ayuda Visual**: El sistema incluye iconos de ayuda que muestran información detallada sobre qué poner en cada campo de configuración.

## 4. Servicios de Directorio (SSO) 🌐
Configura cómo se autentican los usuarios externos.

### Microsoft Entra ID (Azure AD)
Requiere registrar una aplicación en el portal de Azure:
- **Tenant ID**: El ID del directorio.
- **Client ID**: El ID de la aplicación.
- **Client Secret**: El valor del secreto generado.
- **Group IDs**: IDs de los grupos de Azure para asignar roles automáticos.

### AD Local (LDAP)
Configura la conexión con un servidor LDAP/Active Directory:
- **LDAP URL**: ej. `ldap://192.168.1.10`.
- **Search Base**: El DN donde buscar usuarios (ej. `ou=Usuarios,dc=empresa,dc=com`).
- **Group DNs**: Los nombres distinguidos de los grupos para permisos de Admin y Visor.

## 5. Base de Datos 🗄️
Este es el menú crítico de "Modo Rescate".
- **Contenedor Local**: Configura el sistema para usar la base de datos PostgreSQL que corre junto al backend.
- **BBDD Externa**: Permite indicar una cadena de conexión (`postgresql://...`) para usar una base de datos gestionada fuera del cluster.

## 6. Gestión de Usuarios 👥
Administra las cuentas locales del sistema.
- **Crear Usuarios**: Asigna un nombre, clave y rol.
- **Roles**:
    - **Admin**: Acceso total a los ajustes y gestión de archivos.
    - **Visor**: Solo lectura de libros y cambio de tema personal.

---

> [!TIP]
> Si el sistema se encuentra en modo de configuración inicial (porque no ha detectado base de datos), entrará automáticamente en el menú de **Base de Datos** usando las credenciales de rescate `admin / admin`.
