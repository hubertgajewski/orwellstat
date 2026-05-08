// One row from the statistics data table: the dimension label and its rendered percentage.
// The SVG chart visualises the table's first N data rows in the same order.
export interface DataTableRow {
  readonly label: string;
  readonly percent: string;
}

export interface XhtmlSnapshotArgs {
  readonly xhtml: string;
  readonly count: number;
}

// Kept self-contained so Playwright can serialize this function into page.evaluate().
export function dataTableTopRowsFromXhtmlSnapshot({
  xhtml,
  count,
}: XhtmlSnapshotArgs): DataTableRow[] {
  const doc = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) return [];
  const table = doc.querySelector('table');
  if (!table) return [];

  const rows = table.querySelectorAll('tr');
  const topRows: DataTableRow[] = [];
  for (let rowIndex = 1; rowIndex < rows.length && topRows.length < count; rowIndex++) {
    const cells = rows[rowIndex].querySelectorAll('td, th');
    topRows.push({
      label: cells[1]?.textContent?.trim() ?? '',
      percent: cells[3]?.textContent?.trim() ?? '',
    });
  }
  return topRows;
}
