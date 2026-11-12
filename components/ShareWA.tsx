"use client";

/** Compartir por WhatsApp: el texto y el enlace (a la página con el gráfico, o a un PDF). */
export default function ShareWA({ text, url, hash, label = "WhatsApp" }: { text: string; url?: string; hash?: string; label?: string }) {
  const open = () => {
    const link = url ?? `${window.location.origin}${window.location.pathname}${hash ? `#${hash}` : ""}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${link}`)}`, "_blank", "noopener");
  };
  return (
    <button type="button" className="share-wa" onClick={open} title="WhatsApp" aria-label={`${label}: ${text}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.2Z"/></svg>
      {label}
    </button>
  );
}
