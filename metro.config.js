// metro.config.js

const { getDefaultConfig } = require('expo/metro-config');
const { resolve: metroResolve } = require('metro-resolver');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Override the default resolver with our custom logic.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    // First, attempt to resolve the module using the standard Metro resolver.
    // This will work for the vast majority of packages.
    return metroResolve(context, moduleName, platform);
  } catch (error) {
    // If the standard resolution fails, we check if it's an error we can handle.
    // We are looking for resolution errors specifically within @react-native-firebase.
    if (error.constructor.name === 'ResolutionError' && moduleName.startsWith('@react-native-firebase/')) {
      try {
        // If it is a Firebase module that failed, our workaround is to try resolving it again
        // by explicitly appending '/index.js' to the path. This handles cases where Metro
        // expects a file but finds a directory.
        const newModuleName = `${moduleName}/index.js`;
        return metroResolve(context, newModuleName, platform);
      } catch (newError) {
        // If our workaround also fails, we throw the original, more informative error.
        throw error;
      }
    }
    // For any other type of error, we re-throw it.
    throw error;
  }
};

module.exports = config;
