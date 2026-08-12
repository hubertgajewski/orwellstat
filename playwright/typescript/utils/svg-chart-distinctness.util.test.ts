import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { statisticsParametersMustHaveDistinctLabels } from './svg-chart-distinctness.util.ts';

describe('statisticsParametersMustHaveDistinctLabels', () => {
  test('permits IP and host labels to match in either comparison order', () => {
    assert.equal(statisticsParametersMustHaveDistinctLabels('ip', 'host'), false);
    assert.equal(statisticsParametersMustHaveDistinctLabels('host', 'ip'), false);
  });

  test('requires labels from every other parameter pair to remain distinct', () => {
    assert.equal(statisticsParametersMustHaveDistinctLabels('ip', 'przegladarka'), true);
    assert.equal(statisticsParametersMustHaveDistinctLabels('host', 'http_user_agent'), true);
    assert.equal(statisticsParametersMustHaveDistinctLabels('przegladarka', 'system'), true);
    assert.equal(statisticsParametersMustHaveDistinctLabels('ip', 'ip'), true);
  });
});
