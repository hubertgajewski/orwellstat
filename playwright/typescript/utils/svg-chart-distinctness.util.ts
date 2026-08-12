// Host statistics fall back to the source IP when reverse DNS does not resolve, so the
// host and IP dimensions can legitimately expose the same labels for a given dataset.
export function statisticsParametersMustHaveDistinctLabels(
  valueA: string,
  valueB: string
): boolean {
  const isIpAndHostPair =
    (valueA === 'ip' && valueB === 'host') || (valueA === 'host' && valueB === 'ip');

  return !isIpAndHostPair;
}
