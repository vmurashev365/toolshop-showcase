import { expect, type Page } from '@playwright/test';

/** 2×2 AVIF used to detect whether the test browser can decode AVIF at all. */
const AVIF_PROBE =
  'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';

export class BasePage {
  constructor(
    protected readonly page: Page,
    protected readonly baseUrl: string,
  ) {}

  async goto(path = '/'): Promise<void> {
    const cleanBase = this.baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    await this.page.goto(`${cleanBase}${cleanPath}`, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Returns the measured overflow in CSS pixels after checking the viewport limit.
   * Measures once web fonts (including icon fonts) have loaded and a frame has rendered, so a
   * reading taken mid-layout does not under-report the overflow.
   */
  async assertNoHorizontalOverflow(maxOverflowPx = 0): Promise<number> {
    const metrics = await this.page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    const overflowPx = Math.max(0, metrics.scrollWidth - metrics.innerWidth);
    expect(
      overflowPx,
      `Horizontal overflow with document ${metrics.scrollWidth}px and viewport ${metrics.innerWidth}px`,
    ).toBeLessThanOrEqual(maxOverflowPx);
    return overflowPx;
  }

  /**
   * Buyer UX Guardrail: ensures every image inside the current viewport actually loaded (naturalWidth > 0).
   *
   * Toolshop renders product photos with loading="lazy", so right after navigation they are
   * legitimately still in flight, and images far below the fold may never load until scrolled to.
   * We therefore only judge images the buyer can currently see, and give them time to finish
   * loading before reporting them as broken.
   *
   * Toolshop serves AVIF. Playwright's WebKit build on Windows cannot decode AVIF (real Safari on
   * iOS 16+ can), so when the test browser itself lacks AVIF support those images are excluded
   * instead of being reported as a product defect. Returns the excluded sources.
   */
  async assertVisibleImagesLoaded(timeout = 15_000): Promise<{ skippedUnsupportedAvif: string[] }> {
    const avifSupported = await this.page.evaluate(
      (probe) =>
        new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth > 0);
          img.onerror = () => resolve(false);
          img.src = probe;
        }),
      AVIF_PROBE,
    );

    const inspectViewportImages = () =>
      this.page.evaluate(() =>
        [...document.querySelectorAll('img')]
          .filter((img) => {
            const rect = img.getBoundingClientRect();
            const inViewport =
              rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
            return rect.width > 0 && rect.height > 0 && inViewport;
          })
          .map((img) => ({
            src: img.currentSrc || img.getAttribute('src') || img.alt || 'unknown-img',
            loaded: img.complete && img.naturalWidth > 0,
          })),
      );

    const isAvif = (src: string) => /\.avif(\?|#|$)/i.test(src);
    let skippedUnsupportedAvif: string[] = [];

    await expect
      .poll(
        async () => {
          const images = await inspectViewportImages();
          const judged = avifSupported ? images : images.filter((img) => !isAvif(img.src));
          skippedUnsupportedAvif = avifSupported ? [] : images.filter((img) => isAvif(img.src)).map((img) => img.src);
          return judged.filter((img) => !img.loaded).map((img) => img.src);
        },
        { message: 'Images in the viewport are broken or did not finish loading', timeout },
      )
      .toEqual([]);

    return { skippedUnsupportedAvif };
  }
}
