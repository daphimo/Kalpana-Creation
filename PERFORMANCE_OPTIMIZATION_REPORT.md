# Shopify performance optimization report

## Baseline

The supplied Lighthouse audit is the pre-change baseline. A new production run cannot be collected from this checkout because `kalpanacreation.in` currently redirects unauthenticated visitors to Shopify's password page. Re-test the published theme outside the Theme Editor after deployment.

| Metric | Baseline |
| --- | ---: |
| First Contentful Paint | 1.5 s |
| Largest Contentful Paint | 4.6 s |
| Total Blocking Time | 0 ms |
| Cumulative Layout Shift | 0.005 |
| Speed Index | 5.9 s |
| Initial transferred payload | ~6.4 MB |
| Initial HLS video data | ~3.2 MB |
| Estimated image savings | ~753 KiB |
| Estimated unused compiled CSS | ~49 KiB |

The supplied audit did not include request count or per-type totals for CSS, JavaScript, fonts, and images, so those values must be captured in the authenticated production re-test rather than inferred.

## Critical resources

| Resource | Type | Supplied size/timing | Blocking? | Above fold? | Can defer? | Can remove? | Can optimize? |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| `.cust-hero-slider__image` | Image | ~2.83 s load | LCP | Yes | No | No | Yes |
| `cust-splide-core.min.css` | CSS | Not supplied | Yes | Yes | No | No | Yes, integration only |
| `cust-hero-slider.css` | CSS | Not supplied | Yes | Yes | No | No | Yes |
| `cust-splide.min.js` | JavaScript | Not supplied | No (`defer`) | Enhances hero | Yes | No | Integration only |
| `cust-hero-slider.js` | JavaScript | Not supplied | No (`defer`) | Enhances hero | Yes | No | Yes |
| Shoppable HLS streams | Video | ~3.2 MB | No | No | Yes | No | Yes |
| Playfair | Font | ~107.82 KiB | No, `font-display: swap` | Potentially | Yes | No | Settings-dependent |
| Lato | Font | ~43.63 KiB | No, `font-display: swap` | Potentially | Yes | No | Settings-dependent |
| `compiled_assets/styles.css` | CSS | ~49 KiB unused estimate | Yes | Mixed | Partially | Not safely | Yes, source-dependent |
| Joy (`static.joy.so`) | Third party | ~52.8 KiB | Provider-dependent | No | Potentially | No | Provider-dependent |

## Implemented changes

1. Made the server-rendered hero visible before Splide initializes. Splide core was hiding it with `visibility: hidden`, directly delaying LCP until JavaScript initialization.
2. Kept only the first hero slide eager/high priority and tightened responsive candidates for common mobile and desktop viewports.
3. Corrected homepage grid `sizes` to reflect merchant-configured column counts and removed the unnecessary 1200 px candidate.
4. Explicitly lazy-loaded below-fold clickable banners.
5. Reduced header logo candidates from 800 px to 320 px for an approximately 160 px rendered logo. The visible logo remains eager; the alternate scroll-state logo is low-priority lazy content.
6. Verified that shoppable videos are poster-only on initial HTML and that video elements/sources are created only after interaction, then unloaded on close or slide change.

## Post-deployment measurement checklist

Run Lighthouse on the published storefront in an incognito profile, outside Shopify Theme Editor, at 390 px mobile and 1440 px desktop. Record cold and repeat runs, request count, transferred totals by resource type, LCP resource URL and transfer size, and verify that no HLS playlist or segment is requested before opening a shoppable reel.
