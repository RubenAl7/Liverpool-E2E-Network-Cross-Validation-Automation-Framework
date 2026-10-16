export interface SearchScenario {
  id: string;
  searchTerm: string;
  colorFilter: string;
  sortOptionText: string;
  sortQueryParam: string;
  resultsToExtract: number;
  minCrossValidatedMatches: number;
}

/**
 * Configuración centralizada libre de valores codificados (hardcoded) en las pruebas.
 * Permite sobrescribir parámetros mediante variables de entorno para CI/CD o pruebas basadas en datos.
 */
export const ENV_CONFIG = {
  baseUrl: process.env.BASE_URL || 'https://www.liverpool.com.mx',
  plpSearchEndpointPattern: '/api/plp/search',
  performanceSlaMs: Number(process.env.PERF_SLA_MS || process.env.MAX_LOAD_MS || 12000),
  timeouts: {
    navigationMs: 45000,
    elementVisibleMs: 20000,
    networkResponseMs: 25000,
  },
} as const;

/**
 * Escenario principal requerido por las Partes 1 y 2 del reto técnico.
 * Soporta parametrización vía `SEARCH_TERM` y `COLOR_FILTER` / `FILTER_COLOR` sin modificar código.
 */
export const PRIMARY_SEARCH_SCENARIO: SearchScenario = {
  id: 'primary-ps5',
  searchTerm: process.env.SEARCH_TERM || 'playstation 5',
  colorFilter: process.env.COLOR_FILTER || process.env.FILTER_COLOR || 'Blanco',
  sortOptionText: 'Menor precio',
  sortQueryParam: 'sortPrice|0',
  resultsToExtract: 5,
  minCrossValidatedMatches: 3,
};

/**
 * Dataset parametrizado para Pruebas Basadas en Datos (Punto de Bonificación #5).
 */
export const DATA_DRIVEN_SCENARIOS: SearchScenario[] = [
  PRIMARY_SEARCH_SCENARIO,
  {
    id: 'data-driven-xbox',
    searchTerm: 'Xbox Series X',
    colorFilter: 'Blanco',
    sortOptionText: 'Menor precio',
    sortQueryParam: 'sortPrice|0',
    resultsToExtract: 5,
    minCrossValidatedMatches: 3,
  },
  {
    id: 'data-driven-switch',
    searchTerm: 'Nintendo Switch',
    colorFilter: 'Blanco',
    sortOptionText: 'Menor precio',
    sortQueryParam: 'sortPrice|0',
    resultsToExtract: 5,
    minCrossValidatedMatches: 3,
  },
];
