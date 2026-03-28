import type { ArithmeticProblem } from '../types'

export function buildHints(problem: Pick<ArithmeticProblem, 'left' | 'right' | 'operation'>): string[] {
  const { left, right, operation } = problem
  const hints = new Set<string>()

  if (operation === 'multiplication') {
    const larger = Math.max(left, right)
    const smaller = Math.min(left, right)
    hints.add(`Break ${larger} into friendlier parts, then multiply ${smaller} by each part.`)
    hints.add(`Think of ${smaller} added together ${larger} times.`)
    hints.add('Use a nearby multiplication fact you know, then adjust.')
  }

  if (operation === 'division') {
    hints.add('Think: what number times the divisor gives the dividend?')
    hints.add('Use nearby multiplication facts to test possible quotients.')
    hints.add('Break the dividend into equal groups of the divisor.')
  }

  if (operation === 'addition') {
    hints.add('Look for place values you can combine first: ones, tens, then hundreds.')
    hints.add('Try making a friendly ten or hundred before finishing the sum.')
    hints.add('Break one number apart and add it in smaller chunks.')
  }

  if (operation === 'subtraction') {
    hints.add('Subtract by place value: ones, tens, then hundreds.')
    hints.add('Think about the distance between the two numbers on a number line.')
    hints.add('Count up from the smaller part to the larger number if that feels easier.')
  }

  return [...hints].slice(0, 3)
}
