import { test as base, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { SearchResultsPage } from '../pages/SearchResultsPage';
import { PlpNetworkInterceptor } from '../services/PlpNetworkInterceptor';

export interface LiverpoolFixtures {
  homePage: HomePage;
  searchResultsPage: SearchResultsPage;
  plpInterceptor: PlpNetworkInterceptor;
}

/**
 * Dominios de terceros (anuncios, píxeles de seguimiento y widgets externos) que
 * bloquean el evento load o degradan la estabilidad de las pruebas E2E.
 */
const THIRD_PARTY_TRACKER_PATTERNS = [
  '**/*doubleclick.net/**',
  '**/*googleadservices.com/**',
  '**/*googlesyndication.com/**',
  '**/*criteo.com/**',
  '**/*connect.facebook.net/**',
  '**/*facebook.com/tr/**',
  '**/*bambuser.com/**',
];

/**
 * Fixtures personalizados de Playwright que inyectan los Page Objects, bloquean ruido
 * publicitario de terceros y activan la capa de interceptación de red.
 */
export const test = base.extend<LiverpoolFixtures>({
  page: async ({ page }, use) => {
    for (const pattern of THIRD_PARTY_TRACKER_PATTERNS) {
      await page.route(pattern, (route) => route.abort());
    }
    await use(page);
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  searchResultsPage: async ({ page }, use) => {
    await use(new SearchResultsPage(page));
  },
  plpInterceptor: async ({ page }, use) => {
    const interceptor = new PlpNetworkInterceptor(page);
    interceptor.startListening();
    await use(interceptor);
  },
});

export { expect };
