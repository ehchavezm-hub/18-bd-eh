import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './ui/styles.css';
import './ui/apple.css';
import { aplicarDiscreto } from './features/home/HomeScreen';

// Anti-clickjacking: la app nunca debe mostrarse dentro de otra página (iframe).
// GitHub Pages no permite la cabecera frame-ancestors, así que se impide desde aquí.
const enMarco = (() => { try { return window.top !== window.self; } catch { return true; } })();

if (enMarco) {
  document.body.textContent = 'Por seguridad, Mis Finanzas no puede abrirse dentro de otra página.';
  try { window.top!.location.href = window.self.location.href; } catch { /* el navegador lo impide */ }
} else {
  aplicarDiscreto();
  registerSW({ immediate: true });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
