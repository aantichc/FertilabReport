# Fertilab Reports

Web app para crear, consultar y actualizar partes con historial permanente.

## Ejecutar

```powershell
node server.mjs
```

Después abre:

```text
http://localhost:4173
```

## Arquitectura

La primera versión está construida sin dependencias externas para que sea sencilla de ejecutar y mantener.

- `src/models.js`: estados, tipos de historial y metadatos visuales.
- `src/storage.js`: persistencia en `localStorage`.
- `src/reportService.js`: creación, actualizaciones, cambios de estado y borrado de partes.
- `src/recipientService.js`: gestión de correos destinatarios.
- `src/notificationService.js`: adaptador de notificación al crear partes.
- `src/main.js`: renderizado y eventos de interfaz.
- `src/styles.css`: estilos de la interfaz.

## Notificaciones

El navegador no envía correos directamente. La versión publicada usa una función serverless de Vercel en `api/send-report-email.js` y Resend para enviar emails reales al crear un parte.

Variables necesarias en Vercel:

- `RESEND_API_KEY`: API key privada de Resend.
- `EMAIL_FROM`: remitente verificado, por ejemplo `Fertilab Reports <partes@tudominio.com>`. Si no se define, se usa `Fertilab Reports <onboarding@resend.dev>` para pruebas.

Regla implementada:

- Crear parte: genera notificación.
- Añadir actualización: no genera email.
- Cambiar estado: no genera email.
- Añadir respuesta: no genera email.

## Modelo conceptual

Cada parte conserva:

- `publishedAt`: fecha original inmutable.
- `updatedAt`: última modificación relevante.
- `history`: entradas cronológicas independientes.

Cada entrada de historial conserva su propio `createdAt`, tipo, contenido y estado asociado. Las actualizaciones se añaden al historial y no sobrescriben entradas anteriores.

## Base de datos compartida

La version publicada usa Supabase para compartir partes, historial, destinatarios y log de notificaciones entre todos los usuarios.

Para preparar un proyecto nuevo de Supabase:

1. Abre `SQL Editor`.
2. Crea una nueva query.
3. Pega y ejecuta el contenido de `supabase/schema.sql`.

La app conserva en `localStorage` solo el nombre del usuario activo en ese navegador.
