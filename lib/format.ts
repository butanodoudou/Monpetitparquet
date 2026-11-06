/** Points au format français : 89,4 */
export function formatPoints(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
