export interface StatisticsParameterLabels {
  readonly value: string;
  readonly labels: readonly string[];
}

export interface StatisticsParameterLabelCollision {
  readonly valueA: string;
  readonly valueB: string;
  readonly labelsA: string;
  readonly labelsB: string;
}

export function unexpectedStatisticsParameterLabelCollisions(
  entries: readonly StatisticsParameterLabels[]
): StatisticsParameterLabelCollision[] {
  const collisions: StatisticsParameterLabelCollision[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const entryA = entries[i];
      const entryB = entries[j];
      // Host statistics fall back to the source IP when reverse DNS does not resolve.
      const isIpAndHostPair =
        (entryA.value === 'ip' && entryB.value === 'host') ||
        (entryA.value === 'host' && entryB.value === 'ip');
      if (isIpAndHostPair) continue;

      const labelsA = entryA.labels.join('|');
      const labelsB = entryB.labels.join('|');
      if (labelsA === labelsB) {
        collisions.push({ valueA: entryA.value, valueB: entryB.value, labelsA, labelsB });
      }
    }
  }

  return collisions;
}
