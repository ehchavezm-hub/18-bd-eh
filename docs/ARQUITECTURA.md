# Arquitectura · Finanzas personales

## Vista general

```
 Teléfono (iPhone / Android)                         Google (cuenta del propietario)
┌────────────────────────────────┐                  ┌──────────────────────────────┐
│ PWA (GitHub Pages)             │   OAuth Google   │ Google Sheets  ← BD (v3)     │
│  ├─ Pantallas (Usuario/Admin)  │ ───────────────▶ │ Google Drive   ← fotos       │
│  ├─ Servicios (reglas, saldos) │   Sheets API     │ Apps Script    ← avisos      │
│  ├─ Adaptador de datos ────────┼─────────────────▶│   (disparador diario)        │
│  └─ Base local (IndexedDB)     │   Drive API      └──────────────┬───────────────┘
│     cola sin internet          │                                 │ Firebase Cloud
└────────────────────────────────┘ ◀───────────────────────────────┘ Messaging (push)
```

- **Sin servidor propio.** Los datos viajan del teléfono a Google con el permiso del propietario.
- **Permisos mínimos.** La app solo puede abrir la hoja de cálculo y la carpeta de fotos que el propietario elija (`drive.file`).

## Capas

| Capa | Responsabilidad | Regla |
|---|---|---|
| Pantallas | Mostrar y capturar datos | No conocen Google Sheets |
| Servicios | Reglas de negocio: saldos, sugerencias, recurrentes, conversión de moneda | No conocen la interfaz |
| Adaptador de datos | Leer y escribir tablas | Hoy: `SheetsAdapter`. Mañana: `SupabaseAdapter` con la misma interfaz |
| Base local | Copia de trabajo y cola de cambios pendientes | Toda escritura pasa primero por aquí |

## Sincronización

1. Cada cambio se guarda en el teléfono con `ACTUALIZADO_EN` y `DISPOSITIVO`.
2. Al haber conexión, la cola se envía a la hoja; se leen los cambios de otros dispositivos.
3. Conflicto en el mismo registro: gana la modificación más reciente y queda constancia en BITACORA.
4. Los borrados son lógicos (`ELIMINADO = SÍ`, `ESTADO = ANULADO`).

## Seguridad

- Acceso con Google Identity Services; el token vive solo en el teléfono.
- Desbloqueo local con WebAuthn (Face ID / huella) o PIN; bloqueo automático al salir.
- Módulo Administrador con verificación adicional.
- Ningún secreto en el código ni en el repositorio.

## Esquema

La estructura de la BD (tablas, campos, tipos y relaciones) está en la pestaña `29.DICCIONARIO` del archivo de Google Sheets. `11.CONFIG → VERSION_ESQUEMA` indica la versión vigente (3).
