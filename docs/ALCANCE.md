# Alcance de la app · Finanzas personales

**Estado:** aprobado · etapas 0 a 4 construidas · **Versión del documento:** 1.2 (dashboards; uso también en computadora) · **Esquema de BD:** v3

## 1. Objetivo

Registrar todos los ingresos, egresos y transferencias en segundos desde el teléfono, saber cuánto hay en cada cuenta, no olvidar ningún pago fijo y entender en qué se va el dinero. La app debe estar **pensada para crecer**: más bancos, más cuentas, más monedas, nuevas funciones y, si algún día hace falta, más usuarios, sin rediseñar la base de datos.

## 2. Decisiones generales

| Tema | Decisión |
|---|---|
| Tipo de app | App web instalable (PWA): un solo código para iPhone, Android y computadora (Windows / Mac, en Chrome, Edge o Safari), sin tiendas |
| Base de datos | Google Sheets en el Google Drive del propietario (esquema v3, 33 pestañas) |
| Hosting | GitHub Pages (gratis). El repositorio contiene solo código, nunca datos |
| Usuarios | Un usuario (el propietario), que también es administrador. Preparado para roles futuros |
| Acceso | Cuenta Google (una vez) + desbloqueo con Face ID / huella / Touch ID / Windows Hello / PIN |
| Sin internet | Sí: guarda en el teléfono y sincroniza al volver la conexión |
| Prioridad | Versión 1 pronto y simple; el resto en versiones siguientes |

## 3. Módulos

### 3.1 Módulo Usuario (uso diario)

| Pantalla | Funciones |
|---|---|
| **Inicio** | Saldo total, pagos de la semana, gasto del mes |
| **Anotar** (botón + siempre visible) | Ingreso, egreso o transferencia en pocos toques |
| **Movimientos** | Historial con búsqueda y filtros; editar y anular (nunca borrar) |
| **Cuentas** | Saldo por cuenta y deuda por tarjeta, en cada moneda |
| **Pagos fijos** | Lista de la semana y del mes con botón "Pagar" |
| **Reportes** | Gasto por mes, categoría y centro; comparación con el mes anterior |

### 3.2 Módulo Administrador (configuración)

Se accede con una segunda verificación (Face ID / PIN).

| Sección | Pestaña de la BD |
|---|---|
| Bancos e instituciones | 2.INSTITUCIONES |
| Cuentas y tarjetas (saldo inicial, límite, corte, pago) | 3.CUENTAS |
| Categorías (ícono, color, orden, 50/30/20) | 4.CATEGORIAS |
| Centros (para quién o para qué es el gasto) | 5.CENTROS |
| Lugares y países | 6.LUGARES · 9.PAISES |
| Monedas y tipo de cambio | 7.MONEDAS · 8.TIPO_CAMBIO |
| Pagos fijos y avisos | 12.RECURRENTES |
| Reglas automáticas de categoría | 14.REGLAS_CATEGORIZACION |
| Ajustes generales | 11.CONFIG |
| Datos: bitácora, sincronización, respaldo | 17.BITACORA |

## 4. Versión 1 · funciones

| # | Función | Detalle |
|---|---|---|
| F1 | Anotar rápido | Monto, cuenta, categoría; fecha y hora automáticas |
| F2 | Sin internet | Cola local; sincroniza al volver la señal; nunca pierde un registro |
| F3 | Sugerir categoría | Reglas palabra → categoría/centro/lugar; aprende de cada registro |
| F4 | Foto de la boleta | Se guarda en una carpeta de Drive y se une al movimiento (16.ADJUNTOS) |
| F5 | Dividir un ticket | Una compra en varias categorías o centros (15.DIVISIONES) |
| F6 | Saldos | Por cuenta y moneda, desde un saldo inicial a una fecha de corte |
| F7 | Pagos fijos | Lista semanal + notificación en el teléfono días antes |
| F8 | Reportes | Resumen mensual, gráficos por categoría y centro |
| F9 | Historial | Buscar, filtrar, editar, anular; todo queda en la bitácora |
| F10 | Mis listas | Alta y baja de bancos, cuentas, categorías, lugares |
| F11 | Varias monedas | Monto en moneda original + tipo de cambio + equivalente en soles |
| F12 | Seguridad | Google + Face ID / huella / PIN; bloqueo al salir de la app |
| F13 | Dashboards | Tableros de inicio, gasto del mes, tendencias, cuentas y pagos fijos (ver sección 5) |

**Fuera de la versión 1 (versión 2):** dashboards D6–D10, presupuestos con alertas, metas de ahorro, viajes, patrimonio (activos y valoraciones), compras en cuotas, conciliación y cierre de mes, importación de estados de cuenta, contrapartes.

## 5. Dashboards

Diseñados con la skill `dataviz`: primero se elige la forma según la pregunta, el color va al final y se valida para daltonismo, siempre con un solo eje, tooltips al tocar, vista de tabla y modo oscuro propio. Los filtros van en una fila arriba: **periodo · moneda · centro**.

### Versión 1

| Dashboard | Pregunta que responde | Forma |
|---|---|---|
| **D1 · Inicio** | ¿Cómo voy hoy? | Cifra principal: disponible total (soles y dólares por separado). Fila de indicadores: gasto del mes con su variación frente al mes anterior, ingresos del mes y deuda de tarjetas. Línea de gasto acumulado día a día este mes frente al mes anterior. Lista de pagos de la semana |
| **D2 · Gasto del mes** | ¿En qué se me va la plata? | Barras horizontales ordenadas por categoría (de mayor a menor; el resto se agrupa en "Otros" a partir de la 8.ª). Barras por centro (personas y proyectos). Barra segmentada 50/30/20 (necesidad, deseo, ahorro/deuda). Al tocar una barra se ven sus movimientos |
| **D3 · Tendencias** | ¿Estoy gastando más que antes? | Barras mensuales de ingresos y egresos (12 meses, un eje). Mapa de calor categoría × mes. Los meses con registro incompleto se marcan con textura y nota, según 24.CIERRES_MES |
| **D4 · Cuentas** | ¿Cuánto tengo y cuánto debo? | Lista de cuentas con su saldo; tarjetas con barra de uso del límite; totales por moneda |
| **D5 · Pagos fijos** | ¿Qué viene y qué ya pagué? | Lista por fecha (pendiente, pagado, vencido), con icono y texto además del color; total del mes |

### Versión 2

| Dashboard | Forma |
|---|---|
| **D6 · Presupuesto vs real** | Barra de avance por categoría frente a su tope; alerta al pasar el 80 % y el 100 % |
| **D7 · Metas** | Barra de avance por meta y fecha estimada de logro |
| **D8 · Patrimonio** | Cifra principal más línea de patrimonio en el tiempo (activos − deudas) |
| **D9 · Viajes** | Gasto por viaje y por rubro |
| **D10 · Cierre de mes** | Lista de control: cobertura, pendientes, conciliación |

**Reglas de los dashboards:** nunca dos ejes; los colores siguen a la categoría (no cambian al filtrar); los colores de estado (bien, alerta, crítico) solo se usan para estados y siempre van con icono y texto; no hay gráficos de torta (se usan barras); funcionan sin internet con la última copia local.

## 6. Etapas de construcción

| Etapa | Entrega | Prueba del usuario |
|---|---|---|
| 0. Base | PWA instalable, acceso con Google + Face ID, conexión a la BD | Instalar en iPhone y Android, entrar |
| 1. Anotar | F1, F2, F3, F10 | Registrar gastos reales |
| 2. Saldos e historial | F6, F9, F11 | Ver cuentas y movimientos |
| 3. Pagos fijos | F7 | Recibir avisos |
| 4. Reportes y dashboards | F8, F13 (D1–D5) | Ver en qué se gasta |
| 5. Foto y dividir | F4, F5 | Versión 1 completa |

Cada etapa se prueba en iPhone, Android y computadora antes de pasar a la siguiente. En la computadora el menú pasa al costado y los dashboards usan el ancho de la pantalla.

## 7. Pensado para el futuro

| Crecimiento posible | Cómo está previsto |
|---|---|
| Más bancos, cuentas y monedas | Son filas en catálogos; la app no tiene nada "fijo en el código" |
| Nuevas funciones (metas, viajes, cuotas…) | Las pestañas de la versión 2 ya existen en la BD; solo falta la pantalla |
| Más usuarios | Se agrega la pestaña USUARIOS con roles (administrador, registra, solo ve) y la columna CREADO_POR en movimientos |
| Mucho volumen (> 50 000 movimientos) o varios usuarios a la vez | La app accede a los datos a través de una capa intermedia ("adaptador"). Hoy el adaptador es Google Sheets; mañana puede ser Supabase / PostgreSQL sin reescribir las pantallas |
| App en tiendas (App Store / Google Play) | La PWA se puede empaquetar con Capacitor sin rehacerla |
| Cambios de estructura | VERSION_ESQUEMA en 11.CONFIG; la app migra o avisa antes de escribir |
| Funciones activables | Interruptores de funciones en 11.CONFIG para encender módulos nuevos sin publicar otra app |
| Otros idiomas | Textos de la interfaz separados del código |

## 8. Reglas que no se rompen

1. Los nombres de pestañas y columnas de la BD no cambian; las columnas nuevas van al final.
2. Nada se borra: se anula (ESTADO = ANULADO) o se desactiva (ACTIVA = NO).
3. Cada registro tiene un ID único (UUID) generado en el teléfono.
4. Montos siempre positivos; el sentido lo da TIPO. Una moneda por cuenta.
5. Pagar una tarjeta o pasar dinero entre cuentas propias es TRANSFERENCIA, no gasto.
6. Ningún dato financiero ni credencial se guarda en este repositorio.

## 9. Pendientes del propietario

- Subir la BD a Google Drive y compartir la ruta.
- Cargar el saldo inicial de cada cuenta (etapa 2).
- Activar Firebase para notificaciones (etapa 3, con guía).

## 10. Skills que se usan en cada etapa

Se usan las skills que aportan a cada tarea. Las que no tienen relación con esta app (compras, reservas, GIFs, etc.) no se aplican.

| Etapa | Skills |
|---|---|
| Diseño y plan | `brainstorming`, `pmi-business-analysis`, `writing-plans`, `frontend-design`, `impeccable`, `apple-design` |
| Construcción | `test-driven-development`, `executing-plans`, `systematic-debugging`, `mobile-native`, `gestures`, `animate`, `animation-performance`, `emil-design-eng`, `pick-ui-library` |
| Dashboards | `dataviz`, `spending-review`, `lifestyle-creep`, `finance-budget`, `zero-based-budget`, `net-worth`, `financial-goals`, `emergency-fund`, `monthly-digest`, `year-end-summary` |
| Datos | `smart-categorize`, `smart-split`, `import-transactions`, `month-end-close`, `subscription-audit`, `personal-finance-agent-skill` |
| Calidad y seguridad | `security-review`, `code-review`, `requesting-code-review`, `verification-before-completion`, `break-ui`, `review-animations`, `skill-inspector` |
| Cierre | `finishing-a-development-branch`, `humanizer` (textos de la app) |

## 11. Estado de construcción

| Etapa | Estado |
|---|---|
| 0. Base | ✅ Publicada y probada en iPhone y computadora |
| 1. Anotar (F1, F2, F3, F10) | ✅ Construida: formulario rápido, sin internet con cola de envío, sugerencias por historial y reglas, configuración de bancos, cuentas, categorías, centros, lugares, pagos fijos y reglas |
| 2. Saldos e historial (F6, F9, F11) | ✅ Construida: saldos por cuenta y moneda, "fijar saldo", historial con búsqueda y filtros, editar y anular con bitácora, tipo de cambio |
| 3. Pagos fijos (F7) | ✅ Construida: lista semanal y mensual, pagar u omitir, aviso al abrir la app y número en el ícono. ⏳ Pendiente: avisos con la app cerrada (requiere Firebase) |
| 4. Reportes y dashboards (F8, F13 D1–D5) | ✅ Construida |
| 5. Foto y dividir (F4, F5) | ⏳ Pendiente |
