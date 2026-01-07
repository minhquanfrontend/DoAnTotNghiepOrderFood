import { DefaultTheme } from "react-native-paper"

export const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: "#FF6B35",
    accent: "#FFA726",
    background: "#FFFFFF",
    surface: "#FFFFFF",
    text: "#333333",
    textSecondary: "#666666",
    border: "#E0E0E0",
    placeholder: "#999999",
    backdrop: "rgba(0, 0, 0, 0.5)",
    success: "#4CAF50",
    warning: "#FF9800",
    error: "#F44336",
    info: "#2196F3",
  },
  fonts: {
    ...DefaultTheme.fonts,
    regular: {
      fontFamily: "Roboto-Regular",
      fontWeight: "normal",
    },
    medium: {
      fontFamily: "Roboto-Bold",
      fontWeight: "normal",
    },
    light: {
      fontFamily: "Roboto-Regular",
      fontWeight: "normal",
    },
    thin: {
      fontFamily: "Roboto-Regular",
      fontWeight: "normal",
    },
  },
  // make spacing and radius available under theme.spacing and theme.borderRadius
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    round: 50,
  },
}

export const colors = {
  primary: "#FF6B35",
  secondary: "#FFA726",
  success: "#4CAF50",
  warning: "#FF9800",
  error: "#F44336",
  info: "#2196F3",
  light: "#F5F5F5",
  dark: "#333333",
  white: "#FFFFFF",
  black: "#000000",
  gray: "#999999",
  lightGray: "#E0E0E0",
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  round: 50,
}
