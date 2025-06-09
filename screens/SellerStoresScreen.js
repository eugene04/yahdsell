// screens/SellerStoreScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
    collection,
    deleteDoc,
    doc, getDoc,
    onSnapshot,
    orderBy,
    query, serverTimestamp, setDoc, where
} from 'firebase/firestore'; // Added serverTimestamp, setDoc
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
import Toast from 'react-native-toast-message'; // Added Toast
import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Star Rating Component ---
const StarRating = ({ rating = 0, size = 18, style }) => {
    const filledStars = Math.round(rating);
    const totalStars = 5;
    return (
        <View style={[{ flexDirection: 'row' }, style]}>
            {[...Array(totalStars)].map((_, index) => {
                const starNumber = index + 1;
                return (
                    <Text key={starNumber} style={{ color: starNumber <= filledStars ? '#fadb14' : '#d9d9d9', fontSize: size, marginRight: 1 }}>
                        ★
                    </Text>
                );
            })}
        </View>
    );
};
// --- End Star Rating ---

const SellerStoreScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    const loggedInUser = auth.currentUser;

    const { sellerId, sellerName } = route.params || {};

    const [storeSeller, setStoreSeller] = useState(null);
    const [sellerProducts, setSellerProducts] = useState([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [wishlistIds, setWishlistIds] = useState(new Set());

    useEffect(() => {
        const title = sellerName ? `${sellerName}'s Store` : (storeSeller?.displayName ? `${storeSeller.displayName}'s Store` : 'Seller Store');
        navigation.setOptions({ title: title });
    }, [navigation, sellerName, storeSeller]);

    const fetchSellerProfile = useCallback(async () => {
        if (!sellerId) {
            setError("Seller ID not found.");
            setLoadingProfile(false);
            return;
        }
        // Only set loading if it's truly the initial fetch for this profile
        if (!storeSeller || storeSeller.uid !== sellerId) {
            setLoadingProfile(true);
        }
        setError(null);
        try {
            const userDocRef = doc(firestore, 'users', sellerId);
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                setStoreSeller({ uid: docSnap.id, ...docSnap.data() });
            } else {
                setError("Seller profile not found.");
                setStoreSeller(null);
            }
        } catch (err) {
            console.error("Error fetching seller profile:", err);
            setError("Failed to load seller profile.");
            setStoreSeller(null);
        } finally {
            setLoadingProfile(false);
        }
    }, [sellerId, storeSeller]); // storeSeller added to prevent re-setting loading true unnecessarily

    const fetchSellerProducts = useCallback(() => {
        if (!sellerId) {
            setLoadingProducts(false);
            setIsRefreshing(false);
            return () => {};
        }
        // Only set loading if it's truly the initial fetch for this seller's products
        if (sellerProducts.length === 0 || sellerProducts[0]?.sellerId !== sellerId) {
             setLoadingProducts(true);
        }

        const productsRef = collection(firestore, 'products');
        const q = query(
            productsRef,
            where('sellerId', '==', sellerId),
            where('isSold', '==', false),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const productsData = [];
            querySnapshot.forEach((doc) => {
                productsData.push({ id: doc.id, ...doc.data() });
            });
            setSellerProducts(productsData);
            setLoadingProducts(false);
            setIsRefreshing(false);
        }, (err) => {
            console.error("Error fetching seller products:", err);
            if (err.code === 'failed-precondition') {
                setError("Data query error. Ensure Firestore indexes are set up.");
            } else {
                setError("Failed to load seller's listings.");
            }
            setLoadingProducts(false);
            setIsRefreshing(false);
        });
        return unsubscribe;
    }, [sellerId, sellerProducts]); // sellerProducts added to dependency

    useFocusEffect(
        useCallback(() => {
            console.log("SellerStoreScreen focused. Current loggedInUser:", loggedInUser?.uid);
            let unsubscribeWishlist = () => {};
            if (loggedInUser) {
                console.log("Fetching wishlist for user:", loggedInUser.uid);
                const wishlistRef = collection(firestore, 'users', loggedInUser.uid, 'wishlist');
                unsubscribeWishlist = onSnapshot(wishlistRef, (snapshot) => {
                    const ids = new Set();
                    snapshot.forEach((doc) => ids.add(doc.id));
                    setWishlistIds(ids);
                    console.log("Wishlist IDs updated in SellerStoreScreen:", ids);
                }, (error) => {
                    console.error("Error fetching wishlist in SellerStoreScreen:", error);
                    setWishlistIds(new Set()); // Reset on error
                });
            } else {
                console.log("No logged-in user, clearing wishlist IDs.");
                setWishlistIds(new Set());
            }
            return () => {
                console.log("Cleaning up wishlist snapshot in SellerStoreScreen.");
                unsubscribeWishlist();
            };
        }, [loggedInUser]) // Dependency: loggedInUser. auth.currentUser is stable but its content isn't reactive for this hook directly.
                           // RootNavigator handles auth changes by swapping stacks, so loggedInUser should be fresh on mount.
    );

    useFocusEffect(
        useCallback(() => {
            let isActive = true;
            // Fetch profile
            fetchSellerProfile();
            // Fetch products
            const unsubscribeProducts = fetchSellerProducts();

            return () => {
                isActive = false;
                unsubscribeProducts();
            };
        }, [sellerId, fetchSellerProfile, fetchSellerProducts])
    );

    const onRefresh = useCallback(() => {
        setIsRefreshing(true);
        setError(null);
        fetchSellerProfile(); // This will set its own loading states
        fetchSellerProducts(); // This will set its own loading states and isRefreshing
    }, [fetchSellerProfile, fetchSellerProducts]);


    const handleSaveItem = async (productId) => {
        const currentUser = auth.currentUser; // Get fresh currentUser instance
        console.log("handleSaveItem called for product:", productId, "User:", currentUser?.uid);
        if (!currentUser) {
            Alert.alert("Login Required", "Log in to save items.", [{ text: "Cancel" }, { text: "Log In", onPress: () => navigation.navigate('Login') }]);
            return;
        }
        if (!productId) return;
        const wishlistItemRef = doc(firestore, 'users', currentUser.uid, 'wishlist', productId);
        try {
            await setDoc(wishlistItemRef, { savedAt: serverTimestamp() });
            Toast.show({ type: 'success', text1: 'Added to Wishlist!', position: 'bottom', visibilityTime: 2000 });
            // UI should update via onSnapshot listener for wishlistIds
        } catch (error) {
            console.error("Error saving item to wishlist:", error);
            Toast.show({ type: 'error', text1: 'Error Saving Item', text2: error.message, position: 'bottom', visibilityTime: 3000 });
        }
    };

    const handleUnsaveItem = async (productId) => {
        const currentUser = auth.currentUser; // Get fresh currentUser instance
        console.log("handleUnsaveItem called for product:", productId, "User:", currentUser?.uid);
        if (!currentUser || !productId) return;
        const wishlistItemRef = doc(firestore, 'users', currentUser.uid, 'wishlist', productId);
        try {
            await deleteDoc(wishlistItemRef);
            Toast.show({ type: 'info', text1: 'Removed from Wishlist', position: 'bottom', visibilityTime: 2000 });
            // UI should update via onSnapshot listener for wishlistIds
        } catch (error) {
            console.error("Error unsaving item from wishlist:", error);
            Toast.show({ type: 'error', text1: 'Error Removing Item', text2: error.message, position: 'bottom', visibilityTime: 3000 });
        }
    };

    const renderProductItem = ({ item }) => {
        const isSaved = wishlistIds.has(item.id);
        const currentUser = auth.currentUser; // Ensure we use the latest auth status for rendering visibility

        return (
            <View style={[styles.productItemContainer, item.isSold && styles.soldProductContainer]}>
                <TouchableOpacity
                    style={styles.productItemTouchable}
                    onPress={() => navigation.push('Details', { productId: item.id })}
                    disabled={item.isSold}
                >
                    <Image
                        source={{ uri: item.imageUrl || 'https://via.placeholder.com/150' }}
                        style={[styles.productImage, item.isSold && styles.soldProductImage]}
                        resizeMode="cover"
                        onError={(e) => console.log("Failed to load product image:", item.imageUrl, e.nativeEvent.error)}
                    />
                    {item.isSold && (
                        <View style={styles.soldBadge}>
                            <Text style={styles.soldBadgeText}>SOLD</Text>
                        </View>
                    )}
                    <Text style={styles.productName} numberOfLines={1}>{item.name || 'No Name'}</Text>
                    <Text style={styles.productPrice}>{typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : 'N/A'}</Text>
                </TouchableOpacity>
                {currentUser && !item.isSold && (
                    <TouchableOpacity
                        style={styles.saveButton}
                        onPress={() => isSaved ? handleUnsaveItem(item.id) : handleSaveItem(item.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name={isSaved ? "heart" : "heart-outline"} size={22} color={isSaved ? colors.error : colors.textSecondary} />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    if (loadingProfile && !storeSeller) {
         return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /><Text style={styles.loadingText}>Loading Store...</Text></SafeAreaView>;
    }
    if (error && !storeSeller && !loadingProfile) { // Show error only if not loading and no seller
         return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={onRefresh}><Text style={{color: colors.primaryTeal}}>Try Again</Text></TouchableOpacity></SafeAreaView>;
    }
    if (!storeSeller && !loadingProfile) { // Fallback if seller profile couldn't be loaded
         return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>Seller's store could not be loaded.</Text><TouchableOpacity onPress={onRefresh}><Text style={{color: colors.primaryTeal}}>Try Again</Text></TouchableOpacity></SafeAreaView>;
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
                    storeSeller ? ( // Ensure storeSeller is available before rendering header
                        <View style={styles.profileHeader}>
                            {storeSeller.profilePicUrl ? (
                                <Image source={{ uri: storeSeller.profilePicUrl }} style={styles.profileAvatarImage} onError={(e) => console.log("Failed to load seller avatar:", storeSeller.profilePicUrl, e.nativeEvent.error)} />
                            ) : (
                               <View style={styles.profileAvatarPlaceholder}>
                                    <Text style={styles.profileAvatarInitial}>
                                        {storeSeller.displayName ? storeSeller.displayName.charAt(0).toUpperCase() : '?'}
                                    </Text>
                               </View>
                            )}
                            <Text style={styles.profileName}>{storeSeller.displayName || 'Seller'}</Text>
                            {storeSeller.bio ? (
                                 <Text style={styles.profileBio}>{storeSeller.bio}</Text>
                            ) : null }
                            {(storeSeller.ratingCount !== undefined && storeSeller.ratingCount > 0) ? (
                                <TouchableOpacity style={styles.ratingContainer} onPress={() => navigation.navigate('SellerReviews', { sellerId: storeSeller.uid, sellerName: storeSeller.displayName })}>
                                    <StarRating rating={storeSeller.averageRating || 0} size={22}/>
                                    <Text style={styles.ratingCountText}>({storeSeller.ratingCount} ratings)</Text>
                                </TouchableOpacity>
                            ) : ( <Text style={styles.noRatingText}>No ratings yet</Text> )}
                            <Text style={styles.listHeader}>
                                Active Listings
                            </Text>
                        </View>
                    ) : null // Render nothing or a minimal header if storeSeller is null
                }
                ListEmptyComponent={ !loadingProducts && sellerProducts.length === 0 ? ( <Text style={styles.emptyListText}>{storeSeller?.displayName || 'This seller'} has no active listings.</Text> ) : null }
                ListFooterComponent={loadingProducts && sellerProducts.length > 0 ? <ActivityIndicator style={{ marginVertical: 20 }} size="small" color={colors.primaryTeal} /> : null} // Show footer loading only if there are already items
                refreshControl={ <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primaryTeal} colors={[colors.primaryTeal]} /> }
                extraData={wishlistIds} // ****** THIS IS THE KEY FIX ******
            />
        </SafeAreaView>
    );
};

const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors.background },
    loadingText: { marginTop: 10, fontSize: 16, color: colors.textSecondary },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center', paddingHorizontal: 20, },
    profileHeader: { paddingVertical: 20, paddingHorizontal: 15, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, marginBottom: 10, },
    profileAvatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: 15, },
    profileAvatarImage: { width: 100, height: 100, borderRadius: 50, marginBottom: 15, borderWidth: 1, borderColor: colors.border, },
    profileAvatarInitial: { fontSize: 40, fontWeight: 'bold', color: colors.textSecondary, },
    profileName: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8, textAlign: 'center', },
    profileBio: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 12, paddingHorizontal: 10, },
    ratingContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, paddingVertical: 5 }, // Made Touchable
    ratingCountText: { fontSize: 13, color: colors.textSecondary, marginLeft: 6, },
    noRatingText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 15, },
    listHeader: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginTop: 15, marginBottom: 10, alignSelf: 'center' },
    listContainer: { paddingHorizontal: 5, paddingBottom: 20 }, // Reduced horizontal padding for items
    productItemContainer: { flex: 1/2, margin: 5, backgroundColor: colors.surface, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDarkMode ? 0.25 : 0.1, shadowRadius: 2.5, elevation: 2, position: 'relative' },
    soldProductContainer: { opacity: 0.6, },
    soldProductImage: { /* Optional styles */ },
    soldBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.error, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, zIndex: 1, },
    soldBadgeText: { color: colors.textOnPrimary || '#ffffff', fontSize: 10, fontWeight: 'bold', },
    productItemTouchable: { padding: 10, alignItems: 'center', flex: 1, justifyContent: 'space-between' }, // Ensure content is spaced
    productImage: { width: '100%', aspectRatio: 1, borderRadius: 4, marginBottom: 8, backgroundColor: colors.border }, // Aspect ratio for consistency
    productName: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: colors.textPrimary, marginBottom: 4, minHeight: 36 }, // Min height for 2 lines
    productPrice: { fontSize: 14, color: colors.primaryGreen, fontWeight: 'bold', marginTop: 4 },
    saveButton: { position: 'absolute', top: 6, right: 6, zIndex: 2, padding: 6, backgroundColor: isDarkMode ? 'rgba(40,40,40,0.75)' : 'rgba(255,255,255,0.75)', borderRadius: 18, }, // Adjusted for better visibility
    emptyListText: { textAlign: 'center', marginTop: 30, fontSize: 16, color: colors.textSecondary, paddingHorizontal: 20 },
});

export default SellerStoreScreen;
