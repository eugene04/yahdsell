// screens/GroupChatScreen.js (with KeyboardAvoidingView Fix)

import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
    View, StyleSheet, ActivityIndicator, Text, SafeAreaView,
    TouchableOpacity, Platform, Alert,
    // *** 1. Import KeyboardAvoidingView ***
    KeyboardAvoidingView
} from 'react-native';
import { GiftedChat, Actions } from 'react-native-gifted-chat';
import { useRoute, useNavigation } from '@react-navigation/native';

// Import Firebase services and functions
import { firestore, auth, storage } from '../firebaseConfig'; // Adjust path if needed
import {
    collection, addDoc, orderBy, query, onSnapshot, serverTimestamp, doc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// Auth listener not strictly needed here if entry is protected by navigator
// import { onAuthStateChanged } from 'firebase/auth';

// Import expo-image-picker
import * as ImagePicker from 'expo-image-picker';

// Optional Icon library
// import Icon from 'react-native-vector-icons/Ionicons';

// Import Theme hook if you want themed styles (Optional, using basic styles for now)
// import { useTheme } from '../src/ThemeContext';

const GroupChatScreen = () => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [imageUploading, setImageUploading] = useState(false);
    const route = useRoute();
    const navigation = useNavigation();
    // const { colors, isDarkMode } = useTheme(); // Uncomment if using themed styles

    // Get groupId and groupName passed via navigation parameters
    const { groupId, groupName } = route.params || {};

    const currentUser = auth.currentUser;

    // Set Navigation Header Title dynamically
    useLayoutEffect(() => {
        navigation.setOptions({ title: groupName || 'Group Chat' });
    }, [navigation, groupName]);

    // Effect to listen for new messages in Firestore group subcollection
    useEffect(() => {
        // Check for current user - Although navigator should handle this, good practice
        if (!currentUser) {
            setError("Authentication error. Please log in.");
            setLoading(false);
            Alert.alert("Login Required", "Please log in to view group chat.", [
                 { text: "OK", onPress: () => navigation.navigate('Login') } // Or go back?
            ]);
            return;
        }
        if (!groupId) {
            setError("Group ID not specified.");
            setLoading(false);
            console.error("Group ID missing.");
            Alert.alert("Error", "Cannot load chat. Group ID is missing.", [
                 { text: "OK", onPress: () => navigation.goBack() }
            ]);
            return;
        }

        setLoading(true);
        setError(null);

        const messagesCollectionRef = collection(firestore, 'groups', groupId, 'messages');
        const q = query(messagesCollectionRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedMessages = querySnapshot.docs.map(doc => {
                const firebaseData = doc.data();
                return {
                    _id: doc.id,
                    text: firebaseData.text || '',
                    createdAt: firebaseData.createdAt?.toDate() || new Date(),
                    user: firebaseData.user || { _id: 'unknown', name: 'Unknown' },
                    image: firebaseData.image || null,
                };
            });
            setMessages(fetchedMessages);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching group messages: ", err);
            setError("Failed to load messages.");
            setLoading(false);
        });
        return () => unsubscribe(); // Cleanup listener
    }, [groupId, currentUser, navigation]); // Added navigation for error redirect

    // Send Text Message
    const onSend = useCallback((messagesToSend = []) => {
        // Re-check currentUser - might have logged out while screen is open
        if (!currentUser || !groupId) {
             Alert.alert("Error", "Cannot send message. Please ensure you are logged in.");
             return;
        }
        const { text } = messagesToSend[0];
        const messageData = {
            text: text,
            createdAt: serverTimestamp(),
            user: { // Store info about the sender with the message
                _id: currentUser.uid,
                name: currentUser.displayName || currentUser.email || 'Me',
            },
        };
        addDoc(collection(firestore, 'groups', groupId, 'messages'), messageData)
            .catch((err) => {
                console.error("Error sending group text message:", err);
                Alert.alert("Error", "Failed to send message.");
            });
    }, [groupId, currentUser]);


    // Image Upload and Message Sending
    const uploadImageAndSend = async (imageUri) => {
        if (!imageUri || !currentUser || !groupId) {
            Alert.alert("Error", "Cannot send image. Please ensure you are logged in.");
            return;
        };
        setImageUploading(true);
        let downloadURL = '';
        let storagePath = '';

        try {
            const response = await fetch(imageUri);
            const blob = await response.blob();
            const fileExtension = imageUri.split('.').pop() || 'jpg';
            const filename = `${currentUser.uid}_${Date.now()}.${fileExtension}`;
            storagePath = `groupChatImages/${groupId}/${filename}`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, blob);
            downloadURL = await getDownloadURL(storageRef);

            const messageData = {
                image: downloadURL,
                createdAt: serverTimestamp(),
                user: {
                    _id: currentUser.uid,
                    name: currentUser.displayName || currentUser.email || 'Me',
                },
            };
            await addDoc(collection(firestore, 'groups', groupId, 'messages'), messageData);
            console.log("Group image message sent successfully!");

        } catch (error) {
            console.error("Error sending group image message:", error);
            Alert.alert("Error", "Failed to send image.");
        } finally {
            setImageUploading(false);
        }
       };

    // Handle Image Picking using expo-image-picker
    const handlePickImage = async () => {
        // Re-check user
        if (!currentUser) {
             Alert.alert("Login Required", "Log in to send images.", [{ text: "Cancel"}, { text: "Log In", onPress: () => navigation.navigate('Login') }]); return;
        }
        setError(''); // Clear previous errors
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required','Sorry, we need camera roll permissions!'); return;
        }
        try {
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true,
                aspect: [4, 3], quality: 0.7,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                uploadImageAndSend(result.assets[0].uri);
            } else if (result.canceled) {
                 console.log('User cancelled image picker (Expo)');
            }
        } catch (pickerError) {
            console.error("Error launching Image Library:", pickerError);
            Alert.alert("Error", "Could not open image library.");
        }
    };

    // Custom Actions Button component
    const renderActions = (props) => (
        <Actions
            {...props}
            containerStyle={styles.actionsContainer}
            // Use themed color if available: color: colors.primaryTeal
            icon={() => (<Text style={[styles.actionsIconText, { color: '#007bff' }]}>+</Text>)}
            options={{ 'Choose From Library': handlePickImage, 'Cancel': () => {}, }}
            optionTintColor="#007bff" // Use themed color if available
        />
    );

    // --- Render Logic ---
    if (loading) {
        // Use themed color if available: color="#007bff" -> color={colors.primaryTeal}
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color="#007bff" /></SafeAreaView>;
    }
    if (error && !loading) { // Show error only if not loading
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    }
    // This check might be redundant due to useEffect check, but safe fallback
    if (!currentUser || !groupId) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>Cannot load group chat. Missing user or group info.</Text></SafeAreaView>;
    }

    return (
        // Use themed background: backgroundColor: '#fff' -> backgroundColor: colors.background
        <SafeAreaView style={styles.safeArea}>
            {imageUploading && <ActivityIndicator style={styles.uploadIndicator} size="small" color="#007bff" />}

            {/* *** 2. Wrap GiftedChat with KeyboardAvoidingView *** */}
            <KeyboardAvoidingView
                 style={styles.keyboardAvoidingContainer} // Ensure it takes up space
                 behavior={Platform.OS === "ios" ? "padding" : "height"}
                 // Adjust offset if header/tab bar cause issues. May require importing:
                 // import { useHeaderHeight } from '@react-navigation/elements';
                 // import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
                 // const headerHeight = useHeaderHeight();
                 // const tabBarHeight = useBottomTabBarHeight();
                 // keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight + tabBarHeight : 0} // Example
                 keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0} // Start with an estimated offset if needed
            >
                <GiftedChat
                    messages={messages}
                    onSend={messagesToSend => onSend(messagesToSend)} // Handles text
                    user={{ // Sets the current user sending messages
                        _id: currentUser.uid,
                        name: currentUser.displayName || currentUser.email || 'Me'
                    }}
                    renderActions={renderActions} // Adds the '+' button for images
                    placeholder="Type your message..."
                    alwaysShowSend
                    // renderUsernameOnMessage={true} // Shows sender name above bubble
                    // showUserAvatar={true} // Shows avatar if message.user.avatar exists
                />
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}; // End of GroupChatScreen

// --- Styles --- (Using basic styles, replace with themed styles if desired)
const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#fff' }, // Use colors.background
    keyboardAvoidingContainer: { flex: 1 }, // Added style for KAV
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f8f8f8' }, // Use colors.background
    errorText: { color: 'red', fontSize: 16, textAlign: 'center' }, // Use colors.error
    actionsContainer: { width: 26, height: 26, marginLeft: 10, marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
    actionsIconText: { fontSize: 24, fontWeight: 'bold' /* color set dynamically or theme */ },
    uploadIndicator: { position: 'absolute', top: 10, right: 10, zIndex: 10 }, // Simple indicator
});

// --- Export Component ---
export default GroupChatScreen;