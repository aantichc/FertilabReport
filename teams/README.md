# Fertilab Reports en Teams

El paquete 1.0.2 actualiza el icono a un monitor y el tema a azul.
Mantiene `webApplicationInfo` para el SSO. Conserva el ID de
la app de Teams para actualizar la instalación existente.

## Entra

Registro: Fertilab Reports (`b93ab8b1-fc15-48d9-bd38-ab5e8404a516`), tenant
`f1894d88-c4bd-408e-996c-07bb5a04e151`.

1. En el manifiesto Microsoft Graph, configurar `api.requestedAccessTokenVersion: 2`.
2. Exponer la API con URI
   `api://fertilabreport-six.vercel.app/b93ab8b1-fc15-48d9-bd38-ab5e8404a516`.
3. Crear y guardar el scope delegado `access_as_user` (tipo User, habilitado).
4. Después de guardar el scope, preautorizar sus permisos para Teams escritorio
   `1fec8e78-bce4-4aaf-ab1b-5451cc387264` y Teams web
   `5e3ce6c0-2b1f-4285-8d4b-75ee78787346`.

No modificar el retorno OAuth de Supabase. No requiere nuevos secretos ni
permisos de lectura de Microsoft Graph.

## Paquete

Desde la raíz del proyecto, PowerShell:

```powershell
Compress-Archive -LiteralPath teams/manifest.json,teams/color.png,teams/outline.png -DestinationPath Fertilab-Reports-Teams-App.zip -Force
```

El ZIP contiene los tres archivos en la raíz. Actualizar el paquete de la app
existente en Teams (o en el centro de administración de Teams si se distribuyó
para la organización) y cerrar y volver a abrir Fertilab Reports.

## Comprobación

La pestaña intenta adquirir un token de Teams en silencio. El servidor valida
firma RS256, emisor, audiencia, tenant, caducidad, cliente Teams y scope.
Busca la identidad Azure previamente vinculada en Supabase por oid + tid.
No autoriza usando user_metadata ni el correo enviado por el navegador.

La primera entrada de cada usuario usa Microsoft OAuth para vincular su cuenta.
Las siguientes pueden usar SSO. Se mantiene el botón de Microsoft si el host,
el consentimiento o la configuración impiden el acceso silencioso. Salir evita
el SSO automático durante esa sesión de la pestaña.

El intercambio usa generateLink + verifyOtp en el servidor, sin enviar correo,
para obtener una sesión normal de Supabase del mismo usuario. Las claves de
servicio permanecen en Vercel; se mantienen las políticas RLS existentes.
La búsqueda administrativa se limita a 2.000 usuarios; si se supera, falla de
forma segura y usa OAuth. No se almacenan tokens de Teams ni datos del directorio.

Validación local: `pnpm test` y `pnpm build`. Validación real pendiente hasta
instalar este paquete: cerrar sesión en Reports, volver a abrir Teams y confirmar
que aparece el nombre correcto y los partes sin pedir autenticación.

Referencia: https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/authentication/tab-sso-register-aad
