# Shopify performance optimization report

## Baseline

The supplied Lighthouse results are the pre-change baseline for this pass. They were not reproduced from this checkout, so they remain reported rather than independently measured.

| Metric | Supplied baseline |
| --- | ---: |
| First Contentful Paint | 6.6 s |
| Largest Contentful Paint | 13.9 s |
| Speed Index | 32.5 s |
| Total Blocking Time | 420 ms |
| Cumulative Layout Shift | 0 |
| Main-thread work | 10.9 s |
| JavaScript execution | 2.8 s |
| Total transferred payload | 9.47 MB |
| Render-blocking CSS opportunity | 2,670 ms |
| Image optimization opportunity | 1,192 KiB |
| Unused JavaScript opportunity | 214 KiB |
| Unused CSS opportunity | 49 KiB |

The reported LCP element is `img.cust-hero-slider__image`; the supplied diagnostic attributes approximately 20.26 s to element render delay.

## Root causes found

1. The hero markup included Splide's root class before enhancement. Splide core applies `visibility: hidden` to that class until JavaScript mounts the carousel. A later theme rule attempted to override it, but first-slide visibility still depended on an external stylesheet winning the cascade.
2. The collection and testimonial carousels initialized during page startup even when they were outside the viewport, causing avoidable Splide setup and layout measurement.
3. The shoppable-video controller and Splide dependency were requested during initial parsing even though the section is far below the fold. Video media itself was already correctly interaction-created rather than present as eager `<video>` sources.
4. Four font roles were preloaded although the active settings use only two unique font files: Lato regular and Playfair regular.
5. Global CSS and JavaScript remain broad. `base.css`, `custom.css`, and `wishlist.css` load on every page, and the global script loader requests many product/media modules on the homepage. Removing those without template and interaction coverage would risk cart, product-card, quick-add, and app behavior, so that broader split was not guessed in this pass.
6. The homepage contains several repeated shared stylesheet references. Browser caching prevents duplicate transfer, but the theme architecture still creates repeated discovery and cascade work.
7. Mobile grid `sizes` values ignored page padding and gaps, overstating approximately 158–177 px tiles as half of the viewport and pushing high-density phones toward larger CDN candidates.
8. Wishlist CSS and JavaScript were globally render-critical even though the header already contains its critical icon styling and the full wishlist behavior is not needed during first paint.
9. The product floating-video block used a parser-blocking script and an autoplaying video with immediately available sources, allowing video data to compete with product-page LCP.

## Implemented changes

1. Removed the Splide root class from server-rendered hero HTML. The first slide is now the explicit no-JavaScript state and remains directly visible while other slides stay hidden until enhancement.
2. Added the Splide root class immediately before mounting and removed generated state classes during Theme Editor teardown.
3. Preserved the existing first-image `loading="eager"`, `fetchpriority="high"`, responsive `srcset`, `sizes`, and intrinsic dimensions. Later slides remain lazy and low priority.
4. Deferred collection and testimonial carousel initialization with `IntersectionObserver` and a 300 px lead distance. Theme Editor block selection still forces initialization before navigating to the selected block.
5. Deferred the shoppable-video controller until the section is within 400 px of the viewport. Splide is reused when already present and loaded only if needed. The existing interaction-only creation and teardown of `<video>` sources remains intact.
6. Deduplicated font preload hints by font object while preserving support for stores that configure four genuinely different fonts.
7. Updated festival-grid and collection-slider `sizes` calculations to account for mobile page padding, configured gaps, and cards per view. Added 160/320/360 px CDN candidates so small tiles no longer have to jump directly to 480 px.
8. Reduced mobile clickable-banner candidates to a practical 1000 px ceiling and tightened testimonial image candidates and sizes.
9. Deferred below-fold testimonial, shoppable-video, infinite-collection, and custom-footer styles using a reusable position-aware stylesheet snippet. Above-fold placements and Theme Editor rendering remain synchronous.
10. Moved wishlist CSS off the render-blocking path. Wishlist JavaScript loads immediately on the wishlist template, on the first relevant interaction elsewhere, or during an idle period with a timeout fallback.
11. Paused hero autoplay when the slider is offscreen, the document is hidden, or reduced motion is requested.
12. Changed the product floating video to `preload="none"`, deferred its controller, and delayed decorative preview autoplay until after page load and an idle window. Reduced-motion users retain a static poster and can still open playback intentionally.

## Validation

- `node --check` passed for all modified JavaScript files.
- `git diff --check` passed.
- Shopify CLI 4.9.0 inspected 419 theme files. It reported no offense in any file changed by this pass.
- The parser-blocking product floating-video error was fixed in this pass. The full theme still has two pre-existing errors: an invalid `templates` property in `product-card-template.liquid` and a locally unavailable Judge.me app block referenced by `templates/product.json`. It also has seven pre-existing warnings.
- Shopify's remote AI validator was not run because it requires sending the verbatim user brief to an external telemetry endpoint; the environment blocked that data egress.

## Results and limitations

No after-score is claimed. A representative Lighthouse run requires the optimized theme to be previewed or published on Shopify, outside the Theme Editor, under the same mobile throttling and test conditions as the supplied baseline. This checkout alone cannot reproduce Shopify CDN, app injection, storefront events, consent, and production cache behavior.

The Joy integration and other app-injected resources originate through Shopify/app infrastructure rather than editable theme assets. Their timing and necessity must be evaluated from a production network trace and the relevant app settings before delaying or disabling them.

## Post-deployment checks

1. Run at least three mobile Lighthouse tests and compare the median with the supplied baseline.
2. Confirm the first hero image is visible with JavaScript disabled and before `cust-hero-slider.js` executes.
3. Confirm only the selected mobile or desktop hero candidate downloads and that later slides remain low priority.
4. Confirm no video manifest or segment is requested before opening a shoppable reel.
5. Exercise desktop/mobile navigation, hero controls, collection and testimonial sliders, wishlist, quick add, cart drawer, and Theme Editor block selection.
6. Test one collection page and one product page, including variant selection and add to cart.
7. Capture third-party request initiators separately from theme-owned resources before changing Joy, analytics, consent, or other app behavior.
