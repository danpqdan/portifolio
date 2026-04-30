import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

const site = process.env.PUBLIC_SITE_URL || 'https://dsplayground.com.br';

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    tailwind({ applyBaseStyles: true }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
});
