import { test, expect } from '@fixtures/base.fixture';
import { dataTableTopRowsFromXhtml } from '@utils/svg-chart.util';

test(
  'data table rows can be read from a captured XHTML snapshot',
  { tag: '@regression' },
  async ({ page }) => {
    const snapshotXhtml = `
      <html xmlns="http://www.w3.org/1999/xhtml">
        <body>
          <table>
            <tr><th>Lp</th><th>Label</th><th>Count</th><th>Percent</th></tr>
            <tr><td>1</td><td> Snapshot browser Łódź\t</td><td>8</td><td> 80.00% </td></tr>
            <tr><td>2</td><td>Snapshot mobile</td><td>2</td><td>20.00%</td></tr>
          </table>
        </body>
      </html>
  `;

    await page.setContent(`
    <table>
      <tr><th>Lp</th><th>Label</th><th>Count</th><th>Percent</th></tr>
      <tr><td>1</td><td>Live browser</td><td>10</td><td>100.00%</td></tr>
    </table>
  `);

    await expect(dataTableTopRowsFromXhtml(page, snapshotXhtml, 2)).resolves.toEqual([
      { label: 'Snapshot browser Łódź', percent: '80.00%' },
      { label: 'Snapshot mobile', percent: '20.00%' },
    ]);
    await expect(dataTableTopRowsFromXhtml(page, snapshotXhtml, 1)).resolves.toEqual([
      { label: 'Snapshot browser Łódź', percent: '80.00%' },
    ]);

    await expect(dataTableTopRowsFromXhtml(page, '<html><body></body></html>', 2)).resolves.toEqual(
      []
    );
    await expect(dataTableTopRowsFromXhtml(page, '<html><body></html>', 2)).resolves.toEqual([]);
  }
);
