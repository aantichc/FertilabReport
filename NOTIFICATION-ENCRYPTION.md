# Cifrado de los correos de notificación

Los destinatarios configurados y los arrays de destinatarios de `email_log` y
`preventive_notification_log` se almacenan como `enc:v1:…` mediante AES-256-GCM.
Cada escritura utiliza un nonce aleatorio de 96 bits; la autenticación liga el
cifrado a la tabla y al identificador de fila. Un HMAC con una subclave separada
permite impedir destinatarios duplicados sin guardar el correo en claro.

La clave `NOTIFICATION_EMAIL_ENCRYPTION_KEY` contiene 32 bytes aleatorios en
base64. Se configura como secreto **solo del servidor** en Vercel, sin prefijos
`VITE_` o `NEXT_PUBLIC_`. No usar contraseñas humanas ni la clave pública de
Supabase. Conservar una copia de recuperación en el gestor de secretos de la
organización: perderla hace irrecuperables los correos cifrados. Su rotación
requiere descifrar con la clave anterior y volver a cifrar antes de sustituirla.

El navegador usa `/api/notification-data` con su sesión Microsoft de Fertilab.
La API verifica la sesión con Supabase antes de cualquier lectura o escritura;
descifra solo en el servidor y envía respuestas `no-store`. Las tres tablas
de notificaciones ya no admiten acceso REST directo de `anon` o `authenticated`.
El servicio de correo y el cron descifran los destinatarios para enviarlos y
cifran cualquier copia del destinatario que se guarde en los historiales.

## Despliegue y migración

1. Configurar la clave de producción en Vercel y respaldarla. No sustituir una
   clave que ya esté en uso. Usar otras claves y bases de datos para pruebas.
2. Preparar un snapshot con `recipients` (`id,email`), `logs` y `preventiveLogs`
   (`id,recipients`). El snapshot es confidencial; no guardarlo en Git ni logs.
3. Con la clave en el entorno, `scripts/build-email-migration.mjs` lee el JSON
   de stdin y genera SQL que contiene exclusivamente textos cifrados y HMAC.
   Verifica el descifrado antes de generar los cambios.
4. Coordinar el despliegue de la API/cliente nuevos con la aplicación del SQL.
   El SQL bloquea las tres tablas, cifra los datos existentes, añade la huella
   única y las restricciones de formato y revoca el acceso directo, todo en
   una transacción. Si hay escrituras nuevas no incluidas, las restricciones
   hacen fallar la migración; obtener un snapshot nuevo y volver a prepararla.
5. Verificar cero destinatarios en claro, recuentos sin cambios, descifrado de
   todas las filas y CRUD desde una sesión real. No enviar correos de prueba
   sin autorización del usuario.

El cliente antiguo necesita recargarse tras el despliegue. Para ejecutar las
API en desarrollo usar `vercel dev` con claves de desarrollo; Vite solo sirve
el frontend. La clave y la librería de cifrado nunca se importan desde `src`.

Este cambio cubre los campos de destinatarios de notificación. No modifica los
correos de identidad de Microsoft/Supabase Auth ni textos libres de partes.
Tampoco borra copias históricas en backups, WAL o registros anteriores a la
migración; esas copias dependen de las políticas de retención del proveedor.
