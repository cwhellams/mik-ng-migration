/** Chip colour for an inventory item's recorded condition. */
export function conditionColor(condition: string): 'success' | 'warning' | 'error' | 'default' {
  switch (condition) {
    case 'GOOD':
      return 'success'
    case 'FAIR':
      return 'warning'
    case 'POOR':
      return 'error'
    default:
      return 'default'
  }
}
