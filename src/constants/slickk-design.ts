// SLICKK UI FOUNDATION V1
export const SlickkColors = {
  background: '#06101D',
  backgroundRaised: '#091728',
  surface: '#0C1B2D',
  surfaceStrong: '#10243A',
  surfaceSoft: '#0A1726',
  border: '#1B3148',
  borderStrong: '#294A62',
  text: '#F7FAFC',
  textSoft: '#A5B4C5',
  textMuted: '#71849A',
  mint: '#70F7D4',
  mintDeep: '#173E3D',
  blue: '#6DA8FF',
  amber: '#FFD47A',
  danger: '#FF9EAF',
  blackInk: '#071421',
  overlay: 'rgba(4, 12, 23, 0.76)',
} as const;

export const SlickkRadius = {
  small: 12,
  medium: 16,
  large: 22,
  xlarge: 28,
  pill: 999,
} as const;

export const SlickkSpace = {
  xsmall: 6,
  small: 10,
  medium: 14,
  large: 20,
  xlarge: 28,
  xxlarge: 36,
} as const;

export const SlickkTypography = {
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900' as const,
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 32,
    lineHeight: 39,
    fontWeight: '900' as const,
    letterSpacing: -0.9,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900' as const,
    letterSpacing: -0.35,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500' as const,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800' as const,
  },
} as const;
