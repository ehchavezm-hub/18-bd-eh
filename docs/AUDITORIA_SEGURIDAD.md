# Auditoría de seguridad (ataque simulado)

**Fecha:** noviembre 2026 · **Método:** revisión del código y pruebas con la app real en un navegador automatizado, actuando como atacante.
**Alcance:** app web (PWA), almacenamiento en el dispositivo, acceso a Google, publicación en GitHub.

## Modelo de amenazas

| Atacante | Qué tiene | Qué busca |
|---|---|---|
| A. Ladrón u otra persona con el dispositivo | El teléfono o la computadora, quizá desbloqueados | Ver tus finanzas |
| B. Sitio web malicioso | Un enlace que abres | Engañarte o hacer clic por ti |
| C. Cadena de suministro | Una dependencia o acción de GitHub comprometida | Meter código en la app |
| D. Persona cerca | Ve tu pantalla | Ver montos |

**Límite honesto:** la protección final es tu **cuenta de Google**. Quien tenga tu Google abierto en un navegador puede abrir la hoja en Drive sin pasar por la app. Por eso la verificación en dos pasos es imprescindible.

## Hallazgos y correcciones

| # | Gravedad | Hallazgo | Corrección | Estado |
|---|---|---|---|---|
| 1 | **Crítica** | La copia local (IndexedDB) guardaba todos los movimientos **en claro**: cualquiera con el navegador abierto podía leerlos con las herramientas de desarrollador, sin PIN | **Bóveda**: copia local y cola de envío cifradas con AES-GCM 256. La clave se protege con el PIN (PBKDF2-SHA256, 310 000 iteraciones) y, si el dispositivo lo admite, con la biometría (WebAuthn PRF). Migración automática de datos antiguos | ✅ Verificado: no hay datos en claro en IndexedDB ni en localStorage |
| 2 | **Alta** | El bloqueo era solo visual: borrando el almacenamiento se creaba un PIN nuevo y se entraba | Sin el PIN o la biometría correctos la bóveda no se abre; al borrar el almacenamiento los datos locales quedan ilegibles y hay que volver a entrar con Google | ✅ |
| 3 | **Alta** | Las acciones de GitHub se referenciaban por etiqueta (`@v4`), que su autor puede mover | Fijadas por hash de commit; `persist-credentials: false`; `npm ci --ignore-scripts`; `npm audit` en cada publicación | ✅ |
| 4 | Media | Clickjacking: la app podía mostrarse dentro de otra página | La app se niega a mostrarse dentro de un iframe (GitHub Pages no permite la cabecera `frame-ancestors`) | ✅ Verificado |
| 5 | Media | La app abierta sin uso quedaba desbloqueada indefinidamente | Bloqueo tras 5 minutos sin actividad, además de los 2 minutos fuera de la app | ✅ |
| 6 | Media | Al bloquear, el token de Google seguía en memoria | Se olvida al bloquear y se pide de nuevo al desbloquear | ✅ |
| 7 | Media | La vista previa del selector de apps (iPhone/Android) mostraba montos | Pantalla de privacidad: el contenido se difumina al salir de la app | ✅ |
| 8 | Media | PIN de 4 dígitos (10 000 combinaciones) | PIN nuevos de 6 dígitos (1 000 000), se rechazan 111111, 123456 y similares; límite de intentos con espera creciente | ✅ |
| 9 | Baja | Personas cerca pueden ver montos | **Modo discreto** (ojo en Inicio): difumina todos los montos | ✅ |
| 10 | Baja | Un monto mal escrito (1500000 en vez de 150.00) se guardaba | Tope de S/ 100 millones con aviso | ✅ |
| 11 | Baja | CSP sin `upgrade-insecure-requests` | Agregado | ✅ |
| 12 | Info | Inyección de fórmulas en la hoja (`=IMPORTXML(...)`) | Ya mitigado: todo texto del usuario que empieza con `= + - @` se guarda como texto | ✅ (previo) |
| 13 | Info | Clave de API visible en el código | Es pública por diseño; restringida a Picker API y a tu dominio. El abuso posible es consumir cuota, no leer datos | Aceptado |

## Lo que la app no puede resolver (depende de ti)

1. **Verificación en dos pasos** en Google y GitHub.
2. Hoja de Google con acceso **Restringido**.
3. **Protección de rama** en GitHub (Settings → Branches → Add rule): solo tú publicas.
4. No aceptar los *pull requests* automáticos de Dependabot sin revisarlos.
5. En la computadora, un usuario del sistema solo tuyo y el disco cifrado (BitLocker / FileVault).
