Product gallery browser checks
==============================

Run `npm ci --prefix tests`, then `npm test --prefix tests` from the theme root.
The runner uses installed Microsoft Edge on Windows. On other systems, install
Playwright Chromium (`npx --prefix tests playwright install chromium`) or set
`GALLERY_BROWSER` to a Chromium browser executable.

The fixture serves the actual gallery JavaScript and CSS, including the theme's
base styles and `.page-wrapper` scrolling layout. It uses generated image media
with portrait, landscape, and square dimensions, and the same product-selection
event promise contract as the variant picker. There is no live-store dependency.

Checks cover device-specific module loading, desktop grid and image panning,
navigation, focus and scroll restoration, rapid open/close, failed high-resolution
loads, variant replacement, section removal, responsive switching, mobile dots,
real touch swipe/pinch/pan, double-tap, orientation changes, and media counts.
Screenshots are written to the ignored `tests/artifacts/` directory.

Shopify-hosted video, external video, 3D/AR, real theme-editor rendering, and
physical iOS Safari gestures still require storefront/device verification. Their
existing media renderer is reused; the fixture does not emulate Shopify services.
