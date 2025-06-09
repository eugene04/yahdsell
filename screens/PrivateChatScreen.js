/// screens/PrivateChatScreen.js (Using renderMessageImage)

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

    const { recipientId, recipientName, recipientAvatar } = route.params || {};
    const currentUser = auth.currentUser;

    useEffect(() => {
        console.log("EFFECT: imageModalVisible is NOW:", imageModalVisible);
    }, [imageModalVisible]);

    const chatId = useMemo(() => {
        if (!currentUser?.uid || !recipientId) {
            return null;
        }
        return generateChatId(currentUser.uid, recipientId);
    }, [currentUser?.uid, recipientId]);

    useLayoutEffect(() => {
        navigation.setOptions({ title: recipientName || 'Chat' });
    }, [navigation, recipientName]);

    const typingRef = useMemo(() => chatId ? doc(firestore, 'privateChats', chatId) : null, [chatId]);

    const updateTypingStatus = useCallback(async (isTyping) => {
        if (!typingRef || !currentUser?.uid) return;
        try {
            const chatDocSnap = await getDoc(typingRef);
            if (!chatDocSnap.exists() || !chatDocSnap.data()?.typing) {
                await setDoc(typingRef, { typing: { [currentUser.uid]: isTyping } }, { merge: true });
            } else {
                await updateDoc(typingRef, { [`typing.${currentUser.uid}`]: isTyping });
            }
        } catch (e) { console.error("Error updating typing status:", e); }
    }, [typingRef, currentUser?.uid]);

    useEffect(() => { // Typing indicator listener
        if (!typingRef || !currentUser?.uid || !recipientId) { setIsRecipientTyping(false); return; }
        const unsubscribeTyping = onSnapshot(typingRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setIsRecipientTyping(!!(data?.typing && data.typing[recipientId]));
            } else { setIsRecipientTyping(false); }
        }, (err) => { console.error("Error listening to typing status:", err); setIsRecipientTyping(false); });
        return () => unsubscribeTyping();
    }, [typingRef, currentUser?.uid, recipientId]);

    useEffect(() => { // Message listener
        if (!currentUser) { setError("Authentication error. Please log in."); setLoading(false); return; }
        if (!recipientId) { setError("Recipient not specified."); setLoading(false); return; }
        if (!chatId) { setError("Could not determine chat ID. Ensure both users are valid."); setLoading(false); return; }
        setLoading(true); setError(null);
        const messagesCollectionRef = collection(firestore, 'privateChats', chatId, 'messages');
        const q = query(messagesCollectionRef, orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedMessages = querySnapshot.docs.map(doc => {
                const firebaseData = doc.data();
                return {
                    _id: doc.id, text: firebaseData.text || '',
                    createdAt: firebaseData.createdAt?.toDate() || new Date(),
                    user: firebaseData.user || { _id: 'unknown', name: 'Unknown' },
                    image: firebaseData.image || null, system: firebaseData.system || false,
                };
            });
            setMessages(fetchedMessages); setLoading(false);
        }, (err) => {
            console.error("[PrivateChatScreen] Error fetching messages:", err);
            setError("Failed to load messages. " + err.message); setLoading(false);
        });
        return () => unsubscribe();
    }, [chatId, currentUser?.uid, recipientId, navigation]);

    const onSend = useCallback(async (messagesToSend = []) => {
        if (!currentUser || !recipientId || !chatId) { Alert.alert("Error", "Cannot send message. Required info missing."); return; }
        setInputText(''); updateTypingStatus(false); Keyboard.dismiss();
        const message = messagesToSend[0];
        const messageData = {
            text: message.text || '', createdAt: serverTimestamp(),
            user: { _id: currentUser.uid, name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Me', avatar: currentUser.photoURL || undefined, },
            ...(message.image && { image: message.image }), system: message.system || false,
        };
        const chatMetadata = {
            lastMessage: { text: message.text ? (message.text.length > 40 ? message.text.substring(0, 37) + '...' : message.text) : (message.image ? '📷 Image' : 'Message'),
                           createdAt: serverTimestamp(), senderId: currentUser.uid, },
            participants: [currentUser.uid, recipientId],
            participantDetails: {
                [currentUser.uid]: { displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Me', avatar: currentUser.photoURL || null },
                [recipientId]: { displayName: recipientName || 'User', avatar: recipientAvatar || null }
            },
            lastActivity: serverTimestamp(),
            typing: { [currentUser.uid]: false, [recipientId]: false }
        };
        try {
            const messagesCollectionRef = collection(firestore, 'privateChats', chatId, 'messages');
            await addDoc(messagesCollectionRef, messageData);
            const chatDocRef = doc(firestore, 'privateChats', chatId);
            await setDoc(chatDocRef, chatMetadata, { merge: true });
        } catch (err) {
            console.error("[PrivateChatScreen onSend] Error sending message:", err);
            Alert.alert("Error Sending Message", "Failed to send message. Details: " + err.message);
        }
    }, [chatId, currentUser, recipientId, recipientName, recipientAvatar, updateTypingStatus]);

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

    const uploadImageAndSend = async (imageUri) => {
         if (!imageUri || !currentUser || !chatId || !recipientId) { Alert.alert("Error", "Cannot send image. Required info missing."); return; }
        setImageUploading(true);
        try {
            const response = await fetch(imageUri); const blob = await response.blob();
            const fileExtension = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
            const filename = `${currentUser.uid}_${Date.now()}.${fileExtension}`;
            const storagePathFull = `chatImages/${chatId}/${filename}`;
            const imageRef = ref(storage, storagePathFull);
            await uploadBytes(imageRef, blob, { contentType: `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}` });
            const downloadURL = await getDownloadURL(imageRef);
            const imageMessageForGiftedChat = { _id: Math.random().toString(36).substring(7), createdAt: new Date(), user: { _id: currentUser.uid }, image: downloadURL, text: '' };
            onSend([imageMessageForGiftedChat]);
        } catch (error) {
            console.error("[PrivateChatScreen] Error uploading/sending image:", error);
            Alert.alert("Image Upload Error", "Failed to send image. " + error.message);
        } finally { setImageUploading(false); }
    };

    const handlePickImage = async () => {
        if (!currentUser) { Alert.alert("Login Required", "Log in to send images.", [{ text: "Cancel"}, { text: "Log In", onPress: () => navigation.navigate('Login') }]); return; }
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Required','Need camera roll permissions!'); return; }
        try {
            let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 });
            if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
                uploadImageAndSend(result.assets[0].uri);
            }
        } catch (pickerError) { console.error("Image Picker Error:", pickerError); Alert.alert("Error", "Could not open image library."); }
    };

    const renderActions = (props) => {
        return ( <Actions {...props} containerStyle={styles.actionsContainer} icon={() => ( <Ionicons name="add-circle-outline" size={28} color={colors.primaryTeal} /> )} options={{ 'Choose From Library': handlePickImage, 'Cancel': () => {}, }} optionTintColor={colors.primaryTeal} /> );
    };

    const renderSystemMessage = (props) => {
        const { currentMessage } = props;
        return ( <View style={styles.systemMessageContainer}><Text style={styles.systemMessageText}>{currentMessage.text}</Text></View> );
    };

    const handleAvatarPress = (user) => {
        if (!user || !user._id) return;
        if (currentUser && user._id === currentUser.uid) { navigation.navigate('ProfileTab'); }
        else if (user._id === recipientId) { navigation.navigate('SellerStore', { sellerId: recipientId, sellerName: recipientName || 'Seller' }); }
    };

    // renderBubble is removed as we will use renderMessageImage for image tap handling
    // const renderBubble = (props) => { ... };

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
                {/* Use GiftedChat's MessageImage or your own RNImage */}
                <MessageImage
                    {...props} // Pass all props to MessageImage
                    imageStyle={styles.chatImageStyle} // Custom style for the image itself
                />
                {/* Or if you want more control with RNImage:
                <RNImage
                    source={{ uri: currentMessage.image }}
                    style={styles.chatImageStyle} // Define this style
                    resizeMode="cover"
                />
                */}
            </TouchableOpacity>
        );
    };


    const styles = useMemo(() => themedStyles(colors, isDarkMode, headerHeight), [colors, isDarkMode, headerHeight]);

    if (!colors) {
        return ( <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'magenta' }}><Text style={{color: 'white', fontSize: 18, textAlign: 'center'}}>Critical Error: Theme colors not loaded!</Text></SafeAreaView> );
    }
    if (loading) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal || '#007bff'} /><Text>Loading Chat...</Text></SafeAreaView>;
    }
    if (error) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    }
    if (!currentUser || !chatId) {
        return ( <SafeAreaView style={styles.centered}><Text style={styles.errorText}>Cannot load chat. Essential information (user or chat ID) is missing. Please try navigating again.</Text></SafeAreaView> );
    }

    const giftedChatUserProp = { _id: currentUser.uid, name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Me', avatar: currentUser.photoURL || undefined };
    const keyboardVerticalOffsetValue = Platform.OS === 'ios' ? headerHeight : 0;

    return (
        <SafeAreaView style={styles.safeArea}>
            {imageUploading && <ActivityIndicator style={styles.uploadIndicator} size="small" color={colors.primaryTeal} />}
            <KeyboardAvoidingView style={styles.keyboardAvoidingContainer} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={keyboardVerticalOffsetValue}>
                <GiftedChat
                    messages={messages} onSend={messagesToSend => onSend(messagesToSend)} user={giftedChatUserProp}
                    renderActions={renderActions} renderSend={renderSend} renderSystemMessage={renderSystemMessage}
                    // renderBubble={renderBubble} // renderBubble is removed
                    renderMessageImage={renderCustomMessageImage} // Use custom image renderer
                    onPressAvatar={handleAvatarPress} isTyping={isRecipientTyping}
                    placeholder="Type your message..." text={inputText}
                    onInputTextChanged={text => { setInputText(text); if (text.trim().length > 0) { updateTypingStatus(true); } else { updateTypingStatus(false); } }}
                    key={`gifted-chat-${chatId}`} minInputToolbarHeight={Platform.OS === 'ios' ? 44 : 54}
                    bottomOffset={Platform.OS === 'ios' ? 34 : 0} alwaysShowSend
                    listViewProps={{ style: { flex: 1 }, contentContainerStyle: { flexGrow: 1, justifyContent: 'flex-end' } }}
                    keyboardShouldPersistTaps="never"
                />
            </KeyboardAvoidingView>

            <Modal
                animationType="fade"
                transparent={true}
                visible={imageModalVisible}
                onRequestClose={() => {
                    console.log("Modal onRequestClose triggered (Android back button)");
                    setImageModalVisible(false);
                    setSelectedImageUri(null);
                }}
            >
                <View style={styles.modalContainer}>
                    <TouchableOpacity style={styles.closeButton} onPress={() => {
                        console.log("Close button pressed in modal, setting visible to false.");
                        setImageModalVisible(false);
                        setSelectedImageUri(null);
                    }}>
                        <Ionicons name="close-circle" size={32} color="white" />
                    </TouchableOpacity>

                    <View style={styles.simpleModalContent_DEBUG}>
                        <Text style={styles.modalDebugTextLarge}>MODAL (State: {String(imageModalVisible)})</Text>
                        {selectedImageUri && (
                            <Text style={styles.modalDebugTextSmall}>URI: {selectedImageUri}</Text>
                        )}
                        {!selectedImageUri && (
                             <Text style={styles.modalDebugTextSmall}>No Image URI Selected Yet</Text>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const themedStyles = (colors, isDarkMode, headerHeight) => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors?.background || 'rgba(0,0,255,0.2)' },
    keyboardAvoidingContainer: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors?.background || 'rgba(0,255,0,0.2)' },
    errorText: { color: colors?.error || 'red', fontSize: 16, textAlign: 'center' },
    actionsContainer: { width: 36, height: 36, marginLeft: 8, marginRight: 0, marginBottom: Platform.OS === 'ios' ? 4 : 8, alignItems: 'center', justifyContent: 'center' },
    uploadIndicator: { position: 'absolute', top: headerHeight + 10, right: 10, zIndex: 100 },
    sendButtonContainer: { height: Platform.OS === 'ios' ? 44 : 54, justifyContent: 'center', alignItems: 'center', marginRight: 5, marginBottom: Platform.OS === 'ios' ? 0 : 0 },
    sendButtonInner: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    simpleModalContent_DEBUG: { // The ORANGE box
        width: 280,
        height: 220,
        backgroundColor: 'orange',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 15,
        borderWidth: 3,
        borderColor: 'blue',
    },
    modalDebugTextLarge: { fontSize: 18, color: 'black', fontWeight: 'bold', textAlign: 'center', marginBottom:10},
    modalDebugTextSmall: { fontSize: 12, color: 'black', textAlign: 'center', marginVertical: 5, maxWidth: '90%' },
    closeButton: { position: 'absolute', top: Platform.OS === 'ios' ? (headerHeight > 20 ? headerHeight + 15 : 60) : 30, right: 15, padding: 10, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 },
    systemMessageContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 15, marginVertical: 5 },
    systemMessageText: { fontSize: 12, color: colors?.textSecondary || 'grey', fontStyle: 'italic', textAlign: 'center' },

    // Styles for renderCustomMessageImage
    messageImageTouchable: {
        // Adjust size as needed, GiftedChat's default image size is around 200x150
        // This TouchableOpacity will wrap the image.
        // You might not need explicit width/height here if MessageImage component handles it.
        // Add padding if you want the tap area to be larger than the image.
    },
    chatImageStyle: { // Style for the <MessageImage> or <RNImage>
        width: 200, // Example width
        height: 150, // Example height
        borderRadius: 13, // Match GiftedChat's default bubble border radius
        margin: 3,
    },
});

export default PrivateChatScreen;