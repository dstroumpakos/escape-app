/**
 * UNLOCKED horror design tokens, the same palette the website uses
 * (escape-web/src/app/globals.css). Every screen reads these, so the whole
 * app goes dark at once.
 */
export const theme = {
  colors: {
    bgPrimary: '#080505',
    bgSecondary: '#110909',
    bgCard: 'rgba(17, 9, 9, 0.92)',
    bgCardSolid: '#110909',
    surface: '#1B0F0E',
    /** Translucent page colour for tab bars and sticky footers. */
    bgBar: 'rgba(8, 5, 5, 0.96)',
    /** Fills: buttons, markers, active chips. */
    redPrimary: '#D4141F',
    redDark: '#8F0610',
    /** Red text and icons on dark; readable where redPrimary is too dim. */
    redLight: '#FF2A36',
    blood: '#5C0008',
    redGlow: 'rgba(200, 16, 27, 0.35)',
    redSubtle: 'rgba(200, 16, 27, 0.15)',
    textPrimary: '#ECE2D6',
    bone: '#E8DCC8',
    textSecondary: '#A3958C',
    textMuted: '#8F7B75',
    success: '#4CAF50',
    warning: '#FFA726',
    border: '#2A1215',
    glass: 'rgba(0, 0, 0, 0.35)',
    glassBorder: '#36171A',
    gold: '#C99A2E',
  },
  /** Sharper corners everywhere: nothing about this place is soft. */
  radius: {
    sm: 3,
    md: 5,
    lg: 6,
    xl: 10,
    full: 9999,
  },
  /**
   * Loaded in App.tsx. Each family is a single weight, so never pair these
   * with fontWeight (Android would fake-bold them).
   */
  fonts: {
    display: 'NotoSerifDisplay_700Bold',
    displayBlack: 'NotoSerifDisplay_900Black',
    type: 'SpecialElite_400Regular',
  },
  /** The button gradient, top to bottom. */
  buttonGradient: ['#D4141F', '#C8101B', '#8F0610'] as const,
  shadow: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.6,
      shadowRadius: 16,
      elevation: 8,
    },
    red: {
      shadowColor: '#C8101B',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.55,
      shadowRadius: 12,
      elevation: 6,
    },
  },
};
