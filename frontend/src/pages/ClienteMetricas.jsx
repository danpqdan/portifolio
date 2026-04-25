import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/cliente.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Em producao: o nginx do host intercepta /cliente/metricas/* via auth_request
 * e faz proxy direto pro Grafana. Este componente so e renderizado em dev local
 * (sem nginx) — valida sessao via /api/cliente/auth/me e mostra um placeholder
 * com link pro Grafana local.
 */
export default function ClienteMetricas() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [estado, setEstado] = useState('verificando');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/cliente/auth/me`, {
          credentials: 'include',
        });
        if (cancelado) return;
        if (r.status === 401) {
          navigate('/cliente/login?expirado=1', { replace: true });
          return;
        }
        if (r.ok) {
          setUser(await r.json());
          setEstado('autenticado');
          return;
        }
        setEstado('erro');
      } catch {
        if (!cancelado) setEstado('erro');
      }
    })();
    return () => { cancelado = true; };
  }, [navigate]);

  if (estado === 'verificando') {
    return (
      <div className="cliente-metricas-loading">
        <div className="cliente-metricas-spinner" aria-hidden="true" />
        <p>Validando sessao…</p>
      </div>
    );
  }

  if (estado === 'erro') {
    return (
      <div className="cliente-metricas-loading">
        <p>Nao foi possivel validar sua sessao.</p>
        <a href="/cliente/login" style={{ color: '#a855f7' }}>Tentar novamente</a>
      </div>
    );
  }

  return (
    <div className="cliente-metricas-loading">
      <p>Sessao ativa para <strong>{user?.email}</strong> ({user?.papel}).</p>
      <p style={{ opacity: 0.7, fontSize: '0.875rem', maxWidth: 480 }}>
        Em producao, o nginx redirecionaria voce direto pro Grafana embedado neste path.
        Em dev local, abra o Grafana em outra aba para inspecionar.
      </p>
      <a href="http://localhost:3001" target="_blank" rel="noreferrer noopener"
         style={{ color: '#a855f7' }}>
        Abrir Grafana em nova aba →
      </a>
      <button
        onClick={async () => {
          await fetch(`${API_BASE}/api/cliente/auth/logout`, {
            method: 'POST', credentials: 'include',
          });
          navigate('/cliente/login', { replace: true });
        }}
        style={{
          marginTop: 24, padding: '10px 20px', background: 'transparent',
          border: '1px solid rgba(248,250,252,0.2)', color: 'rgba(248,250,252,0.7)',
          borderRadius: 8, cursor: 'pointer', font: 'inherit',
        }}
      >
        Sair
      </button>
    </div>
  );
}
