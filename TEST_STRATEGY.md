# Estrategia de Pruebas y Arquitectura de Calidad (`TEST_STRATEGY.md`)

## 1. ¿Qué aspectos de este proceso NO automatizarías en E2E y por qué?

Automatizar todo mediante el navegador cae en el antipatrón del *cono de helado* (alto costo de mantenimiento y lento feedback). Bajo un análisis de retorno de inversión (**ROI**) y riesgo, **no automatizaría por interfaz gráfica**:
* **Checkout transaccional con pasarelas de pago reales y 3DS/OTP bancario**: Ejecutar cargos reales contamina inventario/finanzas, genera costos por transacción y depende de terceros bancarios fuera de nuestro control. *Alternativa*: Pruebas de contrato (*Contract Testing*) y pasarelas *sandbox/mock* en pre-producción.
* **Valores absolutos de catálogo, precios fijos o banners promocionales (*Fashion Fest*)**: Afirmar en E2E que el primer SKU siempre cuesta `$305.50` o validar creatividades rotativas rompe la suite ante cualquier cambio de stock o campaña. En E2E validamos **invariantes de contrato** (que el DOM refleje fielmente el payload de `/api/plp/search` y respete el orden ascendente).
* **Permutaciones combinatorias de filtros y relevancia semántica del buscador**: Probar en UI decenas de combinaciones (Marca × Color × Precio × Calificación) escala con complejidad $O(N^2)$ en tiempo de navegador. *Alternativa*: Cubrir 1 flujo crítico en UI y validar las permutaciones directamente contra `POST /api/plp/search` con `APIRequestContext` en milisegundos.

---

## 2. Si Liverpool añadiera un CAPTCHA al proceso de búsqueda, ¿cómo lo gestionarías?

Intentar resolver o "romper" un CAPTCHA desde un script E2E es un **antipatrón** que contradice su propósito de seguridad e introduce un punto crítico de fallo. Mi estrategia se estructura por capas según el entorno:
1. **Bypass determinista Zero-Trust en QA/Staging (Recomendado)**: Acordar con Seguridad/Infraestructura (WAF Akamai/Cloudflare) una regla de exención controlada mediante una cabecera HTTP firmada (`x-qa-bypass-token` inyectada vía `extraHTTPHeaders` desde GitHub Secrets) o *allowlisting* de IPs de los *runners* de CI.
2. **Llaves de prueba (*Test Keys*) y Virtualización de Red**: Configurar en entornos previos las llaves oficiales de prueba del proveedor (*Turnstile* / *reCAPTCHA* `Always Pass`) o interceptar el script de validación con `page.route()` devolviendo un *stub* exitoso cuando el objetivo sea evaluar únicamente la interfaz de resultados.
3. **Detección temprana en Producción**: Nunca evadir el WAF en vivo; si se ejecuta monitoreo sintético en producción, detectar el selector del desafío y clasificar la ejecución como `Blocked by WAF/CAPTCHA` con captura adjunta, separando un bloqueo perimetral de una regresión funcional del código.

---

## 3. ¿Qué riesgos de inestabilidad (*flakiness*) existen en esta prueba y cómo los mitigaste?

| Riesgo real identificado en `liverpool.com.mx` | Mitigación técnica implementada en el framework |
| :--- | :--- |
| **Brecha de hidratación SSR en Next.js**: El `<input>` de búsqueda es visible en el HTML inicial antes de que React 18 adjunte sus *event listeners* (`__reactProps$`), haciendo que un `Enter` temprano se pierda. | `waitForReactHydration()` inspecciona la hidratación real del nodo DOM (`__reactProps$`/`__reactFiber$`) y `HomePage.searchProduct()` incluye guarda de navegación determinista hacia `/tienda?s=...`. |
| **Condición de carrera entre red (`/api/plp/search`) y reconciliación del DOM**: Al filtrar por `"Blanco"` u ordenar por `"Menor precio"`, el DOM conserva brevemente las tarjetas previas mientras responde el BFF. | `PlpNetworkInterceptor.executeAndIntercept()` sincroniza la acción de UI con `waitForRequest`/`waitForResponse('/api/plp/search')`, respaldo SSR (`window.__NEXT_DATA__`) y espera a que el primer `productId` del nuevo JSON esté montado (`[data-testid="{id}-card"]`). |
| **Discrepancias de formato DOM y precios en BFF**: El DOM inserta `<span class="invisible">.</span>` y centavos en superíndice (haciendo que `innerText` devuelva `$30550` en vez de `$305.50`), mientras la API separa `salePrice` (sin descuento) de `promoPrice.price`. | Parser dedicado (`parseLiverpoolPrice` en `src/utils/price-parser.ts`), lectura de `[data-testid="discounted"]`, cálculo de precio efectivo (`min(promoPrice, salePrice)`) y registro automático de discrepancias en `DataCrossValidator`. |
| **Falsos timeouts por `networkidle` y trackers de terceros**: Scripts continuos de anuncios y *live shopping* (DoubleClick, Criteo, Bambuser) impiden que la red quede inactiva. | Bloqueo selectivo de dominios de telemetría/anuncios en `test.fixture.ts` y prohibición de `networkidle` o `waitForTimeout` fijos a favor de esperas basadas en estado. |

---

## 4. ¿Qué cambiarías al integrar esto en un pipeline de CI con más de 50 suites de pruebas?

* **Ejecución escalonada (*Tiered Pipelines*)**:
  * **En cada Pull Request (Feedback < 3 min)**: Ejecutar pruebas unitarias del framework (`tests/unit-framework.spec.ts`), pruebas de contrato API y *Smoke Tests* de UI con red simulada (*Mocked BFF*) exclusivamente en `Chromium`.
  * **Nightly / Pre-Release / Canary**: Ejecutar las +50 suites E2E contra el backend real, la matriz *Cross-Browser* (`Chromium`, `Firefox`, `WebKit`) y regresión visual.
* **Paralelización con Sharding y Contenedores Oficiales**: Distribuir las suites mediante una matriz en GitHub Actions (`npx playwright test --shard=${{ matrix.shard }}`), unificar reportes con `playwright merge-reports` y ejecutar sobre la imagen Docker oficial (`mcr.microsoft.com/playwright`) para evitar descargas de navegadores en cada corrida.
* **Política de Cuarentena (`@quarantine`) y Observabilidad**: Monitorear métricas de estabilidad (tasa de *retries* y duración p95); cualquier prueba con intermitencia > 2% se aísla automáticamente en un *job* `@quarantine` no bloqueante con un SLA técnico de corrección menor a 48 horas.
