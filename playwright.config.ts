import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'src/tests/e2e',
  use: { baseURL: 'http://localhost:4173', locale: 'he-IL', timezoneId: 'Asia/Jerusalem' },
  projects: [{ name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } }],
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 180_000 },
});
