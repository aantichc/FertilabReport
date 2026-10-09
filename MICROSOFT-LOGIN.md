# Activar el acceso con Microsoft en Fertilab

El código sustituye la clave compartida y el nombre manual por Supabase Auth con Microsoft (Azure), usando PKCE. Solo se aceptan cuentas Microsoft con correo @fertilab.org. El nombre mostrado en el historial procede de la cuenta. Las actualizaciones históricas conservan sus autores originales.

## 1. Registro en Microsoft Entra

En https://entra.microsoft.com, entra en **Identity → Applications → App registrations → New registration**:

- Nombre: **Fertilab Reports**.
- Supported account types: **Accounts in this organizational directory only** (el directorio de Fertilab).
- Redirect URI, plataforma **Web**: `https://bvqtznwagqrlwydslaxv.supabase.co/auth/v1/callback`.

Anota **Application (client) ID** y **Directory (tenant) ID**. En **Certificates & secrets**, crea el secreto y copia su **Value** directamente a Supabase; no al código ni al chat. Configura las claims opcionales `email` y `xms_edov` siguiendo la documentación oficial enlazada abajo para verificar el dominio enviado por Microsoft. Controla la caducidad del secreto.

## 2. Proveedor de Supabase

En https://supabase.com/dashboard/project/bvqtznwagqrlwydslaxv/auth/providers, activa **Azure (Microsoft)**:

- Client ID: el Application ID del paso anterior.
- Client secret: el **Value** del secreto.
- Azure Tenant URL: `https://login.microsoftonline.com/ID-DEL-TENANT-DE-FERTILAB`.

En **Authentication → URL Configuration**, configura **Site URL** con la URL publicada de la app y añade esa URL exacta a **Redirect URLs**. Para desarrollo añade `http://localhost:4173/` y `http://localhost:4174/`. Usa localhost para las pruebas de OAuth.

## 3. Variables privadas en Vercel

- `SUPABASE_URL`: `https://bvqtznwagqrlwydslaxv.supabase.co`.
- `SUPABASE_ANON_KEY`: la clave pública del proyecto, utilizada por el servidor para verificar sesiones.
- `SUPABASE_SERVICE_ROLE_KEY`: solo en el servidor, para el cron de recordatorios después de cerrar el acceso anónimo a la base de datos.
- `CRON_SECRET`: secreto privado para que Vercel autentique su cron.
- Mantener las variables SMTP existentes.

Nunca dar un prefijo `VITE_` al secreto de Microsoft, a la clave de servicio ni al secreto de cron.

## 4. Puesta en marcha coordinada

1. Configura Entra, Azure en Supabase, las URLs y las variables del servidor.
2. Verifica el inicio de sesión Microsoft en una previsualización, incluido el retorno a la app, el nombre del usuario, el cierre de sesión y el rechazo de una cuenta ajena.
3. Publica el código y aplica `supabase/microsoft-access.sql` en el SQL Editor en la misma ventana de puesta en marcha. Este archivo requiere autenticación Microsoft de Fertilab para leer o modificar datos. No lo ejecutes mientras la versión publicada siga usando la clave compartida: esa versión perdería el acceso a los datos.
4. Verifica una lectura y una actualización con una cuenta Fertilab; comprueba que una petición anónima ya no puede leer partes. Verifica la notificación de creación y el cron con sus credenciales de servidor.

Publicado en https://fertilabreport-six.vercel.app/ el 9 de octubre de 2026. Microsoft Entra, Azure en Supabase y las URLs están configurados; el usuario verificó inicio de sesión, nombre y lectura de partes en local. Las variables privadas están configuradas en Vercel y microsoft-access.sql está aplicado en producción. Se verificó que una cuenta Fertilab puede leer los 8 partes, que anon no puede leer ninguna de las siete tablas, que la API de correo rechaza solicitudes sin sesión (401) y que el cron reconoce sus credenciales y rechaza un método no permitido (405), sin enviar correos de prueba. Pendiente la prueba interactiva de inicio de sesión en la URL pública por el usuario.

## Desarrollo y comprobaciones

```powershell
pnpm install
pnpm dev --port 4174
pnpm test
pnpm build
```

Para servir la compilación: `node server.mjs`. El servidor sirve `dist/` y requiere compilar antes. Las funciones de correo se prueban en Vercel.

Documentación: https://supabase.com/docs/guides/auth/social-login/auth-azure

## Prueba local verificada (9 octubre 2026)
Inicio de sesión Microsoft y lectura de los 8 partes verificados con la cuenta Fertilab en localhost:4174. Se aplicó microsoft-access-transition.sql: concede permisos a authenticated y restringe ese rol a Microsoft @fertilab.org. Los permisos antiguos de anon permanecen hasta publicar la nueva versión y aplicar microsoft-access.sql.


