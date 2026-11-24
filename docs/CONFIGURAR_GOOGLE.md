# Configurar el acceso de Google (una sola vez)

La app necesita un **ID de cliente OAuth** para que puedas entrar con tu cuenta de Google y leer/escribir tu hoja. No es una contraseña: es público y solo funciona desde la dirección de la app.

## 1. Crear el proyecto
1. Entra a <https://console.cloud.google.com/> con tu cuenta de Google.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre: `Mis Finanzas` → **Crear**.

## 2. Activar las APIs
1. Menú ☰ → **APIs y servicios → Biblioteca**.
2. Busca y **habilita**: **Google Sheets API** y **Google Drive API**.

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

## 5. Ponerlo en GitHub
1. En el repositorio: **Settings → Secrets and variables → Actions → pestaña Variables → New repository variable**.
2. Nombre: `VITE_GOOGLE_CLIENT_ID` · Valor: el ID de cliente copiado.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Actions → Publicar en GitHub Pages → Run workflow**.

La app quedará en: <https://ehchavezm-hub.github.io/18-bd-eh/>

## 6. Instalar en el teléfono
- **iPhone:** abre el enlace en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.
- **Android:** abre el enlace en **Chrome** → menú ⋮ → **Instalar app**.

Al abrirla por primera vez: pega el enlace de tu hoja de Google Sheets, activa Face ID / huella y un PIN, y entra con Google.
