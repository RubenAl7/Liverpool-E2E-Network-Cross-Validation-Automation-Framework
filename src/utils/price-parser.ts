/**
 * Convierte representaciones de precio del DOM o API de Liverpool en un número flotante exacto.
 *
 * Contempla las particularidades reales del frontend de Liverpool:
 * 1. Precios con punto decimal explícito desde `textContent` (ej. `"$305.50"`, `"$11,999.00"` -> `305.5`, `11999`).
 * 2. Precios extraídos con `innerText` donde los centavos en superíndice (`<sup>00</sup>` o `<span class="invisible">.</span>`)
 *    quedan concatenados tras grupos de miles separados por coma (ej. `"$11,99900"` -> `11999.00`).
 * 3. Valores numéricos directos provenientes del JSON de `/api/plp/search`.
 */
export function parseLiverpoolPrice(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (!raw) {
    return 0;
  }

  const cleaned = String(raw).replace(/\s+/g, '').trim();
  if (!cleaned) {
    return 0;
  }

  // Caso 1: Contiene punto decimal explícito (ej. "$305.50" o "$11,999.00")
  if (cleaned.includes('.')) {
    const normalized = cleaned.replace(/[^0-9.]/g, '');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // Caso 2: Centavos en superíndice concatenados sin punto tras coma de miles (ej. "$11,99900")
  const supCentsMatch = cleaned.match(/(\d{1,3}(?:,\d{3})+?)(\d{2})$/);
  if (supCentsMatch) {
    const integerPart = supCentsMatch[1].replace(/,/g, '');
    const centsPart = supCentsMatch[2];
    const parsed = Number.parseFloat(`${integerPart}.${centsPart}`);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // Caso 3: Entero con o sin separador de miles (ej. "$1,299" o "$611")
  const digitsOnly = cleaned.replace(/[^0-9]/g, '');
  const parsed = Number.parseFloat(digitsOnly);
  return Number.isFinite(parsed) ? parsed : 0;
}
