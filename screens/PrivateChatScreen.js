/// screens/PrivateChatScreen.js (Using renderMessageImage and fixing undefined avatar)

import Ionicons from '@expo/vector-icons/Ionicons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform, // Keep aliased
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { Actions, GiftedChat, MessageImage, Send } from 'react-native-gifted-chat'; // Import MessageImage

import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy, query,
    serverTimestamp,
    setDoc, updateDoc
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, firestore, storage } from '../firebaseConfig';

import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../src/ThemeContext';

const generateChatId = (uid1, uid2) => {
    if (!uid1 || !uid2) {
        console.warn("[PrivateChatScreen] generateChatId: One or both UIDs are missing. uid1:", uid1, "uid2:", uid2);
        return null;
    }
    // Sort UIDs to create a consistent chat ID regardless of who initiates the chat
    return [uid1, uid2].sort().join('_');
};

const PrivateChatScreen = () => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [imageUploading, setImageUploading] = useState(false);
    const route = useRoute();
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    const headerHeight = useHeaderHeight();

    const [inputText, setInputText] = useState('');
    const [isRecipientTyping, setIsRecipientTyping] = useState(false);

    const [imageModalVisible, setImageModalVisible] = useState(false);
    const [selectedImageUri, setSelectedImageUri] = useState(null);

    // Destructure recipient details from route params
    const { recipientId, recipientName, recipientAvatar } = route.params || {};
    const currentUser = auth.currentUser;

    // Log modal visibility changes for debugging
    useEffect(() => {
        console.log("EFFECT: imageModalVisible is NOW:", imageModalVisible);
    }, [imageModalVisible]);

    // Memoize chat ID generation to avoid unnecessary recalculations
    const chatId = useMemo(() => {
        if (!currentUser?.uid || !recipientId) {
            return null;
        }
        return generateChatId(currentUser.uid, recipientId);
    }, [currentUser?.uid, recipientId]);

    // Set navigation header title dynamically
    useLayoutEffect(() => {
        navigation.setOptions({ title: recipientName || 'Chat' });
    }, [navigation, recipientName]);

    // Memoize the Firestore document reference for typing status
    const typingRef = useMemo(() => chatId ? doc(firestore, 'privateChats', chatId) : null, [chatId]);

    // Function to update current user's typing status in Firestore
    const updateTypingStatus = useCallback(async (isTyping) => {
        if (!typingRef || !currentUser?.uid) return;
        try {
            const chatDocSnap = await getDoc(typingRef);
            if (!chatDocSnap.exists() || !chatDocSnap.data()?.typing) {
                // If the document doesn't exist or doesn't have a 'typing' field, create/merge it
                await setDoc(typingRef, { typing: { [currentUser.uid]: isTyping } }, { merge: true });
            } else {
                // Otherwise, just update the specific user's typing status
                await updateDoc(typingRef, { [`typing.${currentUser.uid}`]: isTyping });
            }
        } catch (e) {
            console.error("Error updating typing status:", e);
            // Optionally show an error to the user, but this is a background task
        }
    }, [typingRef, currentUser?.uid]);

    // Effect to listen for recipient's typing status
    useEffect(() => {
        if (!typingRef || !currentUser?.uid || !recipientId) {
            setIsRecipientTyping(false); // Ensure typing indicator is off if conditions not met
            return;
        }
        const unsubscribeTyping = onSnapshot(typingRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Check if recipient's typing status is true
                setIsRecipientTyping(!!(data?.typing && data.typing[recipientId]));
            } else {
                setIsRecipientTyping(false); // If doc doesn't exist, nobody is typing
            }
        }, (err) => {
            console.error("Error listening to typing status:", err);
            setIsRecipientTyping(false); // Turn off typing on error
        });
        return () => unsubscribeTyping(); // Clean up listener on unmount
    }, [typingRef, currentUser?.uid, recipientId]);

    // Effect to listen for real-time messages in the chat
    useEffect(() => {
        if (!currentUser) { setError("Authentication error. Please log in."); setLoading(false); return; }
        if (!recipientId) { setError("Recipient not specified."); setLoading(false); return; }
        if (!chatId) { setError("Could not determine chat ID. Ensure both users are valid."); setLoading(false); return; }

        setLoading(true);
        setError(null); // Clear previous errors

        const messagesCollectionRef = collection(firestore, 'privateChats', chatId, 'messages');
        // Query messages ordered by creation time in descending order
        const q = query(messagesCollectionRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedMessages = querySnapshot.docs.map(doc => {
                const firebaseData = doc.data();
                // Map Firestore data to GiftedChat message format
                return {
                    _id: doc.id,
                    text: firebaseData.text || '',
                    createdAt: firebaseData.createdAt?.toDate() || new Date(), // Convert Firestore Timestamp to Date object
                    user: firebaseData.user || { _id: 'unknown', name: 'Unknown' }, // Fallback for user data
                    image: firebaseData.image || null,
                    system: firebaseData.system || false,
                };
            });
            setMessages(fetchedMessages);
            setLoading(false);
        }, (err) => {
            console.error("[PrivateChatScreen] Error fetching messages:", err);
            setError("Failed to load messages. " + err.message);
            setLoading(false);
        });

        return () => unsubscribe(); // Clean up listener on unmount
    }, [chatId, currentUser?.uid, recipientId, navigation]); // Dependencies for the effect

    // Callback function to handle sending messages
    const onSend = useCallback(async (messagesToSend = []) => {
        if (!currentUser || !recipientId || !chatId) {
            Alert.alert("Error", "Cannot send message. Required info missing (user, recipient, or chat ID).");
            return;
        }

        setInputText(''); // Clear input field immediately
        updateTypingStatus(false); // Turn off typing indicator
        Keyboard.dismiss(); // Dismiss keyboard

        const message = messagesToSend[0];

        // Construct the message data for Firestore
        const messageData = {
            text: message.text || '',
            createdAt: serverTimestamp(),
            user: {
                _id: currentUser.uid,
                name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Me',
                // Ensure avatar is null if photoURL is undefined to avoid Firestore error
                avatar: currentUser.photoURL || null,
            },
            ...(message.image && { image: message.image }), // Conditionally add image field
            system: message.system || false,
        };

        // Construct chat metadata for the parent chat document
        const chatMetadata = {
            lastMessage: {
                text: message.text ? (message.text.length > 40 ? message.text.substring(0, 37) + '...' : message.text) : (message.image ? '📷 Image' : 'Message'),
                createdAt: serverTimestamp(),
                senderId: currentUser.uid,
            },
            participants: [currentUser.uid, recipientId],
            participantDetails: {
                [currentUser.uid]: {
                    displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Me',
                    avatar: currentUser.photoURL || null // Ensure avatar is null or URL
                },
                [recipientId]: {
                    displayName: recipientName || 'User',
                    avatar: recipientAvatar || null // Ensure recipient avatar is null or URL
                }
            },
            lastActivity: serverTimestamp(),
            typing: { [currentUser.uid]: false, [recipientId]: false } // Reset typing status after sending
        };

        try {
            // Add the new message to the messages subcollection
            const messagesCollectionRef = collection(firestore, 'privateChats', chatId, 'messages');
            await addDoc(messagesCollectionRef, messageData);

            // Update the parent chat document with latest metadata
            const chatDocRef = doc(firestore, 'privateChats', chatId);
            await setDoc(chatDocRef, chatMetadata, { merge: true }); // Use merge to update without overwriting
        } catch (err) {
            console.error("[PrivateChatScreen onSend] Error sending message:", err);
            Alert.alert("Error Sending Message", "Failed to send message. Details: " + err.message);
        }
    }, [chatId, currentUser, recipientId, recipientName, recipientAvatar, updateTypingStatus]); // Add all dependencies

    // Custom renderer for the send button (adds styling and icon)
    const renderSend = (props) => {
        const isActive = (props.text && props.text.trim().length > 0) || imageUploading;
        return (
            <Send {...props} disabled={!isActive} containerStyle={styles.sendButtonContainer}>
                <View style={[styles.sendButtonInner, isActive ? { backgroundColor: colors.primaryGreen } : { backgroundColor: colors.textDisabled }]}>
                    <Ionicons name="send" size={20} color={colors.textOnPrimary} />
                </View>
            </Send>
        );
    };

    // Function to upload an image to Firebase Storage and then send it as a message
    const uploadImageAndSend = async (imageUri) => {
         if (!imageUri || !currentUser || !chatId || !recipientId) {
            Alert.alert("Error", "Cannot send image. Required information missing.");
            return;
        }
        setImageUploading(true); // Show upload indicator
        try {
            // Fetch the image as a blob
            const response = await fetch(imageUri);
            const blob = await response.blob();

            // Determine file extension and create a unique filename
            const fileExtension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
            const filename = `${currentUser.uid}_${Date.now()}.${fileExtension}`;
            const storagePathFull = `chatImages/${chatId}/${filename}`; // Path in Firebase Storage
            const imageRef = ref(storage, storagePathFull);

            // Upload the blob to Firebase Storage
            await uploadBytes(imageRef, blob, { contentType: `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}` });

            // Get the public download URL of the uploaded image
            const downloadURL = await getDownloadURL(imageRef);

            // Create a message object for GiftedChat and send it
            const imageMessageForGiftedChat = {
                _id: Math.random().toString(36).substring(7), // Unique ID for GiftedChat message
                createdAt: new Date(),
                user: { _id: currentUser.uid, avatar: currentUser.photoURL || null }, // Include avatar here too
                image: downloadURL,
                text: '' // No text content for image messages
            };
            onSend([imageMessageForGiftedChat]); // Use onSend to handle Firestore write and chat metadata update
        } catch (error) {
            console.error("[PrivateChatScreen] Error uploading/sending image:", error);
            Alert.alert("Image Upload Error", "Failed to send image. " + error.message);
        } finally {
            setImageUploading(false); // Hide upload indicator
        }
    };

    // Function to handle picking an image from the device's library
    const handlePickImage = async () => {
        if (!currentUser) {
            Alert.alert("Login Required", "Log in to send images.", [{ text: "Cancel"}, { text: "Log In", onPress: () => navigation.navigate('Login') }]);
            return;
        }
        // Request media library permissions
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required','Need camera roll permissions to upload images!');
            return;
        }
        try {
            // Launch image picker
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true, // Allow user to crop/edit
                aspect: [4, 3], // Aspect ratio for consistency
                quality: 0.7, // Image quality
            });

            // If an image was selected and not cancelled, upload and send it
            if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
                uploadImageAndSend(result.assets[0].uri);
            }
        } catch (pickerError) {
            console.error("Image Picker Error:", pickerError);
            Alert.alert("Error", "Could not open image library.");
        }
    };

    // Custom actions button (the '+' button) for GiftedChat input toolbar
    const renderActions = (props) => {
        return (
            <Actions
                {...props}
                containerStyle={styles.actionsContainer}
                icon={() => (
                    <Ionicons name="add-circle-outline" size={28} color={colors.primaryTeal} />
                )}
                options={{
                    'Choose From Library': handlePickImage,
                    'Cancel': () => {}, // Empty function for cancel
                }}
                optionTintColor={colors.primaryTeal}
            />
        );
    };

    // Custom renderer for system messages (e.g., "User joined chat")
    const renderSystemMessage = (props) => {
        const { currentMessage } = props;
        return (
            <View style={styles.systemMessageContainer}>
                <Text style={styles.systemMessageText}>{currentMessage.text}</Text>
            </View>
        );
    };

    // Handles avatar press to navigate to user's profile/store
    const handleAvatarPress = (user) => {
        if (!user || !user._id) return;

        if (currentUser && user._id === currentUser.uid) {
            // Navigate to current user's own profile
            navigation.navigate('ProfileTab'); // Assuming 'ProfileTab' is the route name for the current user's profile
        } else if (user._id === recipientId) {
            // Navigate to the recipient's seller store
            navigation.navigate('SellerStore', { sellerId: recipientId, sellerName: recipientName || 'Seller' });
        }
    };

    // Custom renderer for message images, enabling full-screen view on tap
    const renderCustomMessageImage = (props) => {
        const { currentMessage } = props;
        if (!currentMessage || !currentMessage.image) {
            return null;
        }
        return (
            <TouchableOpacity
                style={styles.messageImageTouchable}
                onPress={() => {
                    console.log(`--- renderMessageImage onPress FIRED for message ID: ${currentMessage._id} ---`);
                    if (typeof currentMessage.image === 'string' && currentMessage.image.startsWith('http')) {
                        console.log("Condition MET: URI is string and starts with http. Opening modal.");
                        setSelectedImageUri(currentMessage.image);
                        setImageModalVisible(true);
                    } else {
                        console.log("Condition NOT MET: URI not string or not http. Alerting user.");
                        Alert.alert("Image Error", "Cannot display this image (invalid format/URI).");
                    }
                }}
            >
                {/* Use GiftedChat's MessageImage component for rendering */}
                <MessageImage
                    {...props} // Pass all props to MessageImage to retain its default behavior/styles
                    imageStyle={styles.chatImageStyle} // Apply custom style for the image
                />
            </TouchableOpacity>
        );
    };

    // Memoize themed styles to prevent unnecessary re-creations
    const styles = useMemo(() => themedStyles(colors, isDarkMode, headerHeight), [colors, isDarkMode, headerHeight]);

    // --- Loading and Error State Handling ---
    if (!colors) {
        return (
            <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'magenta' }}>
                <Text style={{color: 'white', fontSize: 18, textAlign: 'center'}}>Critical Error: Theme colors not loaded!</Text>
            </SafeAreaView>
        );
    }
    if (loading) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal || '#007bff'} /><Text style={{color: colors.textPrimary}}>Loading Chat...</Text></SafeAreaView>;
    }
    if (error) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    }
    if (!currentUser || !chatId) {
        return (
            <SafeAreaView style={styles.centered}>
                <Text style={styles.errorText}>Cannot load chat. Essential information (user or chat ID) is missing. Please try navigating again.</Text>
            </SafeAreaView>
        );
    }

    // GiftedChat user prop construction, ensuring avatar is never undefined
    const giftedChatUserProp = {
        _id: currentUser.uid,
        name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Me',
        avatar: currentUser.photoURL || null, // Ensure avatar is null if photoURL is undefined
    };

    // Calculate keyboard vertical offset for KeyboardAvoidingView
    const keyboardVerticalOffsetValue = Platform.OS === 'ios' ? headerHeight : 0;

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Show image upload indicator if active */}
            {imageUploading && <ActivityIndicator style={styles.uploadIndicator} size="small" color={colors.primaryTeal} />}

            <KeyboardAvoidingView
                style={styles.keyboardAvoidingContainer}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={keyboardVerticalOffsetValue}
            >
                <GiftedChat
                    messages={messages}
                    onSend={messagesToSend => onSend(messagesToSend)}
                    user={giftedChatUserProp} // Pass the constructed user prop
                    renderActions={renderActions}
                    renderSend={renderSend}
                    renderSystemMessage={renderSystemMessage}
                    renderMessageImage={renderCustomMessageImage} // Use custom image renderer
                    onPressAvatar={handleAvatarPress}
                    isTyping={isRecipientTyping}
                    placeholder="Type your message..."
                    text={inputText}
                    onInputTextChanged={text => {
                        setInputText(text);
                        // Update typing status based on input text length
                        if (text.trim().length > 0) {
                            updateTypingStatus(true);
                        } else {
                            updateTypingStatus(false);
                        }
                    }}
                    key={`gifted-chat-${chatId}`} // Key to force re-render on chatId change if needed (usually handled by dependencies)
                    minInputToolbarHeight={Platform.OS === 'ios' ? 44 : 54}
                    // bottomOffset={Platform.OS === 'ios' ? 34 : 0} // Adjust for iPhone X and newer safe areas
                    alwaysShowSend // Always show the send button
                    listViewProps={{
                        style: { flex: 1 },
                        contentContainerStyle: { flexGrow: 1, justifyContent: 'flex-end' } // Ensure messages stick to bottom
                    }}
                    keyboardShouldPersistTaps="never" // Dismiss keyboard on tap outside input
                />
            </KeyboardAvoidingView>

            {/* Modal for displaying full-screen image preview */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={imageModalVisible}
                onRequestClose={() => {
                    console.log("Modal onRequestClose triggered (Android back button)");
                    setImageModalVisible(false);
                    setSelectedImageUri(null); // Clear selected URI on close
                }}
            >
                <View style={styles.modalContainer}>
                    <TouchableOpacity style={styles.closeButton} onPress={() => {
                        console.log("Close button pressed in modal, setting visible to false.");
                        setImageModalVisible(false);
                        setSelectedImageUri(null); // Clear selected URI on close
                    }}>
                        <Ionicons name="close-circle" size={32} color="white" />
                    </TouchableOpacity>
                    {/* Display the selected image or a placeholder if none */}
                    {selectedImageUri ? (
                        <Image source={{ uri: selectedImageUri }} style={styles.fullScreenImage} resizeMode="contain" />
                    ) : (
                        <View style={styles.simpleModalContent_DEBUG}>
                            <Text style={styles.modalDebugTextLarge}>No Image Selected</Text>
                            <Text style={styles.modalDebugTextSmall}>Tap an image in chat to view it here.</Text>
                        </View>
                    )}
                </View>
            </Modal>
        </SafeAreaView>
    );
};

// --- Themed Styles ---
const themedStyles = (colors, isDarkMode, headerHeight) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors?.background || '#FFFFFF' // Fallback to white if colors not loaded
    },
    keyboardAvoidingContainer: {
        flex: 1,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: colors?.background || '#F8F8F8', // Fallback
    },
    errorText: {
        color: colors?.error || 'red',
        fontSize: 16,
        textAlign: 'center',
    },
    actionsContainer: {
        width: 36,
        height: 36,
        marginLeft: 8,
        marginRight: 0,
        marginBottom: Platform.OS === 'ios' ? 4 : 8, // Adjust for iOS vs Android
        alignItems: 'center',
        justifyContent: 'center'
    },
    uploadIndicator: {
        position: 'absolute',
        top: headerHeight + 10, // Position below header
        right: 10,
        zIndex: 100, // Ensure it's above other elements
    },
    sendButtonContainer: {
        height: Platform.OS === 'ios' ? 44 : 54, // Match GiftedChat's toolbar height
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 5,
        marginBottom: Platform.OS === 'ios' ? 0 : 0
    },
    sendButtonInner: {
        width: 38,
        height: 38,
        borderRadius: 19, // Circular button
        justifyContent: 'center',
        alignItems: 'center'
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)', // Dark semi-transparent background
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullScreenImage: {
        width: '100%',
        height: '100%',
        // `resizeMode` should be set to 'contain' to ensure the entire image is visible,
        // or 'cover' if you prefer it to fill the space and crop
    },
    simpleModalContent_DEBUG: { // Placeholder for no image selected
        width: 280,
        height: 220,
        backgroundColor: colors.surface || 'orange', // Use theme color or fallback
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        borderWidth: 3,
        borderColor: colors.primaryTeal || 'blue', // Use theme color or fallback
        borderRadius: 10,
    },
    modalDebugTextLarge: {
        fontSize: 18,
        color: colors.textPrimary || 'black',
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 10
    },
    modalDebugTextSmall: {
        fontSize: 12,
        color: colors.textSecondary || 'black',
        textAlign: 'center',
        marginVertical: 5,
        maxWidth: '90%'
    },
    closeButton: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? (headerHeight > 20 ? headerHeight + 15 : 60) : 30, // Position considering header height
        right: 15,
        padding: 10,
        zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.2)', // Semi-transparent white
        borderRadius: 20
    },
    systemMessageContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 15,
        marginVertical: 5
    },
    systemMessageText: {
        fontSize: 12,
        color: colors?.textSecondary || 'grey',
        fontStyle: 'italic',
        textAlign: 'center'
    },
    messageImageTouchable: {
        // GiftedChat's default image size is around 200x150.
        // This TouchableOpacity will wrap the image, no explicit width/height usually needed here.
    },
    chatImageStyle: { // Style for the <MessageImage> component
        width: 200, // Example width (GiftedChat default)
        height: 150, // Example height (GiftedChat default)
        borderRadius: 13, // Match GiftedChat's default bubble border radius
        margin: 3,
    },
});

export default PrivateChatScreen;
