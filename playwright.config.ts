import { defineConfig, devices, chromium } from '@playwright/test';
import * as fs from 'fs';
import { ENV_CONFIG } from './src/config/test-data';

/**
 * Resuelve automáticamente el canal de Chromium:
 * - Si el binario empaquetado de Playwright existe (ej. en GitHub Actions CI), usa el Chromium nativo.
 * - Si no está descargado localmente, utiliza el canal 'chrome' del sistema operativo.
 */
function resolveChromiumChannel(): string | undefined {
  try {
    const executablePath = chromium.executablePath();
    if (executablePath && fs.existsSync(executablePath)) {
      return undefined;
    }
  } catch {
    // Fallback a Google Chrome del sistema
  }
  return 'chrome';
}

const chromiumChannel = resolveChromiumChannel();

export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 2,
  timeout: 90000,
  expect: {
    timeout: 15000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.15,
      animations: 'disabled',
    },
  },
  /* Parte 3: Informe HTML de ejecución de pruebas */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: ENV_CONFIG.baseUrl,
    /* Parte 1: Ejecución sin interfaz gráfica (headless) de forma predeterminada; soporta HEADED=true o HEADED=1 */
    headless: !(process.env.HEADED === 'true' || process.env.HEADED === '1'),
    viewport: { width: 1440, height: 900 },
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    actionTimeout: 20000,
    navigationTimeout: ENV_CONFIG.timeouts.navigationMs,
    /* Parte 3: Capturas de pantalla automáticas en caso de fallo configuradas desde el framework */
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },

  /* Bonificación #4: Configuración de ejecución en paralelo en diferentes navegadores */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        channel: chromiumChannel,
        launchOptions: {
          args: ['--disable-blink-features=AutomationControlled'],
        },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
