/** "Acuña" → "acuna": para comparar sin tildes ni mayúsculas. */
export const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Búsqueda de las listas: cada palabra escrita debe aparecer en el texto, en cualquier orden y sin importar
 * tildes ni mayúsculas. "perez jose" encuentra "José Pérez". Una búsqueda vacía coincide con todo.
 */
export function coincide(texto: string, busqueda: string): boolean {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const base = normalizar(texto);
  return palabras.every((p) => base.includes(p));
}
