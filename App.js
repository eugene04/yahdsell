// App.js

import { enableScreens } from 'react-native-screens';
enableScreens(true); // Call it right at the top

import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import RootNavigator from './navigation/navigation'; // Ensure this path is correct

function App() {
  console.log("[App.js] Rendering App component."); // Add a log
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <RootNavigator />
        <Toast />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});