// src/context/ThemeContext.tsx

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
// --- FIX: Corrected the import path to be relative to the current directory ---
import { darkColors, lightColors } from './colors';

// Define shape for context data
interface ThemeContextData {
  theme: 'light' | 'dark';
  colors: typeof lightColors;
  isDarkMode: boolean;
  setTheme?: (theme: 'light' | 'dark') => void; // Optional setter
}

// Create Context
const ThemeContext = createContext<ThemeContextData>({
  theme: 'light',
  colors: lightColors,
  isDarkMode: false,
  setTheme: () => { console.warn('ThemeProvider context is not available'); },
});

// Theme Provider component
export const ThemeProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');

  useEffect(() => {
    setIsDarkMode(systemColorScheme === 'dark');
  }, [systemColorScheme]);

  const currentThemeMode = isDarkMode ? 'dark' : 'light';
  const currentColors = isDarkMode ? darkColors : lightColors;

  const providerValue: ThemeContextData = {
    theme: currentThemeMode,
    colors: currentColors,
    isDarkMode,
  };

  return (
    <ThemeContext.Provider value={providerValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook remains the same
export const useTheme = (): ThemeContextData => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
