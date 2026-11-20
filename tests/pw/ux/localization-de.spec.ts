import { test, expect } from '../fixtures';

test.describe('Localization & Layout Stability (DE) @ux-guard', () => {
  test('TC-I18N-001: switching to DE translates UI chrome, keeps consistent USD format, and avoids overflow', async ({
    page,
    catalogPage,
  }) => {
    await catalogPage.open();
    await catalogPage.header.switchLanguage('de');

    // Verify translated German chrome
    await expect(page.getByTestId('nav-sign-in')).toHaveText(/Einloggen/i);
    await expect(page.getByTestId('search-submit')).toBeVisible();

    // Interim guard per AMB-09 (open BA question, see FIND-07): until the business decides whether
    // DE should show EUR / "14,15 €", we only require the currency format to stay CONSISTENT ($xx.xx)
    // and not break half-way. If BA chooses full currency localization, change this expectation.
    await expect(page.getByTestId('product-price').first(), 'Consistent USD format ($xx.xx) in DE locale (AMB-09 interim rule)').toHaveText(
      /^\s*\$\d+\.\d{2}\s*$/,
    );

    await catalogPage.assertNoHorizontalOverflow();
    await catalogPage.assertVisibleImagesLoaded();
  });
});
