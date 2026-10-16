import { Page, Response } from '@playwright/test';
import { ENV_CONFIG } from '../config/test-data';
import { ApiProduct, PlpApiRecord, PlpApiResponse } from '../types/product.types';

export interface CapturedPlpPayload {
  url: string;
  status: number;
  timestamp: string;
  requestBody: string | null;
  rawResponse: PlpApiResponse;
  products: ApiProduct[];
}

/**
 * Capa de Interceptación de Servicios (Parte 2).
 * Escucha y almacena de forma pasiva y activa las respuestas del BFF de Liverpool (`/api/plp/search`),
 * transformando los registros crudos en entidades tipadas `ApiProduct` para validación cruzada.
 */
export class PlpNetworkInterceptor {
  private readonly capturedPayloads: CapturedPlpPayload[] = [];
  private isListening = false;

  constructor(private readonly page: Page) {}

  /**
   * Inicia la escucha de respuestas de red del endpoint de búsqueda/filtrado PLP.
   */
  public startListening(): void {
    if (this.isListening) return;
    this.isListening = true;

    this.page.on('response', async (response: Response) => {
      if (!this.isPlpSearchResponse(response)) return;

      try {
        const rawResponse = (await response.json()) as PlpApiResponse;
        const records = rawResponse?.data?.records ?? [];
        if (records.length > 0) {
          this.capturedPayloads.push({
            url: response.url(),
            status: response.status(),
            timestamp: rawResponse?.meta?.timestamp || new Date().toISOString(),
            requestBody: response.request().postData(),
            rawResponse,
            products: records.map((record) => PlpNetworkInterceptor.mapRecordToApiProduct(record)),
          });
        }
      } catch {
        // Ignorar respuestas parciales o abortadas durante navegaciones rápidas
      }
    });
  }

  /**
   * Ejecuta una acción de UI esperando explícitamente la respuesta de red de `/api/plp/search`.
   * Si el clic ocurre antes de que finalice la hidratación SSR de la PLP y no dispara la petición
   * saliente en 3.5s, reintenta la acción automáticamente hasta confirmar el disparo de red.
   */
  public async executeAndIntercept(action: () => Promise<void>): Promise<CapturedPlpPayload> {
    this.startListening();

    const responsePromise = this.page.waitForResponse(
      (res) => this.isPlpSearchResponse(res),
      { timeout: ENV_CONFIG.timeouts.networkResponseMs }
    );

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const requestStartedPromise = this.page
        .waitForRequest(
          (req) => req.url().includes(ENV_CONFIG.plpSearchEndpointPattern),
          { timeout: 3500 }
        )
        .then(() => true)
        .catch(() => false);

      await action();

      const requestStarted = await requestStartedPromise;
      if (requestStarted) {
        break;
      }
    }

    const response = await responsePromise;
    const rawResponse = (await response.json()) as PlpApiResponse;
    const records = rawResponse?.data?.records ?? [];

    const payload: CapturedPlpPayload = {
      url: response.url(),
      status: response.status(),
      timestamp: rawResponse?.meta?.timestamp || new Date().toISOString(),
      requestBody: response.request().postData(),
      rawResponse,
      products: records.map((record) => PlpNetworkInterceptor.mapRecordToApiProduct(record)),
    };

    this.capturedPayloads.push(payload);
    return payload;
  }

  /**
   * Devuelve el último payload interceptado de `/api/plp/search`.
   */
  public getLatestPayload(): CapturedPlpPayload | undefined {
    return this.capturedPayloads[this.capturedPayloads.length - 1];
  }

  /**
   * Devuelve la lista de productos normalizados de la última respuesta interceptada.
   */
  public getLatestProducts(): ApiProduct[] {
    return this.getLatestPayload()?.products ?? [];
  }

  /**
   * Devuelve los productos interceptados por XHR/Fetch y, como respaldo para vistas SSR de Next.js,
   * inspecciona el estado hidratado `window.__NEXT_DATA__` si no hubo llamada separada.
   */
  public async getLatestProductsWithSsrFallback(): Promise<ApiProduct[]> {
    const latest = this.getLatestProducts();
    if (latest.length > 0) {
      return latest;
    }

    const ssrRecords = await this.page
      .evaluate(() => {
        const nextData = (window as unknown as Record<string, unknown>).__NEXT_DATA__;
        if (!nextData || typeof nextData !== 'object') return [];
        const found: unknown[] = [];
        const visit = (node: unknown): void => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) {
            node.forEach(visit);
            return;
          }
          const obj = node as Record<string, unknown>;
          if (Array.isArray(obj.records) && obj.records.length > 0) {
            found.push(...obj.records);
            return;
          }
          Object.values(obj).forEach(visit);
        };
        visit(nextData);
        return found;
      })
      .catch(() => []);

    return (ssrRecords as PlpApiRecord[]).map((r) => PlpNetworkInterceptor.mapRecordToApiProduct(r));
  }

  private isPlpSearchResponse(response: Response): boolean {
    const contentType = response.headers()['content-type'] || '';
    return (
      response.url().includes(ENV_CONFIG.plpSearchEndpointPattern) &&
      response.status() === 200 &&
      contentType.includes('application/json')
    );
  }

  /**
   * Normaliza un registro crudo del BFF de Liverpool (`PlpApiRecord`) al modelo `ApiProduct`.
   */
  public static mapRecordToApiProduct(record: PlpApiRecord): ApiProduct {
    const salePrice = record.priceInfo?.salePrice;
    const listPrice = record.priceInfo?.listPrice?.price;
    const promoPrice = record.priceInfo?.promoPrice?.price;

    // En Liverpool, cuando promoPrice > 0 y es menor al listPrice/salePrice, la UI renderiza promoPrice
    const candidates = [promoPrice, salePrice, listPrice].filter(
      (p): p is number => typeof p === 'number' && p > 0
    );
    const effectivePrice = candidates.length > 0 ? Math.min(...candidates) : 0;

    const variants = record.variantsColor ?? [];
    const colorNames = variants
      .map((v) => v.colorName?.trim())
      .filter((name): name is string => Boolean(name));
    const colorHexes = variants
      .map((v) => v.colorHex?.trim())
      .filter((hex): hex is string => Boolean(hex));

    return {
      id: String(record.productId || record.skuRepositoryId || ''),
      brand: (record.brand || '').trim(),
      name: (record.title || '').trim(),
      effectivePrice,
      salePrice,
      listPrice,
      promoPrice,
      colorNames,
      colorHexes,
    };
  }
}
