import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: { ...minimal2023Preset, maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#5B3FD9' } }, apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#5B3FD9' } } },
  images: ['public/icon.svg'],
});
