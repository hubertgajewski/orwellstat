import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { unexpectedStatisticsParameterLabelCollisions } from './svg-chart-distinctness.util.ts';

describe('unexpectedStatisticsParameterLabelCollisions', () => {
  test('permits identical IP and host fallback labels in either order', () => {
    const labels = ['192.0.2.1'];

    assert.deepEqual(
      unexpectedStatisticsParameterLabelCollisions([
        { value: 'ip', labels },
        { value: 'host', labels },
      ]),
      []
    );
    assert.deepEqual(
      unexpectedStatisticsParameterLabelCollisions([
        { value: 'host', labels },
        { value: 'ip', labels },
      ]),
      []
    );
  });

  test('reports both parameter values for a non-exempt duplicate', () => {
    assert.deepEqual(
      unexpectedStatisticsParameterLabelCollisions([
        { value: 'przegladarka', labels: ['shared'] },
        { value: 'system', labels: ['shared'] },
      ]),
      [
        {
          valueA: 'przegladarka',
          valueB: 'system',
          labelsA: 'shared',
          labelsB: 'shared',
        },
      ]
    );
  });

  test('ignores non-exempt parameters whose labels differ', () => {
    assert.deepEqual(
      unexpectedStatisticsParameterLabelCollisions([
        { value: 'przegladarka', labels: ['Chrome'] },
        { value: 'system', labels: ['Linux'] },
      ]),
      []
    );
  });
});
