/** Se muestra al instante al cambiar de página mientras llegan los datos (navegación más fluida). */
export default function Loading() {
  return (
    <div className="loading" aria-busy="true" aria-live="polite">
      <div className="sk sk-title" />
      <div className="sk sk-sub" />
      <div className="grid kpis" style={{ marginTop: 20 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="card sk-card"><div className="sk sk-line" /><div className="sk sk-big" /></div>)}
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        {[0, 1].map((i) => <div key={i} className="card sk-card"><div className="sk sk-line" /><div className="sk sk-chart" /></div>)}
      </div>
    </div>
  );
}
