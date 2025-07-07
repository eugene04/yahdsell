const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure there's a fallback resolver
const defaultResolver = require('metro-resolver');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const problematicPaths = [
    '@react-native-firebase/app/lib/common',
    '@react-native-firebase/app/lib/internal',
    '@react-native-firebase/app/lib/internal/nativeModule',
  ];

  if (problematicPaths.includes(moduleName)) {
    try {
      const newPath = path.resolve(
        __dirname,
        'node_modules',
        moduleName,
        'index.js'
      );
      require.resolve(newPath);
      return {
        filePath: newPath,
        type: 'sourceFile',
      };
    } catch (e) {
      // Fallback to Metro's default resolver
      return defaultResolver.resolve(context, moduleName, platform);
    }
  }

  return defaultResolver.resolve(context, moduleName, platform);
};

module.exports = config;