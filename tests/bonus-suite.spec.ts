import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../src/fixtures/test.fixture';
import {
  DATA_DRIVEN_SCENARIOS,
  ENV_CONFIG,
  PRIMARY_SEARCH_SCENARIO,
} from '../src/config/test-data';
import { LIVERPOOL_SELECTORS } from '../src/config/selectors';
import { DataCrossValidator } from '../src/services/DataCrossValidator';

test.describe('Puntos de Bonificación: Rendimiento, Accesibilidad, Regresión Visual y Data-Driven', () => {
  test(
    `Bonificación 1, 2 y 3: Verificación de Rendimiento (< ${ENV_CONFIG.performanceSlaMs / 1000}s), Accesibilidad (axe-core) y Regresión Visual`,
    async ({ page, homePage, searchResultsPage }, testInfo) => {
      await homePage.navigate();

      // Bonificación #3: Verificación de rendimiento (afirmar que la búsqueda carga en menos de N segundos)
      const searchLoadMs = await test.step(
        `Bonificación #3: Medir tiempo de carga de resultados de búsqueda (SLA < ${ENV_CONFIG.performanceSlaMs} ms)`,
        async () => {
          const elapsedMs = await homePage.searchProduct(PRIMARY_SEARCH_SCENARIO.searchTerm);

          const navMetrics = await page.evaluate(() => {
            const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
            if (!nav) return null;
            return {
              ttfbMs: Math.round(nav.responseStart - nav.requestStart),
              domInteractiveMs: Math.round(nav.domInteractive),
              domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
            };
          });

          console.log('\n================================================================================');
          console.log(' BONIFICACIÓN #3: MÉTRICAS DE RENDIMIENTO EN PÁGINA DE RESULTADOS');
          console.log('================================================================================');
          console.log(`- Tiempo E2E de búsqueda y renderizado PLP: ${elapsedMs} ms (SLA máximo: ${ENV_CONFIG.performanceSlaMs} ms)`);
          if (navMetrics) {
            console.log(`- Navigation Timing TTFB                  : ${navMetrics.ttfbMs} ms`);
            console.log(`- Navigation Timing DOM Interactive       : ${navMetrics.domInteractiveMs} ms`);
            console.log(`- Navigation Timing DOMContentLoaded      : ${navMetrics.domContentLoadedMs} ms`);
          }
          console.log('================================================================================\n');

          expect(
            elapsedMs,
            `La página de resultados de búsqueda debe cargar en menos de ${ENV_CONFIG.performanceSlaMs} ms`
          ).toBeLessThan(ENV_CONFIG.performanceSlaMs);

          return elapsedMs;
        }
      );

      expect(searchLoadMs).toBeGreaterThan(0);

      // Bonificación #2: Comprobación de accesibilidad con axe-core e informe de infracciones
      await test.step(
        'Bonificación #2: Ejecutar análisis de accesibilidad WCAG con axe-core e informar infracciones',
        async () => {
          const axeResults = await new AxeBuilder({ page })
            .include(LIVERPOOL_SELECTORS.plp.searchPageContainer)
            .analyze();

          const violationsSummary = axeResults.violations.map((v) => ({
            Regla: v.id,
            Impacto: v.impact || 'unknown',
            NodosAfectados: v.nodes.length,
            Descripción: v.help.slice(0, 65),
          }));

          console.log('\n================================================================================');
          console.log(
            ` BONIFICACIÓN #2: REPORTE DE ACCESIBILIDAD AXE-CORE (${axeResults.violations.length} reglas con hallazgos)`
          );
          console.log('================================================================================');
          if (violationsSummary.length > 0) {
            console.table(violationsSummary);
          } else {
            console.log('  [OK] Cero infracciones de accesibilidad detectadas.');
          }
          console.log(`- Reglas superadas satisfactoriamente: ${axeResults.passes.length}`);
          console.log('================================================================================\n');

          await testInfo.attach('axe-accessibility-violations.json', {
            body: JSON.stringify(
              {
                url: page.url(),
                timestamp: axeResults.timestamp,
                passesCount: axeResults.passes.length,
                violationsCount: axeResults.violations.length,
                violations: axeResults.violations,
              },
              null,
              2
            ),
            contentType: 'application/json',
          });

          // Afirmamos que el motor axe-core auditó efectivamente el árbol DOM de la página de resultados
          expect(axeResults.passes.length).toBeGreaterThan(0);
        }
      );

      // Bonificación #1: Regresión visual con comparación de captura de pantalla y dimensiones normalizadas Cross-OS
      await test.step(
        'Bonificación #1: Comparación de captura de pantalla para regresión visual de la barra de control de búsqueda',
        async () => {
          const sortControlElement = page.locator(LIVERPOOL_SELECTORS.plp.sortDropdownButton).first();
          await sortControlElement.scrollIntoViewIfNeeded();
          await expect(sortControlElement).toBeVisible();

          // Normalizar dimensiones fijas del contenedor (240x40) para evitar diferencias de 1-2px por fuentes entre Windows y Linux CI
          await sortControlElement.evaluate((el: HTMLElement) => {
            el.style.width = '240px';
            el.style.minWidth = '240px';
            el.style.maxWidth = '240px';
            el.style.height = '40px';
            el.style.minHeight = '40px';
            el.style.maxHeight = '40px';
            el.style.boxSizing = 'border-box';
          });

          // Comparamos el componente estructural de ordenamiento de la PLP contra el snapshot base
          await expect(sortControlElement).toHaveScreenshot('plp-sorting-control.png', {
            maxDiffPixelRatio: 0.25,
          });
        }
      );
    }
  );

  // Bonificación #5: Pruebas basadas en datos (Data-Driven Testing) para múltiples consolas
  for (const scenario of DATA_DRIVEN_SCENARIOS) {
    test(
      `Bonificación #5 [Data-Driven]: Búsqueda parametrizada para "${scenario.searchTerm}" (Color: ${scenario.colorFilter})`,
      async ({ homePage, searchResultsPage, plpInterceptor }, testInfo) => {
        await homePage.navigate();
        await homePage.searchProduct(scenario.searchTerm);

        await searchResultsPage.filterByColor(scenario.colorFilter, plpInterceptor);
        await searchResultsPage.sortByOption(scenario.sortOptionText, plpInterceptor);

        const uiProducts = await searchResultsPage.extractTopProducts(scenario.resultsToExtract);
        expect(uiProducts.length).toBe(scenario.resultsToExtract);

        const apiProducts = plpInterceptor.getLatestProducts();
        const report = DataCrossValidator.validate(uiProducts, apiProducts, scenario.colorFilter);

        DataCrossValidator.logValidationSummary(scenario.searchTerm, uiProducts, report);

        await testInfo.attach(`cross-validation-${scenario.id}.json`, {
          body: JSON.stringify(report, null, 2),
          contentType: 'application/json',
        });

        expect(report.matchedCount).toBeGreaterThanOrEqual(scenario.minCrossValidatedMatches);
      }
    );
  }
});
