export function langFlagIcon(lang: string | undefined): string {
  switch (lang) {
    case 'fi':
      return 'circle-flags:fi'
    case 'sv':
      return 'circle-flags:se'
    default:
      return 'circle-flags:gb'
  }
}
