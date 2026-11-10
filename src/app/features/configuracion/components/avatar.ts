/** Iniciales de un nombre: "María Pérez" → "MP". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const dos = partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[partes.length - 1][0];
  return dos.toUpperCase();
}

/** Uno de cuatro tonos para el avatar, siempre el mismo para el mismo texto. */
export function tonoAvatar(texto: string): 'teal' | 'azul' | 'ambar' | 'lila' {
  let suma = 0;
  for (const c of texto) suma = (suma + c.charCodeAt(0)) % 997;
  return (['teal', 'azul', 'ambar', 'lila'] as const)[suma % 4];
}
