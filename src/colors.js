// src/theme/colors.js

/**
 * Defines the color palettes for the application theme.
 * Includes definitions for both light and dark modes based on a Teal and Green primary scheme.
 */

// ==================================
// Light Theme Colors
// ==================================
export const lightColors = {
    // --- Primary Palette ---
    primaryTeal: '#008080',     // Standard Teal: Headers, primary buttons, active tabs
    primaryGreen: '#4CAF50',    // Material Green: Secondary buttons, success states, highlights
  
    // --- Variants (Optional) ---
    // Use for gradients, hover/pressed states if needed
    primaryTealDark: '#00695C',   // Darker shade of primaryTeal
    primaryTealLight: '#4DB6AC',  // Lighter shade of primaryTeal
    primaryGreenDark: '#388E3C',  // Darker shade of primaryGreen
    primaryGreenLight: '#8BC34A', // Lighter shade of primaryGreen
  
    // --- Neutrals ---
    background: '#FFFFFF',     // Main screen background (white)
    surface: '#F5F5F5',        // Background for cards, modals, input fields (light grey)
    border: '#E0E0E0',        // Borders, dividers (medium grey)
    backdrop: 'rgba(0, 0, 0, 0.5)', // Overlay for modals/drawers
  
    // --- Text ---
    textPrimary: '#212121',    // Main text color (near black)
    textSecondary: '#757575',   // Subtitles, hints, secondary info (grey)
    textOnPrimary: '#FFFFFF',   // Text placed on top of primaryTeal or primaryGreen backgrounds (white)
    textDisabled: '#BDBDBD',    // Disabled text or icons
  
    // --- Status & Accents ---
    accent: '#FFC107',         // Optional Accent: e.g., Amber/Yellow for specific highlights
    success: '#28a745',         // Success messages, icons (often a distinct green)
    error: '#dc3545',           // Error messages, icons (red)
    warning: '#ffc107',         // Warning messages, icons (can reuse accent or use specific orange/yellow)
    info: '#17a2b8',           // Informational messages, icons (often a light blue or cyan)
  
    // --- Component Specific (Examples) ---
    // iconDefault: '#757575',
    // iconActive: lightColors.primaryTeal, // Reference other colors
    // tabBackground: '#FFFFFF',
    // tabActive: lightColors.primaryTeal,
    // tabInactive: lightColors.textSecondary,
  };
  
  
  // ==================================
  // Dark Theme Colors
  // ==================================
  export const darkColors = {
    // --- Primary Palette ---
    // Often need slightly lighter/brighter primaries for good contrast on dark backgrounds
    primaryTeal: '#4DB6AC',     // Lighter Teal
    primaryGreen: '#8BC34A',    // Lighter Green
  
    // --- Variants (Optional) ---
    primaryTealDark: '#008080',   // Can use the light theme's primary
    primaryTealLight: '#80CBC4',
    primaryGreenDark: '#4CAF50',   // Can use the light theme's primary
    primaryGreenLight: '#AED581',
  
    // --- Neutrals ---
    background: '#121212',     // Common dark mode background (very dark grey/off-black)
    surface: '#1E1E1E',        // Slightly lighter surface for cards, inputs (dark grey)
    border: '#424242',        // Borders visible on dark backgrounds (medium-dark grey)
    backdrop: 'rgba(0, 0, 0, 0.7)', // Slightly more opaque backdrop might feel better
  
    // --- Text ---
    textPrimary: '#E0E0E0',    // Main text color (light grey/off-white)
    textSecondary: '#B0B0B0',   // Secondary text (medium light grey)
    textOnPrimary: '#000000',   // Text on primary colors (might need black/dark text if primaries are light)
    textDisabled: '#757575',    // Disabled text (darker grey)
  
    // --- Status & Accents ---
    // Ensure these have good contrast against the dark background/surface
    accent: '#FFCA28',         // Slightly adjusted Yellow/Amber
    success: '#8BC34A',         // May reuse primaryGreen or use another distinct light green
    error: '#EF5350',           // Lighter/brighter red often works better
    warning: '#FFA726',         // Lighter/brighter orange/yellow
    info: '#4DD0E1',           // Lighter cyan/blue
  
    // --- Component Specific (Examples) ---
    // iconDefault: '#B0B0B0',
    // iconActive: darkColors.primaryTeal,
    // tabBackground: '#1E1E1E',
    // tabActive: darkColors.primaryTeal,
    // tabInactive: darkColors.textSecondary,
  };
  
  
  // Optional Helper: Function to get theme based on mode
  // export const getThemeColors = (isDarkMode = false) => isDarkMode ? darkColors : lightColors;