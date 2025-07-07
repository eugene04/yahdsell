// screens/PrivateChatScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Actions, GiftedChat, MessageImage, Send } from 'react-native-gifted-chat';

// Import the initialized services from your central config file
import { auth, firestore, storage } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

/**
 * Helper function to create a consistent, sorted chat ID for two users.
 * @param {string} uid1 - The first user's ID.
 * @param {string} uid2 - The second user's ID.
 * @returns {string|null} The generated chat ID or null if UIDs are missing.
 */
const generateChatId = (uid1, uid2) => {
    if (!uid1 || !uid2) {
        console.warn("generateChatId: One or both UIDs are missing.");
        return null;
    }
    return [uid1, uid2].sort().join('_');
};

const PrivateChatScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    const headerHeight = useHeaderHeight();

    const { recipientId, recipientName, recipientAvatar } = route.params || {};
    const currentUser = auth().currentUser;

    // --- State Management ---
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [imageUploading, setImageUploading] = useState(false);
    const [imageModalVisible, setImageModalVisible] = useState(false);
    const [selectedImageUri, setSelectedImageUri] = useState(null);

    // --- Memoized Values ---
    const chatId = useMemo(() => {
        if (!currentUser?.uid || !recipientId) return null;
        return generateChatId(currentUser.uid, recipientId);
    }, [currentUser?.uid, recipientId]);

    // --- Effects ---

    // Set navigation header title
    useLayoutEffect(() => {
        navigation.setOptions({ title: recipientName || 'Chat' });
    }, [navigation, recipientName]);

    // Fetch chat messages from Firestore
    useEffect(() => {
        if (!chatId) {
            setLoading(false);
            return;
        }
        
        const messagesQuery = firestore()
            .collection('privateChats')
            .doc(chatId)
            .collection('messages')
            .orderBy('createdAt', 'desc');

        const unsubscribe = messagesQuery.onSnapshot(querySnapshot => {
            const fetchedMessages = querySnapshot.docs.map(doc => {
                const firebaseData = doc.data();
                return {
                    _id: doc.id,
                    text: firebaseData.text || '',
                    createdAt: firebaseData.createdAt?.toDate() || new Date(),
                    user: firebaseData.user || { _id: 'unknown' },
                    image: firebaseData.image || null,
                    system: firebaseData.system || false,
                };
            });
            setMessages(fetchedMessages);
            if (loading) setLoading(false);
        }, err => {
            console.error("Error fetching messages:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [chatId, loading]);

    // --- Handlers ---

    /**
     * Handles sending a message (text or image).
     * Updates both the message subcollection and the parent chat document metadata.
     */
    const onSend = useCallback(async (messagesToSend = []) => {
        if (!currentUser) {
            Alert.alert("Login Required", "Please log in to send a message.", [
                { text: "Cancel" },
                { text: "Log In", onPress: () => navigation.navigate('Login') }
            ]);
            return;
        }
        if (!chatId) return;

        const message = messagesToSend[0];
        const messageData = {
            text: message.text || '',
            createdAt: firestore.FieldValue.serverTimestamp(),
            user: {
                _id: currentUser.uid,
                name: currentUser.displayName || 'Me',
                avatar: currentUser.photoURL || null,
            },
            ...(message.image && { image: message.image }),
        };

        const chatMetadata = {
            lastMessage: {
                text: message.text ? message.text.substring(0, 40) : '📷 Image',
                createdAt: firestore.FieldValue.serverTimestamp(),
                senderId: currentUser.uid,
            },
            participants: [currentUser.uid, recipientId],
            participantDetails: {
                [currentUser.uid]: { displayName: currentUser.displayName || 'Me', avatar: currentUser.photoURL || null },
                [recipientId]: { displayName: recipientName || 'User', avatar: recipientAvatar || null }
            },
            lastActivity: firestore.FieldValue.serverTimestamp(),
        };
        console.log("Message to send:", messageData);
console.log("chatId:", chatId);

        try {
            const messagesCollectionRef = firestore().collection('privateChats').doc(chatId).collection('messages');
            await messagesCollectionRef.add(messageData);
            
            const chatDocRef = firestore().collection('privateChats').doc(chatId);
            await chatDocRef.set(chatMetadata, { merge: true });
        } catch (err) {
            console.error("Error sending message:", JSON.stringify(err, null, 2));


            console.error("Error sending message:", err);
            Alert.alert("Error Sending Message", err.message);
        }
    }, [chatId, currentUser, recipientId, recipientName, recipientAvatar, navigation]);

    /**
     * Uploads an image to Firebase Storage and then calls onSend with the image URL.
     * @param {string} imageUri - The local URI of the image to upload.
     */
    const uploadImageAndSend = async (imageUri) => {
        if (!imageUri || !currentUser || !chatId) return;
        setImageUploading(true);
        const filename = `${currentUser.uid}_${Date.now()}.jpg`;
        const storagePath = `chatImages/${chatId}/${filename}`;
        
        try {
            const imageRef = storage().ref(storagePath);
            await imageRef.putFile(imageUri);
            const downloadURL = await imageRef.getDownloadURL();

            const imageMessage = {
                _id: Math.random().toString(36).substring(7),
                createdAt: new Date(),
                user: { _id: currentUser.uid, avatar: currentUser.photoURL },
                image: downloadURL,
                text: ''
            };
            onSend([imageMessage]);
        } catch (error) {
            console.error("Error uploading image:", error);
            Alert.alert("Image Upload Error", error.message);
        } finally {
            setImageUploading(false);
        }
    };

    /**
     * Opens the device's image library to pick an image.
     */
    const handlePickImage = async () => {
        if (!currentUser) {
            Alert.alert("Login Required", "Please log in to send an image.", [
                { text: "Cancel" },
                { text: "Log In", onPress: () => navigation.navigate('Login') }
            ]);
            return;
        }
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Required'); return; }
        
        let result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.7 });

        if (!result.canceled && result.assets?.[0]) {
            uploadImageAndSend(result.assets[0].uri);
        }
    };

    // --- Custom Render Functions for GiftedChat ---

    const renderCustomMessageImage = (props) => (
        <TouchableOpacity onPress={() => { setSelectedImageUri(props.currentMessage.image); setImageModalVisible(true); }}>
            <MessageImage {...props} imageStyle={styles.chatImageStyle} />
        </TouchableOpacity>
    );

    const renderActions = (props) => (
        <Actions 
            {...props} 
            containerStyle={styles.actionsContainer} 
            icon={() => <Ionicons name="add-circle-outline" size={28} color={colors.primaryTeal} />} 
            options={{ 'Choose From Library': handlePickImage, 'Cancel': () => {} }} 
            optionTintColor={colors.primaryTeal} 
        />
    );

    const renderSend = (props) => (
        <Send {...props} containerStyle={styles.sendContainer}>
            <Ionicons name="send" size={24} color={colors.primaryTeal} />
        </Send>
    );

    // --- Main Render Logic ---
    const styles = useMemo(() => themedStyles(colors, isDarkMode, headerHeight), [colors, isDarkMode, headerHeight]);

    if (loading) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={headerHeight}>
                <GiftedChat
                    messages={messages}
                    onSend={onSend}
                    user={{ _id: currentUser?.uid }}
                    renderActions={renderActions}
                    renderSend={renderSend}
                    renderMessageImage={renderCustomMessageImage}
                    isTyping={imageUploading}
                    placeholder="Type your message..."
                    alwaysShowSend
                    scrollToBottom
                />
            </KeyboardAvoidingView>
            <Modal animationType="fade" transparent={true} visible={imageModalVisible} onRequestClose={() => setImageModalVisible(false)}>
                <View style={styles.modalContainer}>
                    <TouchableOpacity style={styles.closeButton} onPress={() => setImageModalVisible(false)}>
                        <Ionicons name="close-circle" size={32} color="white" />
                    </TouchableOpacity>
                    <Image source={{ uri: selectedImageUri }} style={styles.fullScreenImage} resizeMode="contain" />
                </View>
            </Modal>
        </SafeAreaView>
    );
};

// --- Styles ---
const themedStyles = (colors, isDarkMode, headerHeight) => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    actionsContainer: { width: 36, height: 36, marginLeft: 8, marginBottom: Platform.OS === 'ios' ? 4 : 8, alignItems: 'center', justifyContent: 'center' },
    sendContainer: { justifyContent: 'center', alignItems: 'center', height: '100%', marginRight: 10 },
    chatImageStyle: { width: 200, height: 150, borderRadius: 13, margin: 3 },
    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
    fullScreenImage: { width: '100%', height: '100%' },
    closeButton: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, right: 15, padding: 10, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 },
});

export default PrivateChatScreen;
