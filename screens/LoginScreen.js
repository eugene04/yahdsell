// LoginScreen.js (with Password Reset)

import React, { useState } from 'react'; // Import useMemo if using themed styles
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// Import initialized auth instance and specific functions
import { useNavigation } from '@react-navigation/native';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'; // Import the functions
import { auth } from '../firebaseConfig'; // Adjust path if needed
// Import theme hook if using themed styles
// import { useTheme } from '../src/ThemeContext';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigation = useNavigation();
    // const { colors, isDarkMode } = useTheme(); // Uncomment if using themed styles

    // Generate styles (useMemo if themed)
    // const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);
    const styles = staticStyles; // Use static styles for now

    const handleLogin = async () => {
        if (!email || !password) {
            setError('Please enter both email and password.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log('User signed in successfully!', userCredential.user.uid);
            // Navigation to Home is handled by the RootNavigator's onAuthStateChanged listener
        } catch (err) {
            setLoading(false);
            console.error("Login Error:", err.code, err.message);
            switch (err.code) {
                case 'auth/invalid-email':
                    setError('Please enter a valid email address.'); break;
                case 'auth/user-disabled':
                    setError('This user account has been disabled.'); break;
                case 'auth/user-not-found':
                case 'auth/invalid-credential': // Newer SDKs might use this for both not found and wrong password
                    setError('Incorrect email or password. Please try again.'); break;
                // case 'auth/wrong-password': // Less common now
                //    setError('Incorrect password. Please try again.'); break;
                case 'auth/too-many-requests':
                    setError('Too many login attempts. Please try again later.'); break;
                default:
                    setError('Login failed. Please check credentials and try again.'); break;
            }
        }
        // No need to setLoading(false) on success because component unmounts
    };

    // --- Password Reset Handler ---
    const handlePasswordReset = async () => {
        if (!email) {
            Alert.alert("Email Required", "Please enter your email address in the field above first.");
            return;
        }
        setError(''); // Clear previous errors
        setLoading(true); // Show loading indicator

        try {
            await sendPasswordResetEmail(auth, email);
            Alert.alert(
                "Password Reset Email Sent",
                `An email has been sent to ${email} with instructions to reset your password. Please check your inbox (and spam folder).`
            );
        } catch (err) {
            console.error("Password Reset Error:", err.code, err.message);
            // Provide user-friendly errors
            switch (err.code) {
                 case 'auth/invalid-email':
                    setError('The email address entered is not valid.'); break;
                 case 'auth/user-not-found':
                    setError('No account found with this email address.'); break;
                 case 'auth/missing-email': // Should be caught by our initial check, but good fallback
                     setError('Please enter your email address first.'); break;
                case 'auth/too-many-requests':
                    setError('Too many requests. Please try again later.'); break;
                 default:
                    setError('Failed to send password reset email. Please try again.'); break;
            }
            // Show the error state in the UI
            // Alert.alert("Error", "Could not send password reset email. Please check the email address and try again.");
        } finally {
            setLoading(false); // Hide loading indicator
        }
    };
    // --- End Password Reset Handler ---

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardAvoidingContainer}
            >
                <View style={styles.innerContainer}>
                    <Text style={styles.title}>Log In</Text>
                    <Text style={styles.subtitle}>Welcome back to yahdsell!</Text>

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    <TextInput
                        style={styles.input}
                        placeholder="Email Address"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholderTextColor="#888"
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        placeholderTextColor="#888"
                    />

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                            <Text style={styles.buttonText}>Log In</Text>
                        )}
                    </TouchableOpacity>

                    {/* --- Forgot Password Link --- */}
                    <TouchableOpacity onPress={handlePasswordReset} style={styles.forgotPasswordButton} disabled={loading}>
                        <Text style={styles.linkText}>Forgot Password?</Text>
                    </TouchableOpacity>
                    {/* --- End Forgot Password Link --- */}


                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Don't have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Signup')} disabled={loading}>
                            <Text style={styles.linkText}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

// --- Styles (Using static styles for simplicity, adapt if using theme) ---
// const themedStyles = (colors, isDarkMode) => StyleSheet.create({ ... });
const staticStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f8f8', // Example light background
    },
    keyboardAvoidingContainer: {
        flex: 1,
    },
    innerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333', // Example text color
    },
    subtitle: {
        fontSize: 16,
        color: '#666', // Example secondary text
        marginBottom: 30,
    },
    input: {
        width: '100%',
        height: 50,
        backgroundColor: '#ffffff',
        borderColor: '#cccccc',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 15,
        marginBottom: 15,
        fontSize: 16,
        color: '#333', // Example input text color
    },
    button: {
        width: '100%',
        height: 50,
        backgroundColor: '#007bff', // Example primary color
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        marginTop: 10,
    },
    buttonText: {
        color: '#ffffff', // Example text on primary
        fontSize: 18,
        fontWeight: 'bold',
    },
    errorText: {
        color: 'red', // Example error color
        marginBottom: 15,
        fontSize: 14,
        textAlign: 'center',
    },
    forgotPasswordButton: { // Style for the new button
        marginTop: 15,
        paddingVertical: 5, // Add some padding for easier tapping
    },
    footer: {
        flexDirection: 'row',
        marginTop: 25,
    },
    footerText: {
        fontSize: 14,
        color: '#666',
    },
    linkText: { // Common style for links
        fontSize: 14,
        color: '#007bff', // Example primary color
        fontWeight: '600',
    },
});

// Assign styles (change if using theme)
const styles = staticStyles;

export default LoginScreen;
