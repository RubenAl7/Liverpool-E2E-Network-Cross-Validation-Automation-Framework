import { test, expect } from '@playwright/test';
import { parseLiverpoolPrice } from '../src/utils/price-parser';
import { PlpNetworkInterceptor } from '../src/services/PlpNetworkInterceptor';
import { DataCrossValidator } from '../src/services/DataCrossValidator';
import { PlpApiRecord, UiProduct } from '../src/types/product.types';

test.describe('Pruebas Unitarias del Framework (Parser de Precios, Normalizador BFF y Validador Cruzado)', () => {
  test('1. parseLiverpoolPrice convierte formatos de precio con punto, comas y centavos en superíndice', () => {
    expect(parseLiverpoolPrice('$305.50')).toBe(305.5);
    expect(parseLiverpoolPrice('$11,999.00')).toBe(11999);
    // Caso DOM Liverpool donde innerText une centavos en <sup>00</sup> tras miles sin punto decimal
    expect(parseLiverpoolPrice('$11,99900')).toBe(11999);
    expect(parseLiverpoolPrice('$1,49950')).toBe(1499.5);
    expect(parseLiverpoolPrice('$611')).toBe(611);
    expect(parseLiverpoolPrice(329.5)).toBe(329.5);
    expect(parseLiverpoolPrice('')).toBe(0);
    expect(parseLiverpoolPrice(null)).toBe(0);
  });

  test('2. PlpNetworkInterceptor.mapRecordToApiProduct calcula el precio efectivo y extrae variantes de color', () => {
    const mockRecord: PlpApiRecord = {
      productId: '1150351332',
      title: 'Funda de silicona para control PS5',
      brand: 'GENÉRICO',
      priceInfo: {
        salePrice: 611,
        listPrice: { price: 611 },
        promoPrice: { price: 305.5 },
      },
      variantsColor: [
        { colorName: 'Sin color', colorHex: '#FFFFFF' },
        { colorName: 'Blanco', colorHex: '#FFFFFF' },
      ],
    };

    const apiProduct = PlpNetworkInterceptor.mapRecordToApiProduct(mockRecord);

    expect(apiProduct.id).toBe('1150351332');
    expect(apiProduct.brand).toBe('GENÉRICO');
    expect(apiProduct.effectivePrice).toBe(305.5);
    expect(apiProduct.salePrice).toBe(611);
    expect(apiProduct.promoPrice).toBe(305.5);
    expect(apiProduct.colorNames).toEqual(['Sin color', 'Blanco']);
    expect(apiProduct.colorHexes).toEqual(['#FFFFFF', '#FFFFFF']);
  });

  test('3. DataCrossValidator.validate empareja por productId y por nombre normalizado sin acentos', () => {
    const uiProducts: UiProduct[] = [
      {
        id: '1001',
        brand: 'SONY',
        name: 'Control inalámbrico DualSense PS5 Blanco',
        displayedPrice: 1299,
        rawDisplayedPrice: '$1,299.00',
      },
      {
        id: '9999-dom-id-distinto',
        brand: 'SONY',
        name: 'Estacion de recarga DualSense',
        displayedPrice: 699,
        rawDisplayedPrice: '$699.00',
      },
    ];

    const apiProducts = [
      {
        id: '1001',
        brand: 'SONY',
        name: 'Control inalámbrico DualSense PS5 Blanco',
        effectivePrice: 1299,
        salePrice: 1299,
        promoPrice: 1299,
        colorNames: ['Blanco'],
        colorHexes: ['#FFFFFF'],
      },
      {
        id: '2002',
        brand: 'SONY',
        name: 'Estación de recarga DualSense',
        effectivePrice: 699,
        salePrice: 699,
        promoPrice: 699,
        colorNames: ['Blanco'],
        colorHexes: ['#FFFFFF'],
      },
    ];

    const report = DataCrossValidator.validate(uiProducts, apiProducts, 'Blanco');

    expect(report.matchedCount).toBe(2);
    expect(report.matchedProducts[0].matchStrategy).toBe('product_id');
    expect(report.matchedProducts[1].matchStrategy).toBe('normalized_name');
  });

  test('4. DataCrossValidator.validate detecta discrepancias reales de Liverpool (salePrice vs promoPrice, .invisible dot y color_metadata)', () => {
    const uiProducts: UiProduct[] = [
      {
        id: '1150351332',
        brand: 'GENÉRICO',
        name: 'Funda de silicona para control PS5',
        displayedPrice: 305.5,
        rawDisplayedPrice: '$305.50',
        rawInnerTextPrice: '$30550',
        originalPrice: 611,
      },
    ];

    const apiProducts = [
      {
        id: '1150351332',
        brand: 'GENÉRICO',
        name: 'Funda de silicona para control PS5',
        effectivePrice: 305.5,
        salePrice: 611,
        listPrice: 611,
        promoPrice: 305.5,
        colorNames: ['Sin color'],
        colorHexes: ['#FFFFFF'],
      },
    ];

    const report = DataCrossValidator.validate(uiProducts, apiProducts, 'Blanco');

    expect(report.matchedCount).toBe(1);
    const fields = report.discrepancies.map((d) => d.field);
    expect(fields).toContain('price');
    expect(fields).toContain('dom_formatting');
    expect(fields).toContain('color_metadata');
  });

  test('5. DataCrossValidator.validate registra productos faltantes en API (missing_in_api)', () => {
    const uiProducts: UiProduct[] = [
      {
        id: '4040',
        brand: 'SONY',
        name: 'Producto Exclusivo DOM',
        displayedPrice: 999,
        rawDisplayedPrice: '$999.00',
      },
    ];

    const report = DataCrossValidator.validate(uiProducts, [], 'Blanco');

    expect(report.matchedCount).toBe(0);
    expect(report.discrepancies).toHaveLength(1);
    expect(report.discrepancies[0].field).toBe('missing_in_api');
  });
});
