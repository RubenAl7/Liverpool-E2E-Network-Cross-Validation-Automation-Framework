import { test, expect } from '../src/fixtures/test.fixture';
import { PRIMARY_SEARCH_SCENARIO } from '../src/config/test-data';
import { DataCrossValidator } from '../src/services/DataCrossValidator';

test.describe('Parte 1 y Parte 2: Flujo E2E de Búsqueda y Validación Cruzada de Red', () => {
  test(
    `Búsqueda de "${PRIMARY_SEARCH_SCENARIO.searchTerm}", filtro "${PRIMARY_SEARCH_SCENARIO.colorFilter}", orden "${PRIMARY_SEARCH_SCENARIO.sortOptionText}" y validación contra BFF (/api/plp/search)`,
    async ({ homePage, searchResultsPage, plpInterceptor }, testInfo) => {
      // 1. Navegar hasta Liverpool y buscar el término objetivo
      await test.step('1. Navegar a Liverpool y ejecutar búsqueda de producto', async () => {
        await homePage.navigate();
        await homePage.searchProduct(PRIMARY_SEARCH_SCENARIO.searchTerm);
      });

      // 2. Filtrar por color "Blanco" interceptando la respuesta del servicio BFF
      await test.step(`2. Filtrar resultados por color: "${PRIMARY_SEARCH_SCENARIO.colorFilter}"`, async () => {
        const filterPayload = await searchResultsPage.filterByColor(
          PRIMARY_SEARCH_SCENARIO.colorFilter,
          plpInterceptor
        );
        expect(
          filterPayload.products.length,
          'La respuesta de red tras filtrar por color debe contener productos'
        ).toBeGreaterThan(0);
      });

      // 3. Ordenar por precio de menor a mayor ("Menor precio") interceptando la respuesta final
      await test.step(`3. Ordenar por precio: "${PRIMARY_SEARCH_SCENARIO.sortOptionText}"`, async () => {
        const sortPayload = await searchResultsPage.sortByOption(
          PRIMARY_SEARCH_SCENARIO.sortOptionText,
          plpInterceptor
        );
        expect(
          sortPayload.products.length,
          'La respuesta de red tras ordenar por precio debe contener productos'
        ).toBeGreaterThan(0);
      });

      // 4. Extraer nombre y precio de los primeros 5 resultados en la UI
      const uiProducts = await test.step(
        `4. Extraer los primeros ${PRIMARY_SEARCH_SCENARIO.resultsToExtract} productos de la interfaz de usuario`,
        async () => {
          const products = await searchResultsPage.extractTopProducts(
            PRIMARY_SEARCH_SCENARIO.resultsToExtract
          );

          expect(
            products.length,
            `Se esperaban exactamente ${PRIMARY_SEARCH_SCENARIO.resultsToExtract} productos en la UI`
          ).toBe(PRIMARY_SEARCH_SCENARIO.resultsToExtract);

          for (const product of products) {
            expect(product.name.length, 'El nombre del producto en UI no debe estar vacío').toBeGreaterThan(0);
            expect(product.displayedPrice, 'El precio del producto en UI debe ser mayor a 0').toBeGreaterThan(0);
          }

          // Verificar matemáticamente que el ordenamiento "Menor precio" (ascendente) se aplicó en la UI
          for (let i = 0; i < products.length - 1; i++) {
            expect(
              products[i].displayedPrice,
              `El producto #${i + 1} ($${products[i].displayedPrice}) debe tener un precio menor o igual al producto #${i + 2} ($${products[i + 1].displayedPrice})`
            ).toBeLessThanOrEqual(products[i + 1].displayedPrice);
          }

          return products;
        }
      );

      // 5. Validar cruzadamente los resultados de la UI contra la respuesta de red interceptada
      await test.step('5. Interceptar respuesta de red, validar cruzadamente y registrar discrepancias', async () => {
        const interceptedApiProducts = await plpInterceptor.getLatestProductsWithSsrFallback();

        expect(
          interceptedApiProducts.length,
          'Debe haberse interceptado al menos una respuesta válida de /api/plp/search'
        ).toBeGreaterThan(0);

        const validationReport = DataCrossValidator.validate(
          uiProducts,
          interceptedApiProducts,
          PRIMARY_SEARCH_SCENARIO.colorFilter
        );

        // Imprimir resultados de Parte 1 y reporte de discrepancias de Parte 2 en consola
        DataCrossValidator.logValidationSummary(
          PRIMARY_SEARCH_SCENARIO.searchTerm,
          uiProducts,
          validationReport
        );

        // Adjuntar evidencia estructurada al reporte HTML de Playwright (Parte 3)
        await testInfo.attach('ui-vs-api-cross-validation-report.json', {
          body: JSON.stringify(validationReport, null, 2),
          contentType: 'application/json',
        });

        if (validationReport.discrepancies.length > 0) {
          await testInfo.attach('discrepancies-ui-vs-api.json', {
            body: JSON.stringify(validationReport.discrepancies, null, 2),
            contentType: 'application/json',
          });
        }

        // Afirmación requerida: al menos 3 de los 5 resultados de la UI aparecen en la respuesta interceptada
        expect(
          validationReport.matchedCount,
          `Se requiere que al menos ${PRIMARY_SEARCH_SCENARIO.minCrossValidatedMatches} de los ${PRIMARY_SEARCH_SCENARIO.resultsToExtract} productos de la UI coincidan con la respuesta de red interceptada`
        ).toBeGreaterThanOrEqual(PRIMARY_SEARCH_SCENARIO.minCrossValidatedMatches);
      });
    }
  );
});
