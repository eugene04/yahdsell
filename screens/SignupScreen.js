// screens/SignupScreen.js

import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// 1. Import the new firebase modules
import { auth, firestore } from '../firebaseConfig';

const SignupScreen = () => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigation = useNavigation();

  const handleSignup = async () => {
    setError('');

    // --- Validation ---
    if (!displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    // Other validations...

    setLoading(true);

    try {
      // 2. Use the new syntax for creating a user
      const userCredential = await auth().createUserWithEmailAndPassword(email, password);
      const newUser = userCredential.user;
      console.log('User account created successfully!', newUser.uid);

      // 3. Update the user's profile with the display name
      await newUser.updateProfile({
        displayName: displayName.trim(),
      });
      console.log("Auth profile updated with displayName.");

      // 4. Save additional user info to Firestore using the new syntax
      const userDocRef = firestore().collection('users').doc(newUser.uid);
      await userDocRef.set({
        uid: newUser.uid,
        email: newUser.email,
        displayName: displayName.trim(),
        // Use the static FieldValue for server timestamps
        createdAt: firestore.FieldValue.serverTimestamp(),
        profilePicUrl: null, // Initialize other fields as needed
        bio: '',
      });
      console.log('User data saved to Firestore.');

      // Navigation is handled by the onAuthStateChanged listener

    } catch (err) {
      setLoading(false);
      console.error("Signup Error:", err.code, err.message);

      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('This email address is already registered.');
          break;
        case 'auth/invalid-email':
          setError('The email address is not valid.');
          break;
        case 'auth/weak-password':
          setError('Password is too weak (min. 6 characters).');
          break;
        default:
          setError('Failed to create account. Please try again.');
          break;
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoidingContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollInnerContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join the yahdsell marketplace!</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TextInput style={styles.input} placeholder="Display Name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" placeholderTextColor="#888" />
          <TextInput style={styles.input} placeholder="Email Address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholderTextColor="#888"/>
          <TextInput style={styles.input} placeholder="Password (min. 6 characters)" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#888"/>
          <TextInput style={styles.input} placeholder="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholderTextColor="#888"/>

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignup} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>Log In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f8f8' },
    keyboardAvoidingContainer: { flex: 1 },
    scrollInnerContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, paddingVertical: 20 },
    title: { fontSize: 32, fontWeight: 'bold', marginBottom: 10, color: '#333' },
    subtitle: { fontSize: 16, color: '#666', marginBottom: 30, textAlign: 'center' },
    input: { width: '100%', height: 50, backgroundColor: '#ffffff', borderColor: '#cccccc', borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, marginBottom: 15, fontSize: 16 },
    button: { width: '100%', height: 50, backgroundColor: '#28a745', justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginTop: 10 },
    buttonDisabled: { backgroundColor: '#cccccc' },
    buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
    errorText: { color: 'red', marginBottom: 15, fontSize: 14, textAlign: 'center' },
    footer: { flexDirection: 'row', marginTop: 25, justifyContent: 'center', alignItems: 'center' },
    footerText: { fontSize: 14, color: '#666' },
    linkText: { fontSize: 14, color: '#007bff', fontWeight: '600' },
});

export default SignupScreen;
