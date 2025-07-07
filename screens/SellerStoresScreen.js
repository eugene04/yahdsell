// screens/SellerStoreScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// 1. Import the new firebase modules
import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Helper Components ---
const StarRating = ({ rating = 0, size = 18, style }) => {
    const filledStars = Math.round(rating);
    return (
        <View style={[{ flexDirection: 'row' }, style]}>
            {[...Array(5)].map((_, index) => (
                <Text key={index} style={{ color: index < filledStars ? '#fadb14' : '#d9d9d9', fontSize: size, marginRight: 1 }}>
                    ★
                </Text>
            ))}
        </View>
    );
};

const SellerStoreScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    // 2. Use new auth syntax
    const loggedInUser = auth().currentUser;
    const { sellerId, sellerName } = route.params || {};

    const [storeSeller, setStoreSeller] = useState(null);
    const [sellerProducts, setSellerProducts] = useState([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [wishlistIds, setWishlistIds] = useState(new Set());

    useEffect(() => {
        const title = sellerName || storeSeller?.displayName || 'Seller';
        navigation.setOptions({ title: `${title}'s Store` });
    }, [navigation, sellerName, storeSeller]);

    // --- Data Fetching ---
    useFocusEffect(
        useCallback(() => {
            if (!sellerId) {
                setError("Seller not found.");
                setLoadingProfile(false);
                setLoadingProducts(false);
                return;
            }

            // 3. Update Firestore listener syntax
            const unsubscribeProfile = firestore()
                .collection('users')
                .doc(sellerId)
                .onSnapshot(doc => {
                    setStoreSeller(doc.exists ? { uid: doc.id, ...doc.data() } : null);
                    if (loadingProfile) setLoadingProfile(false);
                });

            const productsQuery = firestore()
                .collection('products')
                .where('sellerId', '==', sellerId)
                .where('isSold', '==', false)
                .orderBy('createdAt', 'desc');
            const unsubscribeProducts = productsQuery.onSnapshot(snapshot => {
                const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setSellerProducts(productsData);
                if (loadingProducts) setLoadingProducts(false);
            });
            
            let unsubscribeWishlist = () => {};
            if (loggedInUser) {
                unsubscribeWishlist = firestore()
                    .collection('users').doc(loggedInUser.uid).collection('wishlist')
                    .onSnapshot(snapshot => {
                        setWishlistIds(new Set(snapshot.docs.map(doc => doc.id)));
                    });
            }

            return () => {
                unsubscribeProfile();
                unsubscribeProducts();
                unsubscribeWishlist();
            };
        }, [sellerId, loggedInUser, loadingProfile, loadingProducts])
    );

    const onRefresh = useCallback(() => {
        // This can be simplified as useFocusEffect handles re-fetching.
        // For manual refresh, you might re-trigger the fetch logic here if needed.
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 1000); // Simulate refresh
    }, []);

    // --- Handlers for Wishlist ---
    const handleSaveItem = async (productId) => {
        if (!loggedInUser) { Alert.alert("Login Required", "Please log in to save items."); return; }
        // 4. Update Firestore write syntax
        await firestore().collection('users').doc(loggedInUser.uid).collection('wishlist').doc(productId).set({
            savedAt: firestore.FieldValue.serverTimestamp()
        });
        Toast.show({ type: 'success', text1: 'Added to Wishlist!', position: 'bottom' });
    };

    const handleUnsaveItem = async (productId) => {
        if (!loggedInUser) return;
        await firestore().collection('users').doc(loggedInUser.uid).collection('wishlist').doc(productId).delete();
        Toast.show({ type: 'info', text1: 'Removed from Wishlist', position: 'bottom' });
    };

    // --- Render Logic ---
    const renderProductItem = ({ item }) => {
        const isSaved = wishlistIds.has(item.id);
        return (
            <View style={styles.productItemContainer}>
                <TouchableOpacity style={styles.productItemTouchable} onPress={() => navigation.push('Details', { productId: item.id })}>
                    <Image source={{ uri: item.imageUrl || 'https://placehold.co/150x150/e0e0e0/7f7f7f?text=No+Image' }} style={styles.productImage} />
                    <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.productPrice}>{`$${item.price.toFixed(2)}`}</Text>
                </TouchableOpacity>
                {loggedInUser && (
                    <TouchableOpacity style={styles.saveButton} onPress={() => isSaved ? handleUnsaveItem(item.id) : handleSaveItem(item.id)}>
                        <Ionicons name={isSaved ? "heart" : "heart-outline"} size={22} color={isSaved ? colors.error : colors.textSecondary} />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    if (loadingProfile || loadingProducts) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /><Text style={styles.loadingText}>Loading Store...</Text></SafeAreaView>;
    }
    if (error) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <FlatList
                data={sellerProducts}
                renderItem={renderProductItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={styles.listContainer}
                ListHeaderComponent={
                    storeSeller && (
                        <View style={styles.profileHeader}>
                            <Image source={{ uri: storeSeller.profilePicUrl || 'https://placehold.co/100x100/E0E0E0/7F7F7F?text=User' }} style={styles.profileAvatarImage} />
                            <Text style={styles.profileName}>{storeSeller.displayName}</Text>
                            {storeSeller.bio && <Text style={styles.profileBio}>{storeSeller.bio}</Text>}
                            {storeSeller.ratingCount > 0 ? (
                                <TouchableOpacity style={styles.ratingContainer} onPress={() => navigation.navigate('SellerReviews', { sellerId: storeSeller.uid, sellerName: storeSeller.displayName })}>
                                    <StarRating rating={storeSeller.averageRating || 0} size={22}/>
                                    <Text style={styles.ratingCountText}>({storeSeller.ratingCount} ratings)</Text>
                                </TouchableOpacity>
                            ) : <Text style={styles.noRatingText}>No ratings yet</Text>}
                            <Text style={styles.listHeader}>Active Listings</Text>
                        </View>
                    )
                }
                ListEmptyComponent={<Text style={styles.emptyListText}>{sellerName || 'This seller'} has no active listings.</Text>}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primaryTeal} />}
                extraData={wishlistIds}
            />
        </SafeAreaView>
    );
};

// --- Styles ---
const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    loadingText: { marginTop: 10, fontSize: 16, color: colors.textSecondary },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
    profileHeader: { paddingVertical: 20, paddingHorizontal: 15, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, marginBottom: 10 },
    profileAvatarImage: { width: 100, height: 100, borderRadius: 50, marginBottom: 15, borderWidth: 1, borderColor: colors.border },
    profileName: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 },
    profileBio: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 12, paddingHorizontal: 10 },
    ratingContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    ratingCountText: { fontSize: 13, color: colors.textSecondary, marginLeft: 6 },
    noRatingText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 15 },
    listHeader: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginTop: 15, marginBottom: 10 },
    listContainer: { paddingHorizontal: 5, paddingBottom: 20 },
    productItemContainer: { flex: 1/2, margin: 5, backgroundColor: colors.surface, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDarkMode ? 0.25 : 0.1, shadowRadius: 2.5, elevation: 2, position: 'relative' },
    productItemTouchable: { padding: 10, alignItems: 'center' },
    productImage: { width: '100%', aspectRatio: 1, borderRadius: 4, marginBottom: 8, backgroundColor: colors.border },
    productName: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: colors.textPrimary, marginBottom: 4 },
    productPrice: { fontSize: 14, color: colors.primaryGreen, fontWeight: 'bold', marginTop: 4 },
    saveButton: { position: 'absolute', top: 6, right: 6, zIndex: 2, padding: 6, backgroundColor: isDarkMode ? 'rgba(40,40,40,0.75)' : 'rgba(255,255,255,0.75)', borderRadius: 18 },
    emptyListText: { textAlign: 'center', marginTop: 30, fontSize: 16, color: colors.textSecondary },
});

export default SellerStoreScreen;
