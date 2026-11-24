# Seguridad · Prioridad máxima

La información financiera del propietario es confidencial. Este documento fija las reglas que el código y la configuración deben cumplir siempre.

## 1. Dónde vive cada cosa

| Elemento | Dónde | ¿Público? |
|---|---|---|
| Código de la app | GitHub (`18-bd-eh`) | Sí: no contiene datos, claves ni enlaces privados |
| Base de datos | Google Drive del propietario (Google Sheets) | **No**: compartido con nadie |
| Fotos de boletas | Carpeta del Drive del propietario | **No** |
| Sesión de Google | Memoria del teléfono, ~1 hora | No se guarda en disco |
| Enlace a la BD, bloqueo | Almacenamiento local del teléfono | No sale del teléfono |

**No hay servidor intermedio.** Los datos viajan del teléfono a Google por HTTPS, autorizados por la cuenta del propietario.

## 2. Capas de protección

1. **Google Drive:** la hoja **no se comparte** con nadie (Compartir → Acceso general: **Restringido**). Solo la cuenta del propietario puede abrirla, con o sin la app.
2. **Permiso mínimo (`drive.file`):** la app solo puede abrir el archivo que el propietario elige en el selector de Drive. No puede ver, listar ni abrir ningún otro archivo.
3. **App de Google en modo Prueba:** solo los correos de la lista de "usuarios de prueba" (el propietario) pueden autorizarla.
4. **Cuenta vinculada:** el teléfono queda unido a la cuenta de Google del primer acceso; otra cuenta es rechazada.
5. **Bloqueo local:** Face ID / huella (WebAuthn) o PIN (guardado solo como hash PBKDF2); bloqueo automático tras 2 minutos fuera de la app; verificación adicional para Configuración.
6. **Política de contenido (CSP):** el navegador solo ejecuta código de la propia app y de Google; bloquea scripts inyectados.
7. **Clave de API restringida:** sirve solo para el selector de Drive y solo desde `https://ehchavezm-hub.github.io`.
8. **Borrado:** "Borrar todo de este teléfono" elimina sesión, bloqueo y copia local; la BD en Drive no se toca.

## 3. Reglas que no se rompen

- Nunca se sube al repositorio: archivos Excel/CSV/PDF, respaldos, enlaces o IDs de la BD, correos, tokens ni claves privadas (`.gitignore` los bloquea).
- Nunca se envían datos financieros a servicios de terceros (analítica, registros de errores, IA, etc.).
- Nunca se registra en consola información financiera.
- Toda dependencia nueva se fija a una versión exacta y se revisa; Dependabot avisa de actualizaciones de seguridad.
- El ID de cliente OAuth y la clave de API no son secretos, pero deben tener sus restricciones activas (orígenes y APIs permitidas).

## 4. Lo que debe hacer el propietario (imprescindible)

1. **Verificación en dos pasos** activada en la cuenta de Google y en la de GitHub.
2. Hoja de Google Sheets con acceso **Restringido** (no "Cualquier persona con el enlace").
3. Teléfono con código de bloqueo y Face ID / huella; sistema actualizado.
4. Mantener la app de Google Cloud en modo **Prueba** con solo su correo como usuario de prueba.
5. No compartir capturas de pantalla de la BD ni el enlace de la hoja.

## 5. Riesgos conocidos y mitigación

| Riesgo | Mitigación |
|---|---|
| Robo del teléfono desbloqueado | Bloqueo automático de la app; Face ID/PIN; "Borrar todo" desde otro dispositivo no existe aún → cerrar sesiones desde la cuenta de Google (Seguridad → Tus dispositivos) |
| Copia local en el teléfono (desde la etapa 1, para trabajar sin internet) | Cifrado del sistema del teléfono; bloqueo de la app; se evaluará cifrado adicional con clave derivada del PIN |
| Robo de la cuenta de Google | Verificación en dos pasos (responsabilidad del propietario) |
| Código malicioso en una dependencia | Versiones fijas, `npm ci`, pocas dependencias, Dependabot |
| El repositorio es público | No contiene nada sensible; puede hacerse privado (GitHub Pages en repos privados requiere plan de pago) |
