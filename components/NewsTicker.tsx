/** Barra de titulares que se desplaza de derecha a izquierda sin parar (se detiene al pasar el cursor). */
export default function NewsTicker({ items, label }: { items: { t: string; url: string; s: string }[]; label: string }) {
  const row = items.map((n, i) => (
    <a key={i} href={n.url} target="_blank" rel="noreferrer"><b>{n.s}</b> {n.t}</a>
  ));
  // la lista va dos veces para que el desplazamiento sea continuo
  const secs = Math.max(40, items.length * 7);
  return (
    <div className="ticker" role="marquee" aria-label={label}>
      <span className="ticker-label">{label}</span>
      <div className="ticker-track"><div className="ticker-move" style={{ animationDuration: `${secs}s` }}>{row}{row}</div></div>
    </div>
  );
}
