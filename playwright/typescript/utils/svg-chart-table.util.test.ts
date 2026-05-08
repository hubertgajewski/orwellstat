import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { dataTableTopRowsFromXhtmlSnapshot } from './svg-chart-table.util.ts';

interface ParsedCell {
  readonly textContent: string | null;
}

interface ParsedRow {
  querySelectorAll(selector: 'td, th'): readonly ParsedCell[];
}

interface ParsedTable {
  querySelectorAll(selector: 'tr'): readonly ParsedRow[];
}

interface ParsedDocument {
  querySelector(selector: 'parsererror'): object | null;
  querySelector(selector: 'table'): ParsedTable | null;
}

class FakeCell implements ParsedCell {
  readonly textContent: string | null;

  constructor(textContent: string | null) {
    this.textContent = textContent;
  }
}

class FakeRow implements ParsedRow {
  private readonly cells: readonly FakeCell[];

  constructor(cells: readonly FakeCell[]) {
    this.cells = cells;
  }

  querySelectorAll(selector: 'td, th'): readonly FakeCell[] {
    assert.equal(selector, 'td, th');
    return this.cells;
  }
}

class FakeTable implements ParsedTable {
  private readonly rows: readonly FakeRow[];

  constructor(rows: readonly FakeRow[]) {
    this.rows = rows;
  }

  querySelectorAll(selector: 'tr'): readonly FakeRow[] {
    assert.equal(selector, 'tr');
    return this.rows;
  }
}

class FakeDocument implements ParsedDocument {
  private readonly table: FakeTable | null;
  private readonly hasParserError: boolean;

  constructor(table: FakeTable | null, hasParserError = false) {
    this.table = table;
    this.hasParserError = hasParserError;
  }

  querySelector(selector: 'parsererror'): object | null;
  querySelector(selector: 'table'): FakeTable | null;
  querySelector(selector: 'parsererror' | 'table'): FakeTable | object | null {
    if (selector === 'parsererror') return this.hasParserError ? {} : null;
    return this.table;
  }
}

describe('dataTableTopRowsFromXhtmlSnapshot', () => {
  test('reads top table rows from a captured XHTML parse result', () => {
    const xhtml = '<html xmlns="http://www.w3.org/1999/xhtml"><body><table /></body></html>';
    const table = new FakeTable([
      new FakeRow([
        new FakeCell('Lp'),
        new FakeCell('Label'),
        new FakeCell('Count'),
        new FakeCell('Percent'),
      ]),
      new FakeRow([
        new FakeCell('1'),
        new FakeCell(' https://example.test/Łódź?device=phone&source=chart\t'),
        new FakeCell('8'),
        new FakeCell(' 80.00% '),
      ]),
      new FakeRow([
        new FakeCell('2'),
        new FakeCell('Mozilla/5.0 (Android 15)'),
        new FakeCell('2'),
        new FakeCell('20.00%'),
      ]),
    ]);

    withFakeDomParser(xhtml, new FakeDocument(table), () => {
      assert.deepEqual(dataTableTopRowsFromXhtmlSnapshot({ xhtml, count: 1 }), [
        { label: 'https://example.test/Łódź?device=phone&source=chart', percent: '80.00%' },
      ]);
      assert.deepEqual(dataTableTopRowsFromXhtmlSnapshot({ xhtml, count: 2 }), [
        { label: 'https://example.test/Łódź?device=phone&source=chart', percent: '80.00%' },
        { label: 'Mozilla/5.0 (Android 15)', percent: '20.00%' },
      ]);
    });
  });

  test('returns an empty list for zero or negative row counts', () => {
    const xhtml = '<html xmlns="http://www.w3.org/1999/xhtml"><body><table /></body></html>';
    const table = new FakeTable([
      new FakeRow([
        new FakeCell('Lp'),
        new FakeCell('Label'),
        new FakeCell('Count'),
        new FakeCell('Percent'),
      ]),
      new FakeRow([
        new FakeCell('1'),
        new FakeCell('Firefox'),
        new FakeCell('8'),
        new FakeCell('80.00%'),
      ]),
    ]);

    withFakeDomParser(xhtml, new FakeDocument(table), () => {
      assert.deepEqual(dataTableTopRowsFromXhtmlSnapshot({ xhtml, count: 0 }), []);
      assert.deepEqual(dataTableTopRowsFromXhtmlSnapshot({ xhtml, count: -1 }), []);
    });
  });

  test('returns every available data row when count is larger than the table body', () => {
    const xhtml = '<html xmlns="http://www.w3.org/1999/xhtml"><body><table /></body></html>';
    const table = new FakeTable([
      new FakeRow([
        new FakeCell('Lp'),
        new FakeCell('Label'),
        new FakeCell('Count'),
        new FakeCell('Percent'),
      ]),
      new FakeRow([
        new FakeCell('1'),
        new FakeCell('Firefox'),
        new FakeCell('8'),
        new FakeCell('80.00%'),
      ]),
    ]);

    withFakeDomParser(xhtml, new FakeDocument(table), () => {
      assert.deepEqual(dataTableTopRowsFromXhtmlSnapshot({ xhtml, count: 10 }), [
        { label: 'Firefox', percent: '80.00%' },
      ]);
    });
  });

  test('returns an empty list when the table has no data rows', () => {
    const xhtml = '<html xmlns="http://www.w3.org/1999/xhtml"><body><table /></body></html>';
    const table = new FakeTable([
      new FakeRow([
        new FakeCell('Lp'),
        new FakeCell('Label'),
        new FakeCell('Count'),
        new FakeCell('Percent'),
      ]),
    ]);

    withFakeDomParser(xhtml, new FakeDocument(table), () => {
      assert.deepEqual(dataTableTopRowsFromXhtmlSnapshot({ xhtml, count: 2 }), []);
    });
  });

  test('falls back to empty strings when label or percent cells are absent or null', () => {
    const xhtml = '<html xmlns="http://www.w3.org/1999/xhtml"><body><table /></body></html>';
    const table = new FakeTable([
      new FakeRow([
        new FakeCell('Lp'),
        new FakeCell('Label'),
        new FakeCell('Count'),
        new FakeCell('Percent'),
      ]),
      new FakeRow([new FakeCell('1'), new FakeCell(null), new FakeCell('8'), new FakeCell(null)]),
      new FakeRow([new FakeCell('2')]),
    ]);

    withFakeDomParser(xhtml, new FakeDocument(table), () => {
      assert.deepEqual(dataTableTopRowsFromXhtmlSnapshot({ xhtml, count: 2 }), [
        { label: '', percent: '' },
        { label: '', percent: '' },
      ]);
    });
  });

  test('returns an empty list when the captured XHTML has no usable table', () => {
    const xhtml = '<html xmlns="http://www.w3.org/1999/xhtml"><body /></html>';

    withFakeDomParser(xhtml, new FakeDocument(null), () => {
      assert.deepEqual(dataTableTopRowsFromXhtmlSnapshot({ xhtml, count: 2 }), []);
    });
  });

  test('returns an empty list when the captured XHTML parse reports an error', () => {
    const xhtml = '<html><body></html>';

    withFakeDomParser(xhtml, new FakeDocument(null, true), () => {
      assert.deepEqual(dataTableTopRowsFromXhtmlSnapshot({ xhtml, count: 2 }), []);
    });
  });
});

function withFakeDomParser(expectedXhtml: string, document: ParsedDocument, callback: () => void) {
  const originalDOMParser = globalThis.DOMParser;

  globalThis.DOMParser = class {
    parseFromString(xhtml: string, mimeType: string): Document {
      assert.equal(xhtml, expectedXhtml);
      assert.equal(mimeType, 'application/xhtml+xml');
      return document as Document;
    }
  } as typeof DOMParser;

  try {
    callback();
  } finally {
    if (originalDOMParser) {
      globalThis.DOMParser = originalDOMParser;
    } else {
      Reflect.deleteProperty(globalThis, 'DOMParser');
    }
  }
}
