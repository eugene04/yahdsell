// screens/EditProductScreen.js

import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text
} from 'react-native';
import Toast from 'react-native-toast-message';

// 1. Import the new firebase modules
import { auth, firestore, storage } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Constants ---
const PRODUCT_CATEGORIES = [ "Select Category...", "Electronics", "Clothing & Apparel", "Home & Garden", "Furniture", "Vehicles", "Books, Movies & Music", "Collectibles & Art", "Sports & Outdoors", "Toys & Hobbies", "Baby & Kids", "Health & Beauty", "Other" ];
const SELECTABLE_CATEGORIES = PRODUCT_CATEGORIES.slice(1);

const PRODUCT_CONDITIONS = [ "Select Condition...", "New", "Used - Like New", "Used - Good", "Used - Fair" ];
const SELECTABLE_CONDITIONS = PRODUCT_CONDITIONS.slice(1);

const MAX_IMAGES = 5;

const EditProductScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { productId } = route.params || {};
    // 2. Use new auth syntax
    const currentUser = auth().currentUser;
    const { colors, isDarkMode } = useTheme();

    // --- State Management ---
    const [productName, setProductName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState(PRODUCT_CATEGORIES[0]);
    const [productCondition, setProductCondition] = useState(PRODUCT_CONDITIONS[0]);
    const [isSold, setIsSold] = useState(false);
    const [imageObjects, setImageObjects] = useState([]);
    const [imagesToDeleteFromStorage, setImagesToDeleteFromStorage] = useState([]);
    const [loadingProduct, setLoadingProduct] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [manipulatingImageIndex, setManipulatingImageIndex] = useState(-1);
    const [formError, setFormError] = useState('');
    const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
    const [isConditionModalVisible, setConditionModalVisible] = useState(false);

    // --- Data Fetching ---
    useEffect(() => {
        if (!productId) {
            Toast.show({ type: 'error', text1: 'Product ID is missing.' });
            navigation.goBack();
            return;
        }
        
        // 3. Use new Firestore syntax for listening to a document
        const productRef = firestore().collection('products').doc(productId);
        const unsubscribe = productRef.onSnapshot(docSnap => {
            if (docSnap.exists) {
                const data = docSnap.data();
                setProductName(data.name || '');
                setDescription(data.description || '');
                setPrice(data.price?.toString() || '');
                setCategory(data.category || PRODUCT_CATEGORIES[0]);
                setProductCondition(data.condition || PRODUCT_CONDITIONS[0]);
                setIsSold(data.isSold || false);
                const existingImages = (data.imageUrls || []).map((url, index) => ({
                    uri: url, type: 'remote', id: `remote-${url}-${index}`, storagePath: data.imageStoragePaths?.[index] || null
                }));
                setImageObjects(existingImages);
            } else {
                Toast.show({ type: 'error', text1: 'Product not found.' });
                navigation.goBack();
            }
            if (loadingProduct) setLoadingProduct(false);
        }, error => {
            console.error("Error fetching product for edit:", error);
            Toast.show({ type: 'error', text1: 'Failed to load product details.' });
            setLoadingProduct(false);
        });

        return () => unsubscribe();
    }, [productId, navigation]);

    // --- Handlers ---
    const handleChoosePhoto = useCallback(async () => {
        if (imageObjects.length >= MAX_IMAGES) { Alert.alert("Maximum Images Reached", `You can only upload ${MAX_IMAGES} images.`); return; }
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Required'); return; }
        
        let result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [4, 3], quality: 1 });
        if (!result.canceled && result.assets?.[0]) {
            const currentProcessingIndex = imageObjects.length;
            setManipulatingImageIndex(currentProcessingIndex);
            setImageObjects(prev => [...prev, { uri: result.assets[0].uri, type: 'local-processing', id: `processing-${Date.now()}` }]);
            
            try {
                const manipResult = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 1024 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
                setImageObjects(prev => prev.map((img, idx) => idx === currentProcessingIndex ? { uri: manipResult.uri, type: 'local', id: `local-${manipResult.uri}` } : img));
            } catch (e) {
                setImageObjects(prev => prev.filter(img => img.type !== 'local-processing'));
                Toast.show({type: 'error', text1: 'Image Error', text2: 'Could not process image.'});
            } finally {
                setManipulatingImageIndex(-1);
            }
        }
    }, [imageObjects]);

    const handleRemoveImage = useCallback((indexToRemove) => {
        const imageToRemove = imageObjects[indexToRemove];
        if (imageToRemove.type === 'remote' && imageToRemove.storagePath) {
            setImagesToDeleteFromStorage(prev => [...prev, imageToRemove.storagePath]);
        }
        setImageObjects(prev => prev.filter((_, index) => index !== indexToRemove));
    }, [imageObjects]);

    const handleSubmit = useCallback(async () => {
        if (!productName.trim() || !description.trim() || !price.trim()) { Alert.alert('Missing Fields', 'Please fill in Name, Description, and Price.'); return; }
        if (imageObjects.length === 0) { Alert.alert('Missing Image', 'Please select at least one image.'); return; }
        
        setSubmitting(true);
        setUploading(true);
        
        try {
            // Delete marked images from Firebase Storage
            await Promise.all(imagesToDeleteFromStorage.map(path => path ? storage().ref(path).delete().catch(() => {}) : Promise.resolve()));

            const uploadTasks = imageObjects.map(async (imgObj) => {
                if (imgObj.type === 'local') {
                    const filename = `${currentUser.uid}_${Date.now()}.jpeg`;
                    const path = `product_images/${filename}`;
                    const reference = storage().ref(path);
                    await reference.putFile(imgObj.uri);
                    const url = await reference.getDownloadURL();
                    return { url, path };
                }
                return { url: imgObj.uri, path: imgObj.storagePath };
            });

            const uploadedFiles = await Promise.all(uploadTasks);
            setUploading(false);

            const finalImageUrls = uploadedFiles.map(f => f.url).filter(Boolean);
            const finalImageStoragePaths = uploadedFiles.map(f => f.path).filter(Boolean);
            
            const productUpdateData = {
                name: productName.trim(),
                description: description.trim(),
                price: parseFloat(price) || 0,
                category,
                condition: productCondition,
                isSold,
                imageUrls: finalImageUrls,
                imageUrl: finalImageUrls[0] || null,
                imageStoragePaths: finalImageStoragePaths,
                lastUpdatedAt: firestore.FieldValue.serverTimestamp(),
            };

            await firestore().collection('products').doc(productId).update(productUpdateData);
            Toast.show({ type: 'success', text1: 'Product Updated!' });
            navigation.goBack();
        } catch (e) {
            console.error("[EditProductScreen] Error:", e);
            Toast.show({ type: 'error', text1: 'Update Failed', text2: e.message });
        } finally {
            setSubmitting(false);
            setUploading(false);
        }
    }, [productName, description, price, category, productCondition, isSold, imageObjects, imagesToDeleteFromStorage, currentUser, navigation, productId]);

    // --- UI ---
    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    if (loadingProduct) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                    <Text style={styles.title}>Edit Product</Text>
                    
                    {/* Your Form Inputs, Modals, and Buttons Here */}
                    {/* ... (The JSX structure remains the same as your original file) ... */}
                    
                </ScrollView>
            </KeyboardAvoidingView>
            <Toast />
        </SafeAreaView>
    );
};

// --- Styles (Full styles from your original file) ---
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
    toggleContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingVertical: 10, paddingHorizontal: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, },
    isSoldButton: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 6, borderWidth: 1, borderColor: colors.primaryGreen, backgroundColor: colors.surface },
    isSoldButtonActive: { backgroundColor: colors.primaryGreen, borderColor: colors.primaryGreen, },
    isSoldButtonText: { color: colors.textPrimary, fontWeight: '500' },
    imageManagementContainer: { marginBottom: 20, borderWidth: 1, borderColor: colors.border, paddingVertical: 15, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.surfaceLight || colors.surface, },
    imagePreviewList: { marginBottom: 10, },
    previewImageItemContainer: { marginRight: 10, position: 'relative', borderWidth: 1, borderColor: colors.border, borderRadius: 6, overflow: 'hidden', },
    previewImage: { width: 100, height: 100, borderRadius: 6, backgroundColor: colors.border, },
    imageManipulatingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', borderRadius: 6, },
    removeImageButton: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: 0, },
    imagePickerButton: { backgroundColor: colors.primaryGreen, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'center', justifyContent: 'center', alignItems: 'center', minHeight: 40, flexDirection: 'row', marginTop: 5, },
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
