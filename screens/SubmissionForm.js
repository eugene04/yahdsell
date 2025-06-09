// screens/SubmissionForm.js (With AI Description Suggestion - Hints Added)

import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { GeoPoint, addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
// Import for calling Cloud Function
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useCallback, useMemo, useState } from 'react';
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
import { app, auth, firestore, storage } from '../firebaseConfig'; // Ensure app is exported from firebaseConfig
import { useTheme } from '../src/ThemeContext';

// --- Constants ---
const PRODUCT_CATEGORIES = [
    "Select Category...", "Electronics", "Clothing & Apparel", "Home & Garden", "Furniture",
    "Vehicles", "Books, Movies & Music", "Collectibles & Art", "Sports & Outdoors",
    "Toys & Hobbies", "Baby & Kids", "Health & Beauty", "Other",
];
const SELECTABLE_CATEGORIES = PRODUCT_CATEGORIES.slice(1);

const PRODUCT_CONDITIONS = [
    "Select Condition...", "New", "Used - Like New", "Used - Good", "Used - Fair",
];
const SELECTABLE_CONDITIONS = PRODUCT_CONDITIONS.slice(1);

const MAX_IMAGES = 5;

// Initialize Firebase Functions
const functions = getFunctions(app); // Pass the initialized app instance
const askGeminiFunc = httpsCallable(functions, 'askGemini'); // Reference your existing callable function

const SubmissionForm = () => {
    const navigation = useNavigation();
    const currentUser = auth.currentUser;
    const { colors, isDarkMode } = useTheme();

    // Form fields state
    const [productName, setProductName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState(PRODUCT_CATEGORIES[0]);
    const [productCondition, setProductCondition] = useState(PRODUCT_CONDITIONS[0]);

    // Image State
    const [imageUris, setImageUris] = useState([]);
    const [manipulatingImage, setManipulatingImage] = useState(-1);

    // Control and status state
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
    const [isConditionModalVisible, setConditionModalVisible] = useState(false);

    const [isSuggestingDescription, setIsSuggestingDescription] = useState(false);

    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    // Determine if the suggest button should be enabled
    const canSuggestDescription = productName.trim() !== '' && category !== PRODUCT_CATEGORIES[0];


    if (!currentUser) {
         return (
             <SafeAreaView style={styles.centered}>
                 <Text style={styles.errorText}>Please log in to submit an item.</Text>
                 <TouchableOpacity style={[styles.buttonSmall, {width: 'auto', paddingHorizontal: 20}]} onPress={() => navigation.navigate('Login')}>
                     <Text style={styles.buttonSmallText}>Go to Login</Text>
                 </TouchableOpacity>
             </SafeAreaView>
         );
     }

    const handleChoosePhoto = useCallback(async () => {
        if (imageUris.length >= MAX_IMAGES) {
            Alert.alert("Maximum Images Reached", `You can upload a maximum of ${MAX_IMAGES} images.`);
            return;
        }
        setError('');
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission Required', 'Need camera roll permissions.'); return; }

            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 1,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const originalUri = result.assets[0].uri;
                const newImageIndex = imageUris.length;
                setManipulatingImage(newImageIndex);
                setImageUris(prevUris => [...prevUris, originalUri]);

                const manipResult = await ImageManipulator.manipulateAsync(
                    originalUri,
                    [{ resize: { width: 1024 } }],
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                );

                setImageUris(prevUris => {
                    const updatedUris = [...prevUris];
                    if (updatedUris[newImageIndex] === originalUri) {
                       updatedUris[newImageIndex] = manipResult.uri;
                    } else {
                        console.warn("[SubmissionForm] State changed during image manipulation. Attempting to update last known URI.");
                        const idxToUpdate = updatedUris.lastIndexOf(originalUri);
                        if (idxToUpdate !== -1) {
                            updatedUris[idxToUpdate] = manipResult.uri;
                        }
                    }
                    return updatedUris;
                });
            }
        } catch (pickerError) {
            console.error("[SubmissionForm] Image Picker/Manipulation Error:", pickerError);
            Toast.show({type: 'error', text1: 'Image Error', text2: 'Could not process image.'});
            setError("Image processing failed.");
            setImageUris(prevUris => {
                const tempUris = [...prevUris];
                if (tempUris.length > 0 && manipulatingImage === tempUris.length -1 && tempUris[tempUris.length -1].startsWith('file:')) {
                    tempUris.pop();
                }
                return tempUris;
            });
        } finally {
            setManipulatingImage(-1);
        }
    }, [imageUris, manipulatingImage]);

    const handleRemoveImage = useCallback((indexToRemove) => {
        setImageUris(prevUris => prevUris.filter((_, index) => index !== indexToRemove));
    }, []);

    const handleSuggestDescription = async () => {
        if (!canSuggestDescription) { // Use the derived boolean
            Toast.show({ type: 'info', text1: 'Required Info Missing', text2: 'Enter Product Name & Category for suggestions.' });
            return;
        }

        setIsSuggestingDescription(true);
        setError('');

        const prompt = `Write an engaging and concise product description for a marketplace listing.
        Product Name: "${productName}"
        Category: "${category}"
        Highlight key features and benefits for potential buyers. Aim for 2-4 sentences.`;

        try {
            console.log("[SubmissionForm] Calling askGemini Cloud Function with prompt:", prompt);
            const result = await askGeminiFunc({ prompt: prompt });

            if (result.data && typeof result.data.reply === 'string') {
                const suggestedDescription = result.data.reply;
                console.log("[SubmissionForm] Received suggested description:", suggestedDescription);
                setDescription(suggestedDescription);
                Toast.show({ type: 'success', text1: 'Description Suggested!', text2: 'Check the description field.' });
            } else {
                throw new Error("Invalid response format from AI.");
            }
        } catch (aiError) {
            console.error("[SubmissionForm] Error suggesting description:", aiError);
            let errorMessage = "Sorry, couldn't suggest a description right now.";
            if (aiError instanceof Error) {
                errorMessage = aiError.message || errorMessage;
            }
            Toast.show({ type: 'error', text1: 'Suggestion Failed', text2: errorMessage });
            setError(errorMessage);
        } finally {
            setIsSuggestingDescription(false);
        }
    };

    const handleSubmit = useCallback(async () => {
        if (!productName.trim() || !description.trim() || !price.trim()) { Alert.alert('Missing Fields', 'Please fill in Name, Description, and Price.'); return; }
        if (imageUris.length === 0) { Alert.alert('Missing Image', 'Please select at least one image for the product.'); return; }
        if (!category || category === PRODUCT_CATEGORIES[0]) { Alert.alert('Missing Category', 'Please select a product category.'); return; }
        if (!productCondition || productCondition === PRODUCT_CONDITIONS[0]) { Alert.alert('Missing Condition', 'Please select the product condition.'); return; }

        setError('');
        setSubmitting(true);
        setUploading(true);

        let uploadedImageUrls = [];
        let uploadedImagePaths = [];
        let sellerLocationGeoPoint = null;
        let sellerAvgRating = 0;
        let sellerRatingCount = 0;

        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (location.coords) { sellerLocationGeoPoint = new GeoPoint(location.coords.latitude, location.coords.longitude); }
            } else { console.warn("[SubmissionForm] Location permission denied."); }
        } catch (locError) { console.error("[SubmissionForm] Error getting location:", locError); }

        try {
            for (const uri of imageUris) {
                const response = await fetch(uri);
                const blob = await response.blob();
                const filename = `${currentUser.uid}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpeg`;
                const storagePath = `product_images/${filename}`;
                const imageRef = ref(storage, storagePath);

                await uploadBytes(imageRef, blob);
                const downloadURL = await getDownloadURL(imageRef);
                uploadedImageUrls.push(downloadURL);
                uploadedImagePaths.push(storagePath);
            }
        } catch (e) {
            console.error("[SubmissionForm] Image Upload Error:", e);
            Toast.show({ type: 'error', text1: 'Upload Failed', text2: 'Could not upload one or more images.', position: 'bottom' });
            setSubmitting(false); setUploading(false); return;
        } finally {
            setUploading(false);
        }

        try {
            const sellerUserRef = doc(firestore, 'users', currentUser.uid);
            const sellerDoc = await getDoc(sellerUserRef);
            if (sellerDoc.exists()) {
                sellerAvgRating = sellerDoc.data().averageRating || 0;
                sellerRatingCount = sellerDoc.data().ratingCount || 0;
            }

            const productData = {
                name: productName.trim(),
                description: description.trim(),
                price: parseFloat(price) || 0,
                category: category,
                condition: productCondition,
                imageUrl: uploadedImageUrls.length > 0 ? uploadedImageUrls[0] : null,
                imageUrls: uploadedImageUrls,
                imageStoragePaths: uploadedImagePaths,
                sellerId: currentUser.uid,
                sellerEmail: currentUser.email,
                sellerDisplayName: currentUser.displayName || currentUser.email || 'Unknown',
                sellerAverageRating: sellerAvgRating,
                sellerRatingCount: sellerRatingCount,
                isSold: false,
                ...(sellerLocationGeoPoint && { sellerLocation: sellerLocationGeoPoint }),
                createdAt: serverTimestamp(),
            };

            await addDoc(collection(firestore, 'products'), productData);
            Toast.show({ type: 'success', text1: 'Product Submitted!', text2: 'Your item is now live.', position: 'bottom', visibilityTime: 3000 });
            setProductName(''); setDescription(''); setPrice('');
            setImageUris([]);
            setCategory(PRODUCT_CATEGORIES[0]);
            setProductCondition(PRODUCT_CONDITIONS[0]);
            navigation.goBack();
        } catch (e) {
            console.error("[SubmissionForm] Firestore Submission Error:", e);
            Toast.show({ type: 'error', text1: 'Submission Failed', text2: 'Could not save product details.', position: 'bottom', visibilityTime: 4000 });
        } finally {
            setSubmitting(false);
        }
    }, [productName, description, price, imageUris, category, productCondition, currentUser, navigation, canSuggestDescription]); // Added canSuggestDescription

    const handleSelectCategory = useCallback((selectedCat) => {
        setCategory(selectedCat);
        setCategoryModalVisible(false);
    }, []);

    const handleSelectCondition = useCallback((selectedCond) => {
        setProductCondition(selectedCond);
        setConditionModalVisible(false);
    }, []);

    const renderImagePreviewItem = ({ item, index }) => (
        <View style={styles.previewImageItemContainer}>
            <Image source={{ uri: item }} style={styles.previewImage} />
            {manipulatingImage === index && (
                <View style={styles.imageManipulatingOverlay}>
                    <ActivityIndicator size="small" color={colors.textOnPrimary || "#fff"} />
                </View>
            )}
            <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => handleRemoveImage(index)}
                disabled={manipulatingImage !== -1 || submitting}
            >
                <Ionicons name="close-circle" size={24} color={colors.error} />
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} >
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                    <Text style={styles.title}>List New Product</Text>
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    <TextInput style={styles.input} placeholder="Product Name" value={productName} onChangeText={setProductName} placeholderTextColor={colors.textSecondary}/>

                    {/* Description Input and Suggestion Button */}
                    <View style={styles.descriptionContainer}>
                        <TextInput
                            style={[styles.input, styles.textArea, styles.descriptionInput]}
                            placeholder="Product Description"
                            value={description}
                            onChangeText={setDescription}
                            multiline={true}
                            numberOfLines={4}
                            placeholderTextColor={colors.textSecondary}
                        />
                        <View style={styles.suggestButtonContainer}>
                            <TouchableOpacity
                                style={[styles.suggestButton, (isSuggestingDescription || submitting || !canSuggestDescription) && styles.buttonDisabled]}
                                onPress={handleSuggestDescription}
                                disabled={isSuggestingDescription || submitting || !canSuggestDescription}
                            >
                                {isSuggestingDescription ? (
                                    <ActivityIndicator size="small" color={colors.textOnPrimary || '#fff'} />
                                ) : (
                                    <Ionicons name="bulb-outline" size={20} color={colors.textOnPrimary || '#fff'} />
                                )}
                                <Text style={styles.suggestButtonText}>Suggest</Text>
                            </TouchableOpacity>
                            {!canSuggestDescription && !isSuggestingDescription && (
                                <Text style={styles.suggestHintText}>
                                    Enter Product Name & Category to enable suggestions.
                                </Text>
                            )}
                        </View>
                    </View>


                    <TextInput style={styles.input} placeholder="Price (e.g., 29.99)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor={colors.textSecondary}/>

                    <Text style={styles.label}>Category</Text>
                    <TouchableOpacity style={styles.pickerButton} onPress={() => setCategoryModalVisible(true)} disabled={submitting}>
                        <Text style={[ styles.pickerButtonText, category === PRODUCT_CATEGORIES[0] && styles.pickerPlaceholderText ]}>{category}</Text>
                        <Ionicons name="chevron-down-outline" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <Text style={styles.label}>Condition</Text>
                    <TouchableOpacity style={styles.pickerButton} onPress={() => setConditionModalVisible(true)} disabled={submitting}>
                        <Text style={[ styles.pickerButtonText, productCondition === PRODUCT_CONDITIONS[0] && styles.pickerPlaceholderText ]}>{productCondition}</Text>
                        <Ionicons name="chevron-down-outline" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <View style={styles.imageManagementContainer}>
                        <Text style={styles.label}>Product Images ({imageUris.length}/{MAX_IMAGES})</Text>
                        {imageUris.length > 0 && (
                            <FlatList
                                data={imageUris}
                                renderItem={renderImagePreviewItem}
                                keyExtractor={(item, index) => `preview-${index}-${item}`}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.imagePreviewList}
                                contentContainerStyle={{ paddingRight: 10 }}
                            />
                        )}
                        {imageUris.length < MAX_IMAGES && (
                            <TouchableOpacity
                                style={[styles.imagePickerButton, (manipulatingImage !== -1 || submitting) && styles.buttonDisabled]}
                                onPress={handleChoosePhoto}
                                disabled={manipulatingImage !== -1 || submitting}
                            >
                                <Ionicons name="add-circle-outline" size={22} color={colors.textOnPrimary || '#fff'} style={{marginRight: 8}}/>
                                <Text style={styles.buttonText}>Add Image</Text>
                            </TouchableOpacity>
                        )}
                         {manipulatingImage !== -1 && imageUris[manipulatingImage] && (
                            <Text style={styles.loadingTextSmall}>Processing image...</Text>
                        )}
                    </View>

                    {(uploading || (submitting && !uploading && imageUris.length > 0)) && <ActivityIndicator size="large" color={colors.primaryTeal} style={styles.loadingIndicator}/>}
                    {uploading && <Text style={styles.loadingText}>Uploading images...</Text>}
                    {submitting && !uploading && imageUris.length > 0 && <Text style={styles.loadingText}>Finalizing submission...</Text>}

                    <TouchableOpacity
                        style={[styles.button, styles.submitButton, (submitting || manipulatingImage !== -1 || imageUris.length === 0 || isSuggestingDescription) && styles.buttonDisabled]}
                        onPress={handleSubmit}
                        disabled={submitting || manipulatingImage !== -1 || imageUris.length === 0 || isSuggestingDescription}
                    >
                         <Ionicons name="checkmark-circle-outline" size={22} color={colors.textOnPrimary || '#fff'} style={{marginRight: 8}}/>
                        <Text style={styles.buttonText}>Submit Product</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Modals ... (remain the same) */}
            <Modal transparent={true} visible={isCategoryModalVisible} animationType="fade" onRequestClose={() => setCategoryModalVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setCategoryModalVisible(false)} >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select a Category</Text>
                        <FlatList data={SELECTABLE_CATEGORIES} keyExtractor={(item) => item} renderItem={({ item }) => (
                            <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectCategory(item)} >
                                <Text style={[ styles.modalItemText, item === category && styles.modalItemSelectedText ]}>{item}</Text>
                            </TouchableOpacity>
                        )} style={styles.modalList} />
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCategoryModalVisible(false)} >
                            <Text style={styles.modalCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <Modal transparent={true} visible={isConditionModalVisible} animationType="fade" onRequestClose={() => setConditionModalVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setConditionModalVisible(false)}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Product Condition</Text>
                        <FlatList data={SELECTABLE_CONDITIONS} keyExtractor={(item) => item} renderItem={({ item }) => (
                            <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectCondition(item)}>
                                <Text style={[styles.modalItemText, item === productCondition && styles.modalItemSelectedText]}>{item}</Text>
                            </TouchableOpacity>
                        )} style={styles.modalList} />
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setConditionModalVisible(false)}>
                            <Text style={styles.modalCloseButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
            <Toast />
        </SafeAreaView>
    );
};

const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors.background },
    buttonSmall: { backgroundColor: colors.primaryTeal, paddingVertical: 8, paddingHorizontal: 15, borderRadius: 6, },
    buttonSmallText: { color: colors.textOnPrimary || '#ffffff', fontSize: 14, fontWeight: 'bold', },
    scrollContainer: { flexGrow: 1, padding: 20, paddingBottom: 50, },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: colors.textPrimary, },
    label: { fontSize: 14, color: colors.textSecondary, marginBottom: 5, marginLeft: 2, alignSelf: 'flex-start', fontWeight: '500'},
    input: { width: '100%', minHeight: 50, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 15, fontSize: 16, color: colors.textPrimary, },
    textArea: { height: 100, textAlignVertical: 'top', },
    pickerButton: { width: '100%', minHeight: 50, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, },
    pickerButtonText: { fontSize: 16, color: colors.textPrimary, },
    pickerPlaceholderText: { color: colors.textSecondary, fontStyle: 'italic' },

    descriptionContainer: {
        marginBottom: 15,
    },
    descriptionInput: {
        marginBottom: 0,
    },
    // --- NEW: Container for suggest button and hint text ---
    suggestButtonContainer: {
        marginTop: 8, // Space between description input and this container
        alignItems: 'flex-end', // Aligns button and hint text to the right
    },
    suggestButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primaryGreen,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        // alignSelf: 'flex-end', // No longer needed here, handled by suggestButtonContainer
        // marginTop: 8, // Moved to suggestButtonContainer
        elevation: 2,
        maxWidth: 150, // Prevent button from becoming too wide
    },
    suggestButtonText: {
        color: colors.textOnPrimary || '#ffffff',
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 6,
    },
    // --- NEW: Style for the hint text ---
    suggestHintText: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'right', // Align text to the right
        marginTop: 4, // Space between button and hint
        marginRight: 2, // Slight margin from the edge
    },

    imageManagementContainer: {
        marginBottom: 20,
        borderWidth: 1, borderColor: colors.border,
        paddingVertical: 15, paddingHorizontal: 10,
        borderRadius: 8, backgroundColor: colors.surfaceLight || colors.surface,
    },
    imagePreviewList: {
        marginBottom: 10,
    },
    previewImageItemContainer: {
        marginRight: 10,
        position: 'relative',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        overflow: 'hidden',
    },
    previewImage: {
        width: 100, height: 100,
        borderRadius: 6,
        backgroundColor: colors.border,
    },
    imageManipulatingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 6,
    },
    removeImageButton: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: 12,
        padding: 0,
    },
    imagePickerButton: {
        backgroundColor: colors.primaryGreen,
        paddingVertical: 10, paddingHorizontal: 20,
        borderRadius: 8,
        alignSelf: 'center',
        justifyContent: 'center', alignItems: 'center',
        minHeight: 40, flexDirection: 'row',
        marginTop: 5,
    },
    button: { width: '100%', height: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginTop: 10, backgroundColor: colors.primaryTeal, flexDirection: 'row' },
    submitButton: { width: '100%', backgroundColor: colors.primaryTeal, },
    buttonText: { color: colors.textOnPrimary || '#ffffff', fontSize: 16, fontWeight: 'bold', textAlign: 'center', },
    buttonDisabled: { backgroundColor: colors.textDisabled, opacity: 0.7 },
    loadingIndicator: { marginTop: 15, marginBottom: 5 },
    loadingText: { marginTop: 5, marginBottom: 15, textAlign: 'center', color: colors.textSecondary, fontSize: 14 },
    loadingTextSmall: { textAlign: 'center', color: colors.textSecondary, fontSize: 12, marginVertical: 5 },
    errorText: { color: colors.error, marginBottom: 15, fontSize: 16, textAlign: 'center', },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backdrop || 'rgba(0, 0, 0, 0.65)', },
    modalContent: { backgroundColor: colors.surface, borderRadius: 10, paddingTop: 20, paddingBottom: 10, paddingHorizontal: 0, width: '85%', maxHeight: '70%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, alignItems: 'center', },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: colors.textPrimary, paddingHorizontal: 20 },
    modalList: { width: '100%', marginBottom: 10, },
    modalItem: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, },
    modalItemText: { fontSize: 16, color: colors.textPrimary, textAlign: 'center', },
    modalItemSelectedText: { fontWeight: 'bold', color: colors.primaryTeal, },
    modalCloseButton: { paddingVertical: 12, alignItems: 'center', width: '100%', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 5},
    modalCloseButtonText: { fontSize: 16, color: colors.primaryTeal, fontWeight: '600', },
});

export default SubmissionForm;
