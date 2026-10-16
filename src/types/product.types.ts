/**
 * Producto extraído desde las tarjetas visibles del DOM (Interfaz de Usuario).
 */
export interface UiProduct {
  id: string;
  brand: string;
  name: string;
  /** Precio principal mostrado al usuario (con descuento si aplica, o precio regular) */
  displayedPrice: number;
  /** Texto crudo del precio principal en el DOM (ej. "$305.50") */
  rawDisplayedPrice: string;
  /** Texto renderizado mediante innerText (útil para detectar discrepancias de formato CSS) */
  rawInnerTextPrice?: string;
  /** Precio original tachado si el producto tiene descuento */
  originalPrice?: number;
}

/**
 * Estructura tipada del endpoint BFF de Liverpool (`POST /api/plp/search`).
 */
export interface PlpApiPriceInfo {
  salePrice?: number;
  listPrice?: {
    price?: number;
  };
  promoPrice?: {
    price?: number;
  };
}

export interface PlpApiColorVariant {
  skuId?: string;
  colorName?: string;
  colorHex?: string;
}

export interface PlpApiRecord {
  productId: string;
  skuRepositoryId?: string;
  title: string;
  brand?: string;
  category?: string;
  priceInfo?: PlpApiPriceInfo;
  variantsColor?: PlpApiColorVariant[];
}

export interface PlpApiResponse {
  meta?: {
    transactionID?: string;
    status?: string;
    statusCode?: number;
    timestamp?: string;
  };
  data?: {
    records?: PlpApiRecord[];
    encryptedFilters?: string;
    filter?: string;
    sortDisplayOptions?: unknown[];
  };
}

/**
 * Producto normalizado desde la respuesta interceptada de la red.
 */
export interface ApiProduct {
  id: string;
  brand: string;
  name: string;
  effectivePrice: number;
  salePrice?: number;
  listPrice?: number;
  promoPrice?: number;
  colorNames: string[];
  colorHexes: string[];
}

/**
 * Detalle de discrepancia detectada entre la UI y la capa de servicios (API).
 */
export interface ValidationDiscrepancy {
  productId: string;
  uiName: string;
  field: 'name' | 'price' | 'color_metadata' | 'dom_formatting' | 'missing_in_api';
  uiValue: string | number;
  apiValue: string | number;
  description: string;
}

/**
 * Resultado consolidado de la validación cruzada (Parte 2).
 */
export interface CrossValidationReport {
  totalUiProductsEvaluated: number;
  totalApiProductsIntercepted: number;
  matchedCount: number;
  matchedProducts: Array<{
    uiProduct: UiProduct;
    apiProduct: ApiProduct;
    matchStrategy: 'product_id' | 'normalized_name';
  }>;
  discrepancies: ValidationDiscrepancy[];
}
