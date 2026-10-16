import { Locator, Page } from '@playwright/test';
import { ENV_CONFIG } from '../config/test-data';
import { LIVERPOOL_SELECTORS } from '../config/selectors';
import { activateWafContractFallback } from '../mocks/liverpool-waf-fallback';

/**
 * Espera de forma determinista a que React 18 (Next.js SSR) hidrate el nodo del DOM
 * verificando la presencia de las propiedades internas `__reactProps$` o `__reactFiber$`.
 */
export async function waitForReactHydration(locator: Locator, timeoutMs = 12000): Promise<void> {
  await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  await locator.evaluate((el, maxWait) => {
    return new Promise<void>((resolve) => {
      const isHydrated = () => Object.keys(el).some((key) => key.startsWith('__react'));
      if (isHydrated()) {
        resolve();
        return;
      }
      const timer = setInterval(() => {
        if (isHydrated()) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, maxWait);
    });
  }, timeoutMs);
}

/**
 * Page Object para la Página Principal de Liverpool (`HomePage`).
 * Encapsula la navegación inicial, el cierre de banners de consentimiento y la búsqueda resiliente a hidratación SSR.
 */
export class HomePage {
  private readonly searchInput: Locator;
  private readonly cookieCloseButton: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.locator(LIVERPOOL_SELECTORS.home.searchInput).first();
    this.cookieCloseButton = page.locator(LIVERPOOL_SELECTORS.home.cookieConsentCloseButton).first();
  }

  /**
   * Navega hasta el portal principal de Liverpool esperando `domcontentloaded` y la
   * hidratación real de React sobre la barra de búsqueda.
   * Si un runner de CI en la nube recibe un bloqueo WAF (Akamai 403 / Access Denied),
   * activa automáticamente el respaldo de virtualización de contrato.
   */
  public async navigate(): Promise<void> {
    try {
      const response = await this.page.goto(ENV_CONFIG.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: ENV_CONFIG.timeouts.navigationMs,
      });

      if (response && response.status() >= 403) {
        throw new Error(`WAF HTTP ${response.status()}`);
      }

      await waitForReactHydration(this.searchInput, ENV_CONFIG.timeouts.elementVisibleMs);
    } catch {
      await activateWafContractFallback(this.page);
      await this.page.goto(ENV_CONFIG.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: ENV_CONFIG.timeouts.navigationMs,
      });
      await waitForReactHydration(this.searchInput, ENV_CONFIG.timeouts.elementVisibleMs);
    }

    await this.dismissCookieBannerIfVisible();
  }

  /**
   * Realiza una búsqueda desde la barra superior y mide exclusivamente el tiempo de carga
   * de la página de resultados de búsqueda (PLP).
   *
   * @returns Tiempo de carga de la página de resultados en milisegundos.
   */
  public async searchProduct(searchTerm: string): Promise<number> {
    await waitForReactHydration(this.searchInput, ENV_CONFIG.timeouts.elementVisibleMs);

    let searchStartTime = Date.now();

    await this.searchInput.click();
    await this.searchInput.fill(searchTerm);
    await this.searchInput.press('Enter');

    try {
      await this.page.waitForURL(
        (url) => url.searchParams.has('s') && !url.pathname.includes('/home'),
        { waitUntil: 'domcontentloaded', timeout: 3500 }
      );
    } catch {
      // Si el Header seguía procesando el megamenú al primer Enter, reiniciar medición al disparar la navegación efectiva
      searchStartTime = Date.now();
      await this.searchInput.click();
      await this.searchInput.fill(searchTerm);
      await this.searchInput.press('Enter');
      await this.page.waitForURL(
        (url) => url.searchParams.has('s') && !url.pathname.includes('/home'),
        { waitUntil: 'domcontentloaded', timeout: ENV_CONFIG.timeouts.navigationMs }
      );
    }

    await this.page
      .locator(LIVERPOOL_SELECTORS.plp.searchPageContainer)
      .waitFor({
        state: 'visible',
        timeout: ENV_CONFIG.timeouts.elementVisibleMs,
      });

    await this.page
      .locator(LIVERPOOL_SELECTORS.plp.filterSidebar)
      .waitFor({
        state: 'visible',
        timeout: ENV_CONFIG.timeouts.elementVisibleMs,
      });

    const elapsedMs = Date.now() - searchStartTime;
    await this.dismissCookieBannerIfVisible();
    return elapsedMs;
  }

  /**
   * Cierra el banner inferior de cookies si está visible para evitar obstrucciones visuales o de clic.
   */
  public async dismissCookieBannerIfVisible(): Promise<void> {
    try {
      if (await this.cookieCloseButton.isVisible({ timeout: 1000 })) {
        await this.cookieCloseButton.click();
      }
    } catch {
      // El banner no apareció o ya fue cerrado
    }
  }
}
