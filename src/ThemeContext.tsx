// src/context/ThemeContext.tsx (Add type annotation)

import React, { createContext, useState, useContext, useEffect } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { lightColors, darkColors } from '../src/colors'; // Verify path

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

  // --- FIX: Add explicit type annotation ---
  const providerValue: ThemeContextData = {
    theme: currentThemeMode,
    colors: currentColors,
    isDarkMode,
    // Provide the optional function if needed by consumers, otherwise omit
    // setTheme: (newTheme: 'light' | 'dark') => setIsDarkMode(newTheme === 'dark'),
  };
  // --- END FIX ---

  console.log("ThemeProvider providing value:", JSON.stringify(providerValue)); // Keep for debugging if needed

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