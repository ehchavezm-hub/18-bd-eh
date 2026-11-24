# Configurar el acceso de Google (una sola vez)

La app necesita un **ID de cliente OAuth** para que puedas entrar con tu cuenta de Google y leer/escribir tu hoja. No es una contraseña: es público y solo funciona desde la dirección de la app.

## 1. Crear el proyecto
1. Entra a <https://console.cloud.google.com/> con tu cuenta de Google.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre: `Mis Finanzas` → **Crear**.

## 2. Activar las APIs
1. Menú ☰ → **APIs y servicios → Biblioteca**.
2. Busca y **habilita**: **Google Sheets API**, **Google Drive API** y **Google Picker API**.

## 3. Pantalla de consentimiento
1. **APIs y servicios → Pantalla de consentimiento de OAuth** (o "Google Auth Platform").
2. Tipo de usuario: **Externo** → Crear.
3. Nombre de la app: `Mis Finanzas`; correo de asistencia y de contacto: tu correo.
4. En **Usuarios de prueba** (Público / Audience) agrega **tu propio correo**.
5. Deja la app en modo **Prueba (Testing)**. Así solo tú puedes entrar.

## 4. Crear el ID de cliente
1. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación web**. Nombre: `Mis Finanzas web`.
3. **Orígenes de JavaScript autorizados** → agrega:
   - `https://ehchavezm-hub.github.io`
   - `http://localhost:5173` (solo para desarrollo)
4. **Crear**. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).

5. En **Acceso a los datos (Data Access) → Agregar permisos**: marca solo `.../auth/drive.file` (más `openid` y `email`). **No** agregues permisos de "todas las hojas" ni de "todo Drive".

## 4b. Crear la clave de API (para el selector de Drive)
1. **Credenciales → Crear credenciales → Clave de API**.
2. Abre la clave → **Restricciones de aplicación: Sitios web** → agrega `https://ehchavezm-hub.github.io/*` (y `http://localhost:5173/*` solo si vas a desarrollar).
3. **Restricciones de API: Restringir clave** → marca solo **Google Picker API** → Guardar.
4. Copia la clave (empieza con `AIza`).
5. Copia también el **Número del proyecto**: ☰ → **Configuración del proyecto** (o el panel del proyecto) → "Número del proyecto" (solo dígitos).

## 5. Ponerlo en GitHub
1. En el repositorio: **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**. Crea tres:
   - `VITE_GOOGLE_CLIENT_ID` → el ID de cliente.
   - `VITE_GOOGLE_API_KEY` → la clave de API restringida.
   - `VITE_GOOGLE_APP_ID` → el número del proyecto.
2. Ninguno de los tres es una contraseña: funcionan solo desde la dirección de la app y con tu cuenta.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Actions → Publicar en GitHub Pages → Run workflow**.

La app quedará en: <https://ehchavezm-hub.github.io/18-bd-eh/>

## 6. Instalar en el teléfono
- **iPhone:** abre el enlace en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.
- **Android:** abre el enlace en **Chrome** → menú ⋮ → **Instalar app**.

Al abrirla por primera vez: activa Face ID / huella y un PIN, entra con Google y **elige tu hoja en el selector de Drive**. La app solo podrá abrir ese archivo.

## 7. Antes de empezar: seguridad de la hoja
- En Google Sheets → **Compartir** → Acceso general: **Restringido**. Nadie más en la lista.
- Activa la **verificación en dos pasos** en tu cuenta de Google y en GitHub.
- Más detalles: [SEGURIDAD.md](SEGURIDAD.md).
