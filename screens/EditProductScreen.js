// screens/EditProductScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
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
import { auth, firestore, storage } from '../firebaseConfig';
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

const EditProductScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { productId } = route.params || {};
    const currentUser = auth.currentUser;
    const { colors, isDarkMode } = useTheme();

    // Form fields state
    const [productName, setProductName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState(PRODUCT_CATEGORIES[0]);
    const [productCondition, setProductCondition] = useState(PRODUCT_CONDITIONS[0]);
    const [isSold, setIsSold] = useState(false); // To load existing isSold status

    // Image State
    // Each item in imageUris can be { uri: string (local or remote), type: 'local' | 'remote', originalPath?: string }
    const [imageObjects, setImageObjects] = useState([]);
    const [initialImageObjects, setInitialImageObjects] = useState([]); // To track original remote images
    const [imagesToDeleteFromStorage, setImagesToDeleteFromStorage] = useState([]); // Paths of remote images to delete

    const [manipulatingImageIndex, setManipulatingImageIndex] = useState(-1); // Index of image being processed

    // Control and status state
    const [loadingProduct, setLoadingProduct] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
    const [isConditionModalVisible, setConditionModalVisible] = useState(false);

    // Store original product data to compare for changes if needed (e.g., location)
    const [originalProductData, setOriginalProductData] = useState(null);


    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    // --- Fetch Product Details ---
    useEffect(() => {
        if (!productId) {
            Toast.show({ type: 'error', text1: 'Error', text2: 'Product ID is missing.' });
            navigation.goBack();
            return;
        }
        setLoadingProduct(true);
        const productRef = doc(firestore, 'products', productId);
        getDoc(productRef).then(docSnap => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setOriginalProductData(data); // Store original data

                setProductName(data.name || '');
                setDescription(data.description || '');
                setPrice(data.price?.toString() || '');
                setCategory(data.category || PRODUCT_CATEGORIES[0]);
                setProductCondition(data.condition || PRODUCT_CONDITIONS[0]);
                setIsSold(data.isSold || false);

                const existingImages = (data.imageUrls || [])
                    .map((url, index) => ({
                        uri: url,
                        type: 'remote', // Mark as existing remote image
                        id: `remote-${url}-${index}`, // Unique ID for FlatList key
                        storagePath: data.imageStoragePaths?.[index] || null // Keep track of storage path
                    }));
                setImageObjects(existingImages);
                setInitialImageObjects(existingImages); // Keep a copy of initial remote images

            } else {
                Toast.show({ type: 'error', text1: 'Error', text2: 'Product not found.' });
                navigation.goBack();
            }
        }).catch(error => {
            console.error("Error fetching product for edit:", error);
            Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load product details.' });
            navigation.goBack();
        }).finally(() => {
            setLoadingProduct(false);
        });
    }, [productId, navigation]);


    // --- Image Handling Callbacks ---
    const handleChoosePhoto = useCallback(async () => {
        if (imageObjects.length >= MAX_IMAGES) {
            Alert.alert("Maximum Images Reached", `You can upload a maximum of ${MAX_IMAGES} images.`);
            return;
        }
        setFormError('');
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
                const newImagePlaceholder = {
                    uri: originalUri,
                    type: 'local-processing', // Placeholder while manipulating
                    id: `local-processing-${Date.now()}`
                };

                setImageObjects(prevObjects => [...prevObjects, newImagePlaceholder]);
                const currentProcessingIndex = imageObjects.length; // Index of the newly added placeholder
                setManipulatingImageIndex(currentProcessingIndex);

                const manipResult = await ImageManipulator.manipulateAsync(
                    originalUri,
                    [{ resize: { width: 1024 } }],
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                );

                setImageObjects(prevObjects => prevObjects.map((imgObj, idx) =>
                    idx === currentProcessingIndex
                    ? { uri: manipResult.uri, type: 'local', id: `local-${manipResult.uri}` }
                    : imgObj
                ));
            }
        } catch (pickerError) {
            console.error("[EditProductScreen] Image Picker/Manipulation Error:", pickerError);
            Toast.show({type: 'error', text1: 'Image Error', text2: 'Could not process image.'});
            setFormError("Image processing failed.");
            // Remove the placeholder if manipulation failed
            setImageObjects(prevObjects => prevObjects.filter(obj => obj.type !== 'local-processing'));
        } finally {
            setManipulatingImageIndex(-1);
        }
    }, [imageObjects]);

    const handleRemoveImage = useCallback((indexToRemove) => {
        const imageToRemove = imageObjects[indexToRemove];

        if (imageToRemove.type === 'remote' && imageToRemove.storagePath) {
            // If it's an existing remote image, mark its storage path for deletion from Firebase Storage
            setImagesToDeleteFromStorage(prev => [...prev, imageToRemove.storagePath]);
        }

        setImageObjects(prevObjects => prevObjects.filter((_, index) => index !== indexToRemove));
    }, [imageObjects]);


    // --- Form Submission ---
    const handleSubmit = useCallback(async () => {
        if (!productName.trim() || !description.trim() || !price.trim()) { Alert.alert('Missing Fields', 'Please fill in Name, Description, and Price.'); return; }
        if (imageObjects.length === 0) { Alert.alert('Missing Image', 'Please select at least one image for the product.'); return; }
        if (!category || category === PRODUCT_CATEGORIES[0]) { Alert.alert('Missing Category', 'Please select a product category.'); return; }
        if (!productCondition || productCondition === PRODUCT_CONDITIONS[0]) { Alert.alert('Missing Condition', 'Please select the product condition.'); return; }

        setFormError('');
        setSubmitting(true);
        setUploading(true);

        const finalImageUrls = [];
        const finalImageStoragePaths = [];

        try {
            // 1. Delete images marked for deletion from Firebase Storage
            for (const pathToDelete of imagesToDeleteFromStorage) {
                if (pathToDelete) { // Ensure path is not null/undefined
                    const imageRefToDelete = ref(storage, pathToDelete);
                    try {
                        await deleteObject(imageRefToDelete);
                        console.log("Successfully deleted image from storage:", pathToDelete);
                    } catch (deleteError) {
                        // Log error but continue, as user might have manually deleted or path was old
                        console.warn("Error deleting image from storage (might be already deleted):", pathToDelete, deleteError);
                    }
                }
            }

            // 2. Upload new local images and collect all URLs
            for (const imgObj of imageObjects) {
                if (imgObj.type === 'local') {
                    const response = await fetch(imgObj.uri);
                    const blob = await response.blob();
                    const filename = `${currentUser.uid}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpeg`;
                    const storagePath = `product_images/${filename}`;
                    const imageRef = ref(storage, storagePath);

                    await uploadBytes(imageRef, blob);
                    const downloadURL = await getDownloadURL(imageRef);
                    finalImageUrls.push(downloadURL);
                    finalImageStoragePaths.push(storagePath);
                } else if (imgObj.type === 'remote') {
                    // If it's a remote image that wasn't marked for deletion, keep its URL and path
                    if (!imagesToDeleteFromStorage.includes(imgObj.storagePath)) {
                        finalImageUrls.push(imgObj.uri);
                        if(imgObj.storagePath) finalImageStoragePaths.push(imgObj.storagePath);
                    }
                }
            }
        } catch (e) {
            console.error("[EditProductScreen] Image Upload/Processing Error:", e);
            Toast.show({ type: 'error', text1: 'Upload Failed', text2: 'Could not upload/process one or more images.', position: 'bottom' });
            setSubmitting(false); setUploading(false); return;
        } finally {
            setUploading(false);
        }

        // 3. Update Firestore document
        try {
            const productRef = doc(firestore, 'products', productId);
            const productUpdateData = {
                name: productName.trim(),
                description: description.trim(),
                price: parseFloat(price) || 0,
                category: category,
                condition: productCondition,
                isSold: isSold, // Persist the isSold status
                imageUrl: finalImageUrls.length > 0 ? finalImageUrls[0] : null,
                imageUrls: finalImageUrls,
                imageStoragePaths: finalImageStoragePaths,
                // sellerId, sellerEmail, sellerDisplayName, sellerAverageRating, sellerRatingCount should remain unchanged unless specifically edited
                // createdAt should remain unchanged
                lastUpdatedAt: serverTimestamp(), // Add a field for last update time
            };

            // Optional: Re-fetch location if you want to update it on every edit
            // For now, we assume location is set at creation and not re-fetched here unless explicitly needed.
            // If originalProductData.sellerLocation exists, we can keep it or update it.
            // if (originalProductData?.sellerLocation) {
            //    productUpdateData.sellerLocation = originalProductData.sellerLocation;
            // }

            await updateDoc(productRef, productUpdateData);
            Toast.show({ type: 'success', text1: 'Product Updated!', text2: 'Your item changes are live.', position: 'bottom', visibilityTime: 3000 });
            navigation.goBack();
        } catch (e) {
            console.error("[EditProductScreen] Firestore Update Error:", e);
            Toast.show({ type: 'error', text1: 'Update Failed', text2: 'Could not save product changes.', position: 'bottom', visibilityTime: 4000 });
        } finally {
            setSubmitting(false);
        }
    }, [
        productId, productName, description, price, category, productCondition, isSold,
        imageObjects, imagesToDeleteFromStorage,
        currentUser, navigation, originalProductData
    ]);

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
            <Image source={{ uri: item.uri }} style={styles.previewImage} />
            {item.type === 'local-processing' && ( // Show loader only for 'local-processing'
                <View style={styles.imageManipulatingOverlay}>
                    <ActivityIndicator size="small" color={colors.textOnPrimary || "#fff"} />
                </View>
            )}
            <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => handleRemoveImage(index)}
                disabled={manipulatingImageIndex !== -1 || submitting}
            >
                <Ionicons name="close-circle" size={24} color={colors.error} />
            </TouchableOpacity>
        </View>
    );

    if (loadingProduct) {
        return (
            <SafeAreaView style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primaryTeal} />
                <Text style={styles.loadingText}>Loading product...</Text>
            </SafeAreaView>
        );
    }

    if (!currentUser) { // Should be handled by navigator, but good fallback
         return (
             <SafeAreaView style={styles.centered}>
                 <Text style={styles.errorText}>Please log in to edit an item.</Text>
                 <TouchableOpacity style={[styles.buttonSmall, {width: 'auto', paddingHorizontal: 20}]} onPress={() => navigation.navigate('Login')}>
                     <Text style={styles.buttonSmallText}>Go to Login</Text>
                 </TouchableOpacity>
             </SafeAreaView>
         );
     }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} >
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                    <Text style={styles.title}>Edit Product</Text>
                    {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

                    <TextInput style={styles.input} placeholder="Product Name" value={productName} onChangeText={setProductName} placeholderTextColor={colors.textSecondary}/>
                    <TextInput style={[styles.input, styles.textArea]} placeholder="Product Description" value={description} onChangeText={setDescription} multiline={true} numberOfLines={4} placeholderTextColor={colors.textSecondary}/>
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

                    {/* isSold Toggle - Simple example, can be made prettier */}
                    <View style={styles.toggleContainer}>
                        <Text style={styles.label}>Mark as Sold?</Text>
                        <TouchableOpacity
                            style={[styles.isSoldButton, isSold && styles.isSoldButtonActive]}
                            onPress={() => setIsSold(!isSold)}
                            disabled={submitting}
                        >
                            <Text style={styles.isSoldButtonText}>{isSold ? "Yes, Sold" : "No, Available"}</Text>
                        </TouchableOpacity>
                    </View>


                    <View style={styles.imageManagementContainer}>
                        <Text style={styles.label}>Product Images ({imageObjects.length}/{MAX_IMAGES})</Text>
                        {imageObjects.length > 0 && (
                            <FlatList
                                data={imageObjects}
                                renderItem={renderImagePreviewItem}
                                keyExtractor={(item) => item.id} // Use unique ID from imageObject
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.imagePreviewList}
                                contentContainerStyle={{ paddingRight: 10 }}
                            />
                        )}
                        {imageObjects.length < MAX_IMAGES && (
                            <TouchableOpacity
                                style={[styles.imagePickerButton, (manipulatingImageIndex !== -1 || submitting) && styles.buttonDisabled]}
                                onPress={handleChoosePhoto}
                                disabled={manipulatingImageIndex !== -1 || submitting}
                            >
                                <Ionicons name="add-circle-outline" size={22} color={colors.textOnPrimary || '#fff'} style={{marginRight: 8}}/>
                                <Text style={styles.buttonText}>Add Image</Text>
                            </TouchableOpacity>
                        )}
                         {manipulatingImageIndex !== -1 && (
                            <Text style={styles.loadingTextSmall}>Processing image...</Text>
                        )}
                    </View>

                    {(uploading || (submitting && !uploading && imageObjects.some(img => img.type === 'local'))) && <ActivityIndicator size="large" color={colors.primaryTeal} style={styles.loadingIndicator}/>}
                    {uploading && <Text style={styles.loadingText}>Uploading images...</Text>}
                    {submitting && !uploading && <Text style={styles.loadingText}>Saving changes...</Text>}

                    <TouchableOpacity
                        style={[styles.button, styles.submitButton, (submitting || manipulatingImageIndex !== -1 || imageObjects.length === 0) && styles.buttonDisabled]}
                        onPress={handleSubmit}
                        disabled={submitting || manipulatingImageIndex !== -1 || imageObjects.length === 0}
                    >
                         <Ionicons name="checkmark-circle-outline" size={22} color={colors.textOnPrimary || '#fff'} style={{marginRight: 8}}/>
                        <Text style={styles.buttonText}>Save Changes</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Category Modal */}
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

            {/* Condition Modal */}
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

    toggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        paddingVertical: 10,
        paddingHorizontal: 5,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: colors.surface,
    },
    isSoldButton: {
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.primaryGreen,
        backgroundColor: colors.surface, // Default available
    },
    isSoldButtonActive: {
        backgroundColor: colors.primaryGreen, // Active sold
        borderColor: colors.primaryGreen,
    },
    isSoldButtonText: {
        color: colors.textPrimary, // Default text color
        fontWeight: '500',
    },
    // Ensure active text color contrasts with active background
    // This might need to be adjusted if colors.primaryGreen is light
    // isSoldButtonActive .isSoldButtonText: { color: colors.textOnPrimary || '#fff' },


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
    buttonDisabled: { backgroundColor: colors.textDisabled, },
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

export default EditProductScreen;
