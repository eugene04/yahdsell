// screens/SubmissionForm.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video } from 'expo-av';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';

// --- FIX: Import the `firebase` object to access its `firestore` namespace ---
import { firebase } from '@react-native-firebase/firestore';
import { auth, functions, storage } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Constants ---
const PRODUCT_CATEGORIES = [ "Select Category...", "Electronics", "Clothing & Apparel", "Home & Garden", "Furniture", "Vehicles", "Books, Movies & Music", "Collectibles & Art", "Sports & Outdoors", "Toys & Hobbies", "Baby & Kids", "Health & Beauty", "Other" ];
const SELECTABLE_CATEGORIES = PRODUCT_CATEGORIES.slice(1);

const PRODUCT_CONDITIONS = [ "Select Condition...", "New", "Used - Like New", "Used - Good", "Used - Fair" ];
const SELECTABLE_CONDITIONS = PRODUCT_CONDITIONS.slice(1);

const MAX_IMAGES = 5;

// --- UPDATED: Reference the new title-based function ---
const getListingDetailsFunc = functions().httpsCallable('getListingDetailsFromTitle');

const SubmissionForm = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { productToRelist } = route.params || {};

    const currentUser = auth().currentUser;
    const { colors, isDarkMode } = useTheme();

    // --- State Management ---
    const [productName, setProductName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState(PRODUCT_CATEGORIES[0]);
    const [productCondition, setProductCondition] = useState(PRODUCT_CONDITIONS[0]);
    const [imageUris, setImageUris] = useState([]);
    const [videoUri, setVideoUri] = useState(null);
    const [originalImagePaths, setOriginalImagePaths] = useState([]);
    const [originalVideoPath, setOriginalVideoPath] = useState(null);
    const [manipulatingImage, setManipulatingImage] = useState(-1);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
    const [isConditionModalVisible, setConditionModalVisible] = useState(false);
    const [isSuggesting, setIsSuggesting] = useState(false);
    
    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    // --- Effect to pre-fill form for re-listing ---
    useEffect(() => {
        if (productToRelist) {
            setProductName(productToRelist.name || '');
            setDescription(productToRelist.description || '');
            setPrice(productToRelist.price?.toString() || '');
            setCategory(productToRelist.category || PRODUCT_CATEGORIES[0]);
            setProductCondition(productToRelist.condition || PRODUCT_CONDITIONS[0]);
            setImageUris(productToRelist.imageUrls || []);
            setVideoUri(productToRelist.videoUrl || null);
            setOriginalImagePaths(productToRelist.imageStoragePaths || []);
            setOriginalVideoPath(productToRelist.videoStoragePath || null);

            Toast.show({
                type: 'info',
                text1: 'Re-listing Item',
                text2: 'All previous details have been filled in for you.'
            });
        }
    }, [productToRelist]);


    // --- Auth Check / Login Gate ---
    if (!currentUser) {
         return (
             <SafeAreaView style={styles.centered}>
                 <Ionicons name="log-in-outline" size={48} color={colors.textDisabled} />
                 <Text style={styles.loginRequiredTitle}>Login Required</Text>
                 <Text style={styles.loginRequiredText}>You must be logged in to list an item for sale.</Text>
                 <TouchableOpacity style={styles.loginButton} onPress={() => navigation.navigate('Login')}>
                     <Text style={styles.loginButtonText}>Go to Login</Text>
                 </TouchableOpacity>
             </SafeAreaView>
         );
     }

    // --- Media Handlers ---
    const handleChoosePhoto = useCallback(async () => {
        if (imageUris.length >= MAX_IMAGES) { Alert.alert("Maximum Images Reached", `You can upload a maximum of ${MAX_IMAGES} images.`); return; }
        setError('');
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Required', 'Need camera roll permissions.'); return; }

        let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 1 });

        if (!result.canceled && result.assets?.[0]) {
            const originalUri = result.assets[0].uri;
            const newImageIndex = imageUris.length;
            setManipulatingImage(newImageIndex);
            setImageUris(prevUris => [...prevUris, originalUri]);
            try {
                const manipResult = await ImageManipulator.manipulateAsync(originalUri, [{ resize: { width: 1024 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
                setImageUris(prevUris => prevUris.map((uri, index) => index === newImageIndex ? manipResult.uri : uri));
            } catch (pickerError) {
                Toast.show({type: 'error', text1: 'Image Error', text2: 'Could not process image.'});
                setImageUris(prevUris => prevUris.filter(uri => uri !== originalUri));
            } finally {
                setManipulatingImage(-1);
            }
        }
    }, [imageUris]);

    const handleChooseVideo = useCallback(async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Required', 'We need permission to access your videos.'); return; }
        let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, quality: 0.7 });
        if (!result.canceled && result.assets?.[0]) {
             if (result.assets[0].duration && result.assets[0].duration > 30000) { 
                 Alert.alert("Video Too Long", "Please choose a video that is 30 seconds or shorter."); 
                 return; 
             }
            setVideoUri(result.assets[0].uri);
        }
    }, []);

    const handleRemoveImage = useCallback((indexToRemove) => { setImageUris(prevUris => prevUris.filter((_, index) => index !== indexToRemove)); }, []);
    const handleRemoveVideo = () => setVideoUri(null);

    // --- AI Suggestion Handler (Title-based) ---
    const handleGetSuggestions = async () => {
        if (!productName.trim()) {
            Toast.show({ type: 'info', text1: 'Please enter a Product Name first.' });
            return;
        }
        setIsSuggesting(true);
        try {
            const result = await getListingDetailsFunc({ title: productName.trim() });
            
            if (result.data && result.data.suggestions) {
                const { description: suggestedDesc, category: suggestedCat } = result.data.suggestions;
                
                if (suggestedDesc) setDescription(suggestedDesc);

                if (PRODUCT_CATEGORIES.includes(suggestedCat)) {
                    setCategory(suggestedCat);
                }
                Toast.show({ type: 'success', text1: 'Suggestions Filled!' });
            } else {
                throw new Error("Received an invalid response from the server.");
            }
        } catch (e) {
            console.error("[AI Suggestion Error]", e);
            Toast.show({ type: 'error', text1: 'Suggestion Failed', text2: 'Could not get suggestions. Please try again.' });
        } finally {
            setIsSuggesting(false);
        }
    };
    
    // --- Main Form Submission Logic ---
    const handleSubmit = useCallback(async () => {
        if (!productName.trim() || !description.trim() || !price.trim() || imageUris.length === 0 || category === PRODUCT_CATEGORIES[0] || productCondition === PRODUCT_CONDITIONS[0]) {
            Alert.alert('Missing Information', 'Please fill all fields and add at least one image.');
            return;
        }
        setSubmitting(true);
        setUploading(true);
        let sellerLocationGeoPoint = null;
        
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                let location = await Location.getCurrentPositionAsync({});
                sellerLocationGeoPoint = new firebase.firestore.GeoPoint(location.coords.latitude, location.coords.longitude);
            }

            const uploadPromises = imageUris.map(async (uri, index) => {
                if (uri.startsWith('https://')) {
                    return { url: uri, path: originalImagePaths[index] || '' };
                }
                const filename = `${currentUser.uid}_${Date.now()}_${Math.random()}.jpeg`;
                const storagePath = `product_images/${filename}`;
                const reference = storage().ref(storagePath);
                await reference.putFile(uri);
                const downloadURL = await reference.getDownloadURL();
                return { url: downloadURL, path: storagePath };
            });
            
            let uploadedVideoUrl = null, uploadedVideoPath = null;
            if (videoUri) {
                if (videoUri.startsWith('https://')) {
                    uploadedVideoUrl = videoUri;
                    uploadedVideoPath = originalVideoPath;
                } else {
                    const filename = `${currentUser.uid}_${Date.now()}_vid.mp4`;
                    const storagePath = `product_videos/${filename}`;
                    const reference = storage().ref(storagePath);
                    await reference.putFile(videoUri);
                    uploadedVideoUrl = await reference.getDownloadURL();
                    uploadedVideoPath = storagePath;
                }
            }

            const uploadedImages = await Promise.all(uploadPromises);
            setUploading(false);

            const sellerUserRef = firebase.firestore().collection('users').doc(currentUser.uid);
            const sellerDoc = await sellerUserRef.get();
            const sellerData = sellerDoc.exists ? sellerDoc.data() : {};

            const productData = {
                name: productName.trim(),
                description: description.trim(),
                price: parseFloat(price) || 0,
                category,
                condition: productCondition,
                imageUrl: uploadedImages[0]?.url || null,
                imageUrls: uploadedImages.map(img => img.url),
                imageStoragePaths: uploadedImages.map(img => img.path),
                videoUrl: uploadedVideoUrl,
                videoStoragePath: uploadedVideoPath,
                sellerId: currentUser.uid,
                sellerEmail: currentUser.email,
                sellerDisplayName: currentUser.displayName || 'Unknown',
                sellerAverageRating: sellerData.averageRating || 0,
                sellerRatingCount: sellerData.ratingCount || 0,
                isSold: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            
            if (sellerLocationGeoPoint) {
                productData.sellerLocation = sellerLocationGeoPoint;
            }

            await firebase.firestore().collection('products').add(productData);
            
            if (productToRelist?.id) {
                await firebase.firestore().collection('products').doc(productToRelist.id).delete();
            }

            Toast.show({ type: 'success', text1: 'Product Submitted!', position: 'bottom' });
            navigation.goBack();
        } catch (e) {
            console.error("[SubmissionForm] Error:", e);
            Toast.show({ type: 'error', text1: 'Submission Failed', text2: e.message, position: 'bottom' });
        } finally {
            setSubmitting(false);
            setUploading(false);
        }
    }, [productName, description, price, imageUris, videoUri, category, productCondition, currentUser, navigation, productToRelist, originalImagePaths, originalVideoPath]);

    const renderImagePreviewItem = ({ item, index }) => (
        <View style={styles.previewImageItemContainer}>
            <Image source={{ uri: item }} style={styles.previewImage} />
            {manipulatingImage === index && <View style={styles.imageManipulatingOverlay}><ActivityIndicator size="small" color="#fff" /></View>}
            <TouchableOpacity style={styles.removeImageButton} onPress={() => handleRemoveImage(index)} disabled={submitting}>
                <Ionicons name="close-circle" size={24} color={colors.error} />
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                    <Text style={styles.title}>{productToRelist ? 'Re-list Product' : 'List New Product'}</Text>
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    <View style={styles.imageManagementContainer}>
                        <Text style={styles.label}>Product Images ({imageUris.length}/{MAX_IMAGES})</Text>
                        {imageUris.length > 0 && <FlatList data={imageUris} renderItem={renderImagePreviewItem} keyExtractor={(item) => item} horizontal showsHorizontalScrollIndicator={false} style={styles.imagePreviewList} />}
                    </View>

                    <View style={styles.imageManagementContainer}>
                        <Text style={styles.label}>Product Video (Optional, max 30s)</Text>
                        {videoUri && (
                            <View style={styles.previewImageItemContainer}>
                                <Video source={{ uri: videoUri }} style={styles.videoPreview} useNativeControls resizeMode="contain" />
                                <TouchableOpacity style={styles.removeImageButton} onPress={handleRemoveVideo} disabled={submitting}>
                                    <Ionicons name="close-circle" size={24} color={colors.error} />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                    
                    <TextInput style={styles.input} placeholder="Product Name" value={productName} onChangeText={setProductName} placeholderTextColor={colors.textSecondary}/>

                    <TouchableOpacity style={[styles.aiButton, (isSuggesting || !productName.trim()) && styles.buttonDisabled]} onPress={handleGetSuggestions} disabled={isSuggesting || !productName.trim()}>
                        {isSuggesting ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : <Ionicons name="sparkles-outline" size={20} color={colors.textOnPrimary} />}
                        <Text style={styles.aiButtonText}>Suggest Description & Category</Text>
                    </TouchableOpacity>

                    <TextInput style={[styles.input, styles.textArea]} placeholder="Product Description" value={description} onChangeText={setDescription} multiline numberOfLines={4} placeholderTextColor={colors.textSecondary}/>
                    <TextInput style={styles.input} placeholder="Price (e.g., 29.99)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor={colors.textSecondary}/>
                    <Text style={styles.label}>Category</Text>
                    <TouchableOpacity style={styles.pickerButton} onPress={() => setCategoryModalVisible(true)} disabled={submitting}><Text style={[ styles.pickerButtonText, category === PRODUCT_CATEGORIES[0] && styles.pickerPlaceholderText ]}>{category}</Text><Ionicons name="chevron-down-outline" size={20} color={colors.textSecondary} /></TouchableOpacity>
                    <Text style={styles.label}>Condition</Text>
                    <TouchableOpacity style={styles.pickerButton} onPress={() => setConditionModalVisible(true)} disabled={submitting}><Text style={[ styles.pickerButtonText, productCondition === PRODUCT_CONDITIONS[0] && styles.pickerPlaceholderText ]}>{productCondition}</Text><Ionicons name="chevron-down-outline" size={20} color={colors.textSecondary} /></TouchableOpacity>
                    
                    <View style={styles.mediaButtonContainer}>
                        {imageUris.length < MAX_IMAGES && (
                            <TouchableOpacity style={[styles.mediaButton, {backgroundColor: colors.primaryGreen}, (submitting) && styles.buttonDisabled]} onPress={handleChoosePhoto} disabled={submitting}>
                                <Ionicons name="add-circle-outline" size={22} color={colors.textOnPrimary} style={{marginRight: 8}}/>
                                <Text style={styles.buttonText}>Add Image</Text>
                            </TouchableOpacity>
                        )}
                        {!videoUri && (
                             <TouchableOpacity 
                                style={[styles.mediaButton, {backgroundColor: colors.primaryTeal}, submitting && styles.buttonDisabled]} 
                                onPress={handleChooseVideo} 
                                disabled={submitting}>
                                <Ionicons name="videocam-outline" size={22} color={colors.textOnPrimary} style={{marginRight: 8}}/>
                                <Text style={styles.buttonText}>Add Video</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {(uploading || submitting) && <ActivityIndicator size="large" color={colors.primaryTeal} style={styles.loadingIndicator}/>}
                    {uploading && <Text style={styles.loadingText}>Uploading media...</Text>}
                    {submitting && !uploading && <Text style={styles.loadingText}>Finalizing submission...</Text>}
                    <TouchableOpacity style={[styles.button, styles.submitButton, (submitting || isSuggesting || imageUris.length === 0) && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting || isSuggesting || imageUris.length === 0}><Ionicons name="checkmark-circle-outline" size={22} color={colors.textOnPrimary} style={{marginRight: 8}}/><Text style={styles.buttonText}>Submit Product</Text></TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
            <Modal transparent={true} visible={isCategoryModalVisible} animationType="fade" onRequestClose={() => setCategoryModalVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setCategoryModalVisible(false)}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select a Category</Text>
                        <FlatList data={SELECTABLE_CATEGORIES} keyExtractor={(item) => item} renderItem={({ item }) => (<TouchableOpacity style={styles.modalItem} onPress={() => {setCategory(item); setCategoryModalVisible(false);}}><Text style={[ styles.modalItemText, item === category && styles.modalItemSelectedText ]}>{item}</Text></TouchableOpacity>)} style={styles.modalList} />
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCategoryModalVisible(false)}><Text style={styles.modalCloseButtonText}>Close</Text></TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
            <Modal transparent={true} visible={isConditionModalVisible} animationType="fade" onRequestClose={() => setConditionModalVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setConditionModalVisible(false)}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Product Condition</Text>
                        <FlatList data={SELECTABLE_CONDITIONS} keyExtractor={(item) => item} renderItem={({ item }) => (<TouchableOpacity style={styles.modalItem} onPress={() => {setProductCondition(item); setConditionModalVisible(false);}}><Text style={[styles.modalItemText, item === productCondition && styles.modalItemSelectedText]}>{item}</Text></TouchableOpacity>)} style={styles.modalList} />
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setConditionModalVisible(false)}><Text style={styles.modalCloseButtonText}>Close</Text></TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
            <Toast />
        </SafeAreaView>
    );
};

const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    loginRequiredTitle: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary, marginTop: 15, marginBottom: 10 },
    loginRequiredText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: 25 },
    loginButton: { backgroundColor: colors.primaryTeal, paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8 },
    loginButtonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: 'bold' },
    scrollContainer: { flexGrow: 1, padding: 20, paddingBottom: 50 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: colors.textPrimary },
    label: { fontSize: 14, color: colors.textSecondary, marginBottom: 5, marginLeft: 2, alignSelf: 'flex-start', fontWeight: '500'},
    input: { width: '100%', minHeight: 50, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 15, fontSize: 16, color: colors.textPrimary },
    textArea: { height: 120, textAlignVertical: 'top' },
    pickerButton: { width: '100%', minHeight: 50, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pickerButtonText: { fontSize: 16, color: colors.textPrimary },
    pickerPlaceholderText: { color: colors.textSecondary, fontStyle: 'italic' },
    imageManagementContainer: { marginBottom: 20, borderWidth: 1, borderColor: colors.border, padding: 15, borderRadius: 8, backgroundColor: colors.surfaceLight || '#f9f9f9', alignItems: 'flex-start' },
    imagePreviewList: { marginBottom: 15, alignSelf: 'flex-start' },
    previewImageItemContainer: { marginRight: 10, position: 'relative' },
    previewImage: { width: 100, height: 100, borderRadius: 6, backgroundColor: colors.border },
    videoPreview: { width: 150, height: 100, borderRadius: 6, backgroundColor: colors.border },
    imageManipulatingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
    removeImageButton: { position: 'absolute', top: -5, right: -5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 12 },
    mediaButtonContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', width: '100%', marginTop: 10 },
    mediaButton: { flex: 0.48, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    aiButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryTeal, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'center', marginBottom: 15 },
    aiButtonText: { color: colors.textOnPrimary, fontSize: 14, fontWeight: '600', marginLeft: 6 },
    button: { width: '100%', height: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginTop: 20, flexDirection: 'row' },
    submitButton: { backgroundColor: colors.primaryTeal },
    buttonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: 'bold' },
    buttonDisabled: { backgroundColor: colors.textDisabled, opacity: 0.7 },
    loadingIndicator: { marginVertical: 15 },
    loadingText: { textAlign: 'center', color: colors.textSecondary, fontSize: 14 },
    errorText: { color: colors.error, marginBottom: 15, fontSize: 16, textAlign: 'center' },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backdrop },
    modalContent: { backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 20, width: '85%', maxHeight: '70%' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: colors.textPrimary },
    modalList: { width: '100%' },
    modalItem: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    modalItemText: { fontSize: 16, color: colors.textPrimary, textAlign: 'center' },
    modalItemSelectedText: { fontWeight: 'bold', color: colors.primaryTeal },
    modalCloseButton: { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10},
    modalCloseButtonText: { fontSize: 16, color: colors.primaryTeal, fontWeight: '600' },
});

export default SubmissionForm;
