import { RecordatoriosCalendario } from './Calendario';
import { useMemo, useState } from 'react';
import { useData } from '../../data/useData';
import { save } from '../../data/store';
import { ocurrencias, type Ocurrencia } from '../../domain/recurring';
import { addDays, monthKey, monthLong, nowStamp, nowTime, todayIso } from '../../domain/dates';
import { dinero } from '../../domain/format';
import { Empty, Segmented, toast } from '../../ui/kit';
import { PagosLista } from '../home/HomeScreen';
import type { Prefill } from '../anotar/MovementForm';
import { notificationsSupported, enableNotifications, notificationsEnabled } from './notify';

/** D5 · Pagos fijos: ¿qué viene y qué ya pagué? */
export function PaymentsScreen({ onPagar, device, onConfigurar, onAnotar }: { onPagar: (p: Prefill) => void; device: string; onConfigurar: () => void; onAnotar: () => void }) {
  const d = useData();
  const [vista, setVista] = useState<'semana' | 'mes'>('semana');
  const [notif, setNotif] = useState(notificationsEnabled());
  const hoy = todayIso();
  const mes = monthKey(hoy);

  const items = useMemo(() => {
    if (vista === 'semana') return ocurrencias(d.recurrentes, d.movs, addDays(hoy, -14), addDays(hoy, 7), hoy).filter((o) => o.estado !== 'PAGADO' || o.fecha >= addDays(hoy, -7));
    return ocurrencias(d.recurrentes, d.movs, `${mes}-01`, `${mes}-31`, hoy);
  }, [d, vista, hoy, mes]);

  const totalMes = useMemo(() => ocurrencias(d.recurrentes, d.movs, `${mes}-01`, `${mes}-31`, hoy)
    .reduce((acc, o) => { const k = o.recurrente.moneda; acc[k] = (acc[k] ?? 0) + (o.movimiento?.monto ?? o.recurrente.montoEstimado ?? 0); return acc; }, {} as Record<string, number>), [d, mes, hoy]);
  const activos = d.recurrentes.filter((r) => r.activo).length;
  const inactivos = d.recurrentes.length - activos;

  async function omitir(o: Ocurrencia) {
    if (!confirm(`¿Marcar "${o.recurrente.descripcion}" como no pagado este periodo?`)) return;
    await save('MOVIMIENTOS', {
      MOVIMIENTO_ID: crypto.randomUUID(), FECHA: o.fecha, HORA: nowTime(), TIPO: o.recurrente.tipo, ESTADO: 'OMITIDO', DESCRIPCION: o.recurrente.descripcion,
      CUENTA_ID: o.recurrente.cuentaId ?? '', MONTO: o.recurrente.montoEstimado ?? 0, MONEDA: o.recurrente.moneda, CATEGORIA_ID: o.recurrente.categoriaId ?? '',
      CENTRO_ID: o.recurrente.centroId ?? '', RECURRENTE_ID: o.recurrente.id, CONCILIADO: 'NO', ORIGEN: 'APP', CREADO_EN: nowStamp(), ACTUALIZADO_EN: nowStamp(),
      ELIMINADO: 'NO', DISPOSITIVO: device, EVIDENCIA: 'REPORTADO', NOTAS: 'Pago omitido',
    });
    toast('Marcado como omitido');
  }

  return (
    <main className="screen">
      <div className="row"><h1>Pagos fijos</h1></div>
      <div className="actions-row">
        <button className="btn" onClick={onConfigurar}>+ Agregar o activar pagos fijos</button>
        <button className="btn secondary" onClick={onAnotar}>Anotar un gasto</button>
      </div>
      <div className="card stack">
        <Segmented value={vista} onChange={setVista} options={[{ value: 'semana', label: 'Esta semana' }, { value: 'mes', label: `Todo ${monthLong(mes).split(' ')[0]}` }]} />
        <p className="muted small">{activos} pagos fijos activos · total del mes: {Object.entries(totalMes).map(([m, v]) => dinero(v, m)).join(' + ') || '—'}</p>
      </div>
      <section className="card">
        {activos === 0 ? (
          <div className="stack">
            <Empty>No tienes pagos fijos activos{inactivos > 0 ? `. Hay ${inactivos} pagos fijos de tu historial (luz, teléfono, internet, pensión…) esperando que actives los que sigues pagando` : ''}.</Empty>
            <button className="btn secondary" onClick={onConfigurar}>{inactivos > 0 ? 'Revisar y activar mis pagos fijos' : 'Crear mi primer pago fijo'}</button>
          </div>
        ) : items.length === 0 ? <Empty>Nada pendiente en este periodo.</Empty> : <PagosLista items={items} onPagar={onPagar} onOmitir={omitir} />}
      </section>
      {notificationsSupported() && (
        <section className="card stack">
          <h2>Avisos al abrir la app</h2>
          {notif ? <p className="muted">Avisos activados en este dispositivo: al abrir la app te avisará de los pagos próximos y vencidos, y el ícono mostrará cuántos hay.</p> : (
            <>
              <p className="muted">Recibe un aviso de los pagos próximos y vencidos. En iPhone, primero instala la app (Compartir → Añadir a pantalla de inicio).</p>
              <button className="btn secondary" onClick={async () => setNotif(await enableNotifications())}>Activar avisos</button>
            </>
          )}
        </section>
      )}
      {activos > 0 && <RecordatoriosCalendario />}
    </main>
  );
}
