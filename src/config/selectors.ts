/**
 * Catálogo centralizado de selectores del DOM de Liverpool (arquitectura Next.js + Material UI 2026).
 * Evita valores codificados (hardcoded) en los Page Objects y facilita el mantenimiento ante cambios de UI.
 */
export const LIVERPOOL_SELECTORS = {
  home: {
    searchInput:
      'input[type="search"]:visible, [data-testid$="-header-search-input"]:visible, input[placeholder*="Buscar por producto"]:visible, #mainSearchbar:visible',
    cookieConsentCloseButton:
      '[data-testid="ml-cookie-consent-ml-cookie-consent-close-button"], #onetrust-accept-btn-handler',
  },
  plp: {
    searchPageContainer: '[data-testid="search-page"]',
    filterSidebar: '[data-testid="plp-page-plp-filter"]',
    colorFilterSection: '[data-testid*="plp-filter-colors-filter"]',
    sortDropdownButton: '[data-testid="dropdown-sorting-button"], #sort-by-button',
    sortDropdownContainer: '[data-testid="plp-page-dropdown-sorting"]',
    productCardSuffix: '[data-testid$="-card"]',
    productCardById: (productId: string) => `[data-testid="${productId}-card"]`,
    productPriceById: (productId: string) => `[data-testid="${productId}-price"]`,
    cardBrand: 'h4',
    cardTitle: 'h3, .card-title',
    discountedPrice: '[data-testid="discounted"], .a-card-discount',
    originalPrice: '[data-testid="original"], .a-card-price',
  },
} as const;
