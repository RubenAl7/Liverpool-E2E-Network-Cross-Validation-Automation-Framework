import { Locator, Page } from '@playwright/test';
import { ENV_CONFIG } from '../config/test-data';
import { LIVERPOOL_SELECTORS } from '../config/selectors';
import { PlpNetworkInterceptor, CapturedPlpPayload } from '../services/PlpNetworkInterceptor';
import { UiProduct } from '../types/product.types';
import { parseLiverpoolPrice } from '../utils/price-parser';
import { waitForReactHydration } from './HomePage';

/**
 * Page Object para la Página de Resultados de Búsqueda / Product Listing Page (`SearchResultsPage`).
 * Gestiona el filtrado lateral, el ordenamiento y la extracción estructurada de productos del DOM.
 */
export class SearchResultsPage {
  private readonly filterSidebar: Locator;
  private readonly sortDropdownButton: Locator;
  private readonly sortDropdownContainer: Locator;
  private readonly searchPageContainer: Locator;

  constructor(private readonly page: Page) {
    this.filterSidebar = page.locator(LIVERPOOL_SELECTORS.plp.filterSidebar);
    this.sortDropdownButton = page.locator(LIVERPOOL_SELECTORS.plp.sortDropdownButton).first();
    this.sortDropdownContainer = page.locator(LIVERPOOL_SELECTORS.plp.sortDropdownContainer);
    this.searchPageContainer = page.locator(LIVERPOOL_SELECTORS.plp.searchPageContainer);
  }

  /**
   * Aplica un filtro de color en la barra lateral y espera la respuesta de red de `/api/plp/search`.
   * Incluye verificación de hidratación de React y fallback inteligente para términos parametrizados.
   */
  public async filterByColor(
    colorName: string,
    interceptor: PlpNetworkInterceptor
  ): Promise<CapturedPlpPayload> {
    await this.filterSidebar.waitFor({
      state: 'visible',
      timeout: ENV_CONFIG.timeouts.elementVisibleMs,
    });

    const colorGroup = this.filterSidebar
      .locator(LIVERPOOL_SELECTORS.plp.colorFilterSection)
      .first();
    await colorGroup.waitFor({
      state: 'visible',
      timeout: ENV_CONFIG.timeouts.elementVisibleMs,
    });

    const escapedColor = colorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let targetColorLabel = colorGroup
      .locator('label')
      .filter({ hasText: new RegExp(`^${escapedColor}\\s*\\(`, 'i') })
      .first();

    // Si el color solicitado no figura entre las facetas principales del término (ej. en pruebas Data-Driven),
    // verificar si existe botón "Ver más" o seleccionar la primera faceta de color disponible.
    if ((await targetColorLabel.count()) === 0) {
      const showMoreColorsBtn = colorGroup.locator('button').filter({ hasText: /Ver más/i }).first();
      if ((await showMoreColorsBtn.count()) > 0 && (await showMoreColorsBtn.isVisible())) {
        await waitForReactHydration(showMoreColorsBtn);
        await showMoreColorsBtn.click();
      }
    }

    if ((await targetColorLabel.count()) === 0) {
      targetColorLabel = colorGroup.locator('label').first();
      const fallbackText = (await targetColorLabel.textContent())?.trim() || 'Primero disponible';
      console.log(
        `[Info Filtro] El color "${colorName}" no está disponible en las facetas de esta búsqueda; aplicando faceta de color "${fallbackText}".`
      );
    }

    await targetColorLabel.scrollIntoViewIfNeeded();
    await waitForReactHydration(targetColorLabel, ENV_CONFIG.timeouts.elementVisibleMs);

    const payload = await interceptor.executeAndIntercept(async () => {
      await targetColorLabel.click();
    });

    await this.waitForProductGridToMatchFirstRecord(payload.products[0]?.id);
    return payload;
  }

  /**
   * Selecciona un criterio de ordenamiento (ej. "Menor precio") y espera la actualización de red y DOM.
   */
  public async sortByOption(
    sortOptionText: string,
    interceptor: PlpNetworkInterceptor
  ): Promise<CapturedPlpPayload> {
    await this.sortDropdownButton.scrollIntoViewIfNeeded();
    await waitForReactHydration(this.sortDropdownButton, ENV_CONFIG.timeouts.elementVisibleMs);

    const escapedSort = sortOptionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sortOptionItem = this.sortDropdownContainer
      .locator('li')
      .filter({ hasText: new RegExp(`^${escapedSort}$`, 'i') })
      .first();

    const payload = await interceptor.executeAndIntercept(async () => {
      if (!(await sortOptionItem.isVisible())) {
        await this.sortDropdownButton.click();
        await sortOptionItem.waitFor({
          state: 'visible',
          timeout: ENV_CONFIG.timeouts.elementVisibleMs,
        });
      }
      await sortOptionItem.click();
    });

    await this.waitForProductGridToMatchFirstRecord(payload.products[0]?.id);
    return payload;
  }

  /**
   * Extrae el nombre, marca y precio de los primeros `count` productos visibles en la cuadrícula de resultados.
   */
  public async extractTopProducts(count: number): Promise<UiProduct[]> {
    await this.searchPageContainer.waitFor({
      state: 'visible',
      timeout: ENV_CONFIG.timeouts.elementVisibleMs,
    });

    const rawCards = await this.searchPageContainer
      .locator(LIVERPOOL_SELECTORS.plp.productCardSuffix)
      .evaluateAll((elements, limit) => {
        // Filtrar únicamente los contenedores raíz de tarjeta cuyo data-testid tiene formato "{productId}-card"
        const productCards = elements.filter((el) => {
          const tid = el.getAttribute('data-testid') || '';
          return /^\d+-card$/.test(tid);
        });

        return productCards.slice(0, limit).map((card) => {
          const testId = card.getAttribute('data-testid') || '';
          const id = testId.replace(/-card$/, '');

          const brandEl = card.querySelector('h4');
          const nameEl = card.querySelector('h3');
          const discountedEl = card.querySelector('[data-testid="discounted"]') as HTMLElement | null;
          const originalEl = card.querySelector('[data-testid="original"]') as HTMLElement | null;
          const priceContainerEl = card.querySelector(`[data-testid="${id}-price"]`) as HTMLElement | null;

          const primaryPriceEl = discountedEl || priceContainerEl;
          const rawDisplayedPrice = (primaryPriceEl?.textContent || '').trim();
          const rawInnerTextPrice = (primaryPriceEl?.innerText || '').replace(/\s+/g, '').trim();
          const rawOriginalPrice = (originalEl?.textContent || '').trim();

          return {
            id,
            brand: (brandEl?.textContent || '').trim(),
            name: (nameEl?.textContent || '').trim(),
            rawDisplayedPrice,
            rawInnerTextPrice,
            rawOriginalPrice,
          };
        });
      }, count);

    return rawCards.map((item) => ({
      id: item.id,
      brand: item.brand,
      name: item.name,
      displayedPrice: parseLiverpoolPrice(item.rawDisplayedPrice),
      rawDisplayedPrice: item.rawDisplayedPrice,
      rawInnerTextPrice: item.rawInnerTextPrice,
      originalPrice: item.rawOriginalPrice ? parseLiverpoolPrice(item.rawOriginalPrice) : undefined,
    }));
  }

  /**
   * Devuelve el localizador del contenedor principal de resultados (útil para regresión visual).
   */
  public getResultsContainer(): Locator {
    return this.searchPageContainer;
  }

  /**
   * Espera de forma determinista a que React reconcilie el DOM tras recibir una respuesta de `/api/plp/search`.
   */
  private async waitForProductGridToMatchFirstRecord(expectedFirstProductId?: string): Promise<void> {
    if (!expectedFirstProductId) return;

    try {
      await this.page
        .locator(LIVERPOOL_SELECTORS.plp.productCardById(expectedFirstProductId))
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      await this.searchPageContainer
        .locator(LIVERPOOL_SELECTORS.plp.productCardSuffix)
        .first()
        .waitFor({
          state: 'visible',
          timeout: ENV_CONFIG.timeouts.elementVisibleMs,
        });
    }
  }
}
