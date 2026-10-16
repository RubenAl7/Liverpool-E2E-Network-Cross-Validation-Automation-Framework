import {
  ApiProduct,
  CrossValidationReport,
  UiProduct,
  ValidationDiscrepancy,
} from '../types/product.types';

/**
 * Servicio de Validación Cruzada entre UI y Capa de Red (Parte 2).
 * Compara los productos extraídos del DOM contra los registros interceptados en `/api/plp/search`,
 * detectando discrepancias reales de nombre, precio, formato DOM y metadatos de filtrado.
 */
export class DataCrossValidator {
  /**
   * Ejecuta la validación cruzada entre los resultados de la interfaz de usuario y la respuesta de red.
   */
  public static validate(
    uiProducts: UiProduct[],
    apiProducts: ApiProduct[],
    expectedColorFilter?: string
  ): CrossValidationReport {
    const matchedProducts: CrossValidationReport['matchedProducts'] = [];
    const discrepancies: ValidationDiscrepancy[] = [];

    for (const uiProd of uiProducts) {
      // 1. Buscar por ID exacto (extraído de data-testid="{productId}-card") o por nombre normalizado
      let apiMatch = apiProducts.find((api) => api.id === uiProd.id);
      let matchStrategy: 'product_id' | 'normalized_name' = 'product_id';

      if (!apiMatch) {
        const normUiName = this.normalizeText(uiProd.name);
        apiMatch = apiProducts.find((api) => this.normalizeText(api.name) === normUiName);
        matchStrategy = 'normalized_name';
      }

      if (!apiMatch) {
        discrepancies.push({
          productId: uiProd.id,
          uiName: uiProd.name,
          field: 'missing_in_api',
          uiValue: `${uiProd.name} ($${uiProd.displayedPrice.toFixed(2)})`,
          apiValue: 'NO_ENCONTRADO',
          description: `El producto visible en UI (ID: ${uiProd.id}) no figura en los registros de la respuesta interceptada.`,
        });
        continue;
      }

      matchedProducts.push({
        uiProduct: uiProd,
        apiProduct: apiMatch,
        matchStrategy,
      });

      // 2. Verificar discrepancias de Nombre (exacto vs normalizado)
      if (uiProd.name !== apiMatch.name) {
        discrepancies.push({
          productId: uiProd.id,
          uiName: uiProd.name,
          field: 'name',
          uiValue: uiProd.name,
          apiValue: apiMatch.name,
          description: `Diferencia de texto/espaciado en nombre entre el nodo <h3> del DOM y 'title' en el JSON de la API.`,
        });
      }

      // 3. Verificar discrepancias de Precio (precio efectivo mostrado vs promoPrice/salePrice en API)
      const priceDiff = Math.abs(uiProd.displayedPrice - apiMatch.effectivePrice);
      if (priceDiff > 0.01) {
        discrepancies.push({
          productId: uiProd.id,
          uiName: uiProd.name,
          field: 'price',
          uiValue: uiProd.displayedPrice,
          apiValue: apiMatch.effectivePrice,
          description: `El precio mostrado en UI ($${uiProd.displayedPrice.toFixed(2)}) difiere del precio efectivo en API ($${apiMatch.effectivePrice.toFixed(2)}).`,
        });
      }

      // 4. Detectar discrepancia semántica real en la API de Liverpool:
      // El campo `priceInfo.salePrice` a menudo conserva el `listPrice` sin descuento mientras la UI muestra `promoPrice.price`.
      if (
        typeof apiMatch.salePrice === 'number' &&
        Math.abs(apiMatch.salePrice - uiProd.displayedPrice) > 0.01
      ) {
        discrepancies.push({
          productId: uiProd.id,
          uiName: uiProd.name,
          field: 'price',
          uiValue: `$${uiProd.displayedPrice.toFixed(2)} (discounted UI)`,
          apiValue: `salePrice=${apiMatch.salePrice} | promoPrice=${apiMatch.promoPrice ?? 'N/A'}`,
          description: `Discrepancia de contrato en API: 'priceInfo.salePrice' (${apiMatch.salePrice}) no refleja el descuento activo; la UI toma 'priceInfo.promoPrice.price' (${apiMatch.promoPrice}) y formatea decimales (${uiProd.rawDisplayedPrice}).`,
        });
      }

      // 5. Detectar discrepancia de formato CSS/DOM (`innerText` oculta el punto decimal con clase `.invisible`)
      if (
        uiProd.rawInnerTextPrice &&
        !uiProd.rawInnerTextPrice.includes('.') &&
        uiProd.rawDisplayedPrice.includes('.')
      ) {
        discrepancies.push({
          productId: uiProd.id,
          uiName: uiProd.name,
          field: 'dom_formatting',
          uiValue: `innerText="${uiProd.rawInnerTextPrice}" / textContent="${uiProd.rawDisplayedPrice}"`,
          apiValue: String(apiMatch.effectivePrice),
          description: `El DOM renderiza el punto decimal dentro de '<span class="invisible">.</span>' para superíndice de centavos, provocando que innerText devuelva "${uiProd.rawInnerTextPrice}" sin separador decimal.`,
        });
      }

      // 6. Detectar discrepancias en metadatos del filtro de color (ej. 'Sin color' agrupado bajo '#FFFFFF' Blanco)
      if (
        expectedColorFilter &&
        apiMatch.colorNames.length > 0 &&
        !apiMatch.colorNames.some(
          (c) => this.normalizeText(c) === this.normalizeText(expectedColorFilter)
        )
      ) {
        discrepancies.push({
          productId: uiProd.id,
          uiName: uiProd.name,
          field: 'color_metadata',
          uiValue: `Filtro aplicado: "${expectedColorFilter}"`,
          apiValue: `variantsColor.colorName=${JSON.stringify(apiMatch.colorNames)} (hex=${JSON.stringify(apiMatch.colorHexes)})`,
          description: `El registro fue devuelto bajo el filtro "${expectedColorFilter}" por su hex (${apiMatch.colorHexes.join(', ')}), pero su metadato 'colorName' en API es ${JSON.stringify(apiMatch.colorNames)}.`,
        });
      }
    }

    return {
      totalUiProductsEvaluated: uiProducts.length,
      totalApiProductsIntercepted: apiProducts.length,
      matchedCount: matchedProducts.length,
      matchedProducts,
      discrepancies,
    };
  }

  /**
   * Imprime en consola tanto los productos extraídos de la UI (Parte 1)
   * como el informe detallado de validación cruzada y discrepancias (Parte 2).
   */
  public static logValidationSummary(
    searchTerm: string,
    uiProducts: UiProduct[],
    report: CrossValidationReport
  ): void {
    console.log('\n================================================================================');
    console.log(` PARTE 1: PRIMEROS ${uiProducts.length} RESULTADOS EN UI PARA "${searchTerm.toUpperCase()}"`);
    console.log('================================================================================');
    console.table(
      uiProducts.map((p, index) => ({
        '#': index + 1,
        ID: p.id,
        Marca: p.brand,
        Nombre: p.name,
        'Precio UI': p.rawDisplayedPrice,
        'Precio Numérico': p.displayedPrice,
        'Precio Original': p.originalPrice ? `$${p.originalPrice.toFixed(2)}` : 'Sin descuento',
      }))
    );

    console.log('\n================================================================================');
    console.log(' PARTE 2: VALIDACIÓN CRUZADA UI vs RESPUESTA DE RED (/api/plp/search)');
    console.log('================================================================================');
    console.log(`- Productos evaluados en UI         : ${report.totalUiProductsEvaluated}`);
    console.log(`- Registros interceptados en Red    : ${report.totalApiProductsIntercepted}`);
    console.log(`- Coincidencias validadas (UI ∩ API): ${report.matchedCount}/${report.totalUiProductsEvaluated}`);

    if (report.matchedProducts.length > 0) {
      console.log('\nDetalle de Coincidencias (UI vs API):');
      console.table(
        report.matchedProducts.map(({ uiProduct, apiProduct, matchStrategy }) => ({
          ID: uiProduct.id,
          Estrategia: matchStrategy,
          'Nombre UI': uiProduct.name.slice(0, 42),
          'Nombre API': apiProduct.name.slice(0, 42),
          'Precio UI': `$${uiProduct.displayedPrice.toFixed(2)}`,
          'API promoPrice': apiProduct.promoPrice ?? 'N/A',
          'API salePrice': apiProduct.salePrice ?? 'N/A',
        }))
      );
    }

    console.log(`\nDiscrepancias / Observaciones entre UI y API (${report.discrepancies.length} detectadas):`);
    if (report.discrepancies.length === 0) {
      console.log('  [OK] Sin discrepancias entre el DOM y el payload de la red.');
    } else {
      for (const [idx, d] of report.discrepancies.entries()) {
        console.log(
          `  [${idx + 1}] [${d.field.toUpperCase()}] Producto ${d.productId} ("${d.uiName}"):\n` +
            `      • Valor UI : ${d.uiValue}\n` +
            `      • Valor API: ${d.apiValue}\n` +
            `      • Detalle  : ${d.description}`
        );
      }
    }
    console.log('================================================================================\n');
  }

  private static normalizeText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
