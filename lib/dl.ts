/** Enlace de descarga que pasa por el contador propio (/api/dl) antes de ir al archivo. */
export const dl = (url: string, nombre: string) => `/api/dl?f=${encodeURIComponent(nombre)}&u=${encodeURIComponent(url)}`;
