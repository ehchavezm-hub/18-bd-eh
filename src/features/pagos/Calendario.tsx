/**
 * "Agregar a mi calendario": los pagos fijos pasan al calendario del teléfono, que avisa aunque la app esté cerrada.
 * El archivo se genera en el teléfono; no pasa por ningún servidor.
 */
import { useState } from 'react';
import { useData } from '../../data/useData';
import { calendarioPagos } from '../../domain/ics';
import { todayIso } from '../../domain/dates';
import { toast } from '../../ui/kit';

const ES_IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function RecordatoriosCalendario() {
  const d = useData();
  const [montos, setMontos] = useState(false);
  const activos = d.recurrentes.filter((r) => r.activo && r.tipo !== 'INGRESO').length;

  async function exportar() {
    const { ics, eventos } = calendarioPagos(d.recurrentes, todayIso(), { incluirMontos: montos, urlApp: location.origin + import.meta.env.BASE_URL });
    if (eventos === 0) { toast('No hay pagos fijos activos para agregar.'); return; }
    const archivo = new File([ics], 'pagos-fijos.ics', { type: 'text/calendar' });
    const url = URL.createObjectURL(archivo);
    try {
      if (ES_IOS) {
        // En iPhone, abrir el archivo muestra la hoja de Calendario con "Agregar todo".
        window.location.assign(url);
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = 'pagos-fijos.ics'; document.body.appendChild(a); a.click(); a.remove();
        toast('Abre el archivo descargado para agregarlo a tu calendario.');
      }
    } finally { setTimeout(() => URL.revokeObjectURL(url), 60_000); }
  }

  return (
    <section className="card stack">
      <h2>Avisos con la app cerrada</h2>
      <p className="muted">Agrega tus {activos} pagos fijos al calendario del teléfono. El calendario te avisará a las 9:00 los días antes que configuraste en cada pago, y el mismo día, aunque no abras la app.</p>
      <label className="check"><input type="checkbox" checked={montos} onChange={(e) => setMontos(e.target.checked)} /> Mostrar montos en el aviso (se verán en la pantalla bloqueada)</label>
      <button className="btn" onClick={() => void exportar()} disabled={activos === 0}>Agregar a mi calendario</button>
      <p className="muted small">Si cambias tus pagos fijos, vuelve a agregarlo (borra antes el calendario anterior para no duplicar). En iPhone, elige el calendario «En mi iPhone» si no quieres que se sincronice con iCloud.</p>
    </section>
  );
}
