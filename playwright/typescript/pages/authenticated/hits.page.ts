import { type Locator, type Page } from '@fixtures/base.fixture';
import { AbstractPage } from '@pages/abstract.page';

export class HitsPage extends AbstractPage {
  static readonly url = '/zone/hits/';
  static readonly title = 'Orwell Stat - Odsłony';
  static readonly accessKey = 'O';
  static readonly submitLabel = 'Pokaż statystyki';

  constructor(page: Page) {
    super(page, HitsPage.url, HitsPage.title, HitsPage.accessKey);
  }

  // The /zone/hits/ page renders no h-element with text "Odsłony" — the only h2 on the
  // page is "Filtr" (the heading of the filter-form section), and the global h1 is the
  // site-wide logo with accessible name "Orwell Stat". The "Odsłony" string is present
  // only in the document title, the active nav link, and the results-table column-2
  // header — none of which are headings. We therefore expose the real h2 here so the
  // abstract `heading` contract resolves to a visible page-specific heading.
  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Filtr', exact: true });
  }

  // Scope filter-form fields to the `<fieldset>` whose `<legend>` is "Formularz do
  // filtrowania odsłon", so labels like "IP" and "Host" can never be confused with the
  // page-wide logout or style-selector forms also rendered on this page. ARIA: a
  // fieldset+legend exposes role=group with the legend as accessible name — semantic,
  // stable, and Playwright-native (a `form[action=...]` CSS selector flakes on this
  // application/xhtml+xml page even though `document.querySelector` matches it). The
  // submit button + every text/select input lives inside the fieldset, so this scope
  // covers the entire interactive surface of the form.
  get filterForm(): Locator {
    return this.page.getByRole('group', { name: 'Formularz do filtrowania odsłon' });
  }

  // Period combobox ("Okres"). Not part of issue #97's "7 text fields" coverage but
  // exposed so tests can widen the search window past the default 30 days when they
  // need to assert on data outside that window.
  //
  // All form-control getters below use `getByRole(textbox|combobox, { name })` instead
  // of `getByLabel(...)`. On this application/xhtml+xml page Playwright's `getByLabel`
  // (and `getByRole('textbox')` callers via label-walking) returns count=0 because the
  // strict `<label>` / `<input>` nodeName checks fail on XML's lowercase nodeNames —
  // the same root cause as the documented `toHaveValue` / `inputValue` brokenness on
  // XHTML inputs. `getByRole(...)` queries the accessibility tree, which Playwright
  // builds from the rendered DOM and which surfaces each control's `<label>` as its
  // accessible name correctly even on XHTML.
  get periodSelect(): Locator {
    return this.filterForm.getByRole('combobox', { name: 'Okres', exact: true });
  }

  get ipField(): Locator {
    return this.filterForm.getByRole('textbox', { name: 'IP', exact: true });
  }

  get hostField(): Locator {
    return this.filterForm.getByRole('textbox', { name: 'Host', exact: true });
  }

  get browserField(): Locator {
    return this.filterForm.getByRole('textbox', { name: 'Przeglądarka', exact: true });
  }

  get osField(): Locator {
    return this.filterForm.getByRole('textbox', { name: 'System operacyjny', exact: true });
  }

  get languageField(): Locator {
    return this.filterForm.getByRole('textbox', { name: 'Język przeglądarki', exact: true });
  }

  get countryField(): Locator {
    return this.filterForm.getByRole('textbox', { name: 'Kraj', exact: true });
  }

  get colorDepthField(): Locator {
    return this.filterForm.getByRole('textbox', { name: 'Głębia barw', exact: true });
  }

  get rowLimitSelect(): Locator {
    return this.filterForm.getByRole('combobox', {
      name: 'Maksymalna ilość wyświetlanych pozycji',
      exact: true,
    });
  }

  get submitButton(): Locator {
    return this.filterForm.getByRole('button', { name: HitsPage.submitLabel });
  }

  // Single results table on the page. Renders only when the filter returns at least
  // one hit — a zero-result query removes the table from the DOM rather than rendering
  // an empty body, so `toHaveCount(0)` is the assertion for "no matches".
  get resultsTable(): Locator {
    return this.page.locator('table.fixed_table');
  }

  // Data rows in the results table — excludes the header row whose id is `row1`.
  get resultRows(): Locator {
    return this.resultsTable.locator('tr:not(#row1)');
  }

  // Single-cell locator for one results-table column header. Scoped to `#row1` (the
  // header row, see `resultRows`) so it cannot accidentally match a data-row cell that
  // happens to share text with a header. `getByText({ exact: true })` keeps the assertion
  // strict so a product-side header rename surfaces here instead of silently passing.
  columnHeader(label: string): Locator {
    return this.resultsTable.locator('#row1').getByText(label, { exact: true });
  }
}
