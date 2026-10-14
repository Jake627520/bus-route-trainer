import type { MetadataRoute } from 'next';
import { BACKGROUND_LIGHT, BRAND_NAVY } from '@/pwa/brand';

/** Change 51: Web App Manifest——讓瀏覽器可把網站加入主畫面、以獨立視窗開啟。 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Route Memory Trainer',
    short_name: 'Route Memory',
    description: 'Learn and review bus routes.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: BACKGROUND_LIGHT,
    theme_color: BRAND_NAVY,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
