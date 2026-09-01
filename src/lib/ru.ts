/** 1 труба, 2 трубы, 5 труб, 21 труба, 25 труб */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(count))
  const n10 = abs % 10
  const n100 = abs % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
  return many
}

export function tubesWord(count: number): string {
  return pluralRu(count, 'труба', 'трубы', 'труб')
}

export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits).replace('.', ',')}%`
}
