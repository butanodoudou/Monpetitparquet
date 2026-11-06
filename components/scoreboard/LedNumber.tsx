// Chiffres à 7 segments, dessinés en SVG : les segments éteints restent visibles, comme sur un vrai tableau.

const SEGMENTS: Record<string, string> = {
  a: '5,2 25,2 21,7 9,7',
  b: '26,4 26,25 23,27 21,24 21,9',
  c: '26,50 26,29 23,27 21,30 21,45',
  d: '5,52 25,52 21,47 9,47',
  e: '4,50 4,29 7,27 9,30 9,45',
  f: '4,4 4,25 7,27 9,24 9,9',
  g: '7,27 10,24.5 20,24.5 23,27 20,29.5 10,29.5',
};

const DIGITS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};

function Digit({ value }: { value: string }) {
  const lit = DIGITS[value] ?? '';
  return (
    <svg className="led-digit" viewBox="0 0 30 54" aria-hidden="true">
      {Object.entries(SEGMENTS).map(([name, points]) => (
        <polygon key={name} points={points} className={lit.includes(name) ? 'led-on' : 'led-off'} />
      ))}
    </svg>
  );
}

/** Score au format français : 89,4 */
export default function LedNumber({ value, label }: { value: number; label: string }) {
  const [whole, decimal] = value.toFixed(1).split('.');
  return (
    <span className="led-number" role="img" aria-label={`${label} : ${value.toFixed(1).replace('.', ',')} points`}>
      {whole.padStart(2, '0').split('').map((digit, i) => <Digit key={i} value={digit} />)}
      <span className="led-comma" aria-hidden="true" />
      <Digit value={decimal} />
    </span>
  );
}
