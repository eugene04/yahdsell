// screens/HomeScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert, Animated,
    FlatList,
    Image,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// 1. Import the new firebase modules
import { auth, firestore, functions } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Constants ---
const PRODUCT_CATEGORIES_WITH_ALL = [
    "All Categories", "Electronics", "Clothing & Apparel", "Home & Garden", "Furniture",
    "Vehicles", "Books, Movies & Music", "Collectibles & Art", "Sports & Outdoors",
    "Toys & Hobbies", "Baby & Kids", "Health & Beauty", "Other",
];
const SORT_OPTIONS = [
    "Recommended", "Newest First", "Price: Low to High", "Price: High to Low",
];
const PRODUCT_CONDITIONS_WITH_ALL = [
    "Any Condition", "New", "Used - Like New", "Used - Good", "Used - Fair",
];

// 2. Use the imported 'functions' module
const getRankedProductsFunc = functions().httpsCallable('getRankedProducts');

const HomeScreen = () => {
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();

    // --- State Management ---
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [currentUser, setCurrentUser] = useState(() => auth().currentUser);
    const [userInitial, setUserInitial] = useState('');
    const [showWelcomePopup, setShowWelcomePopup] = useState(false);
    const [welcomeMessage, setWelcomeMessage] = useState('');
    const popupOpacity = useRef(new Animated.Value(0)).current;
    const popupTimeoutRef = useRef(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(PRODUCT_CATEGORIES_WITH_ALL[0]);
    const [isCategoryFilterModalVisible, setCategoryFilterModalVisible] = useState(false);
    const [selectedSortOption, setSelectedSortOption] = useState(SORT_OPTIONS[0]);
    const [isSortModalVisible, setSortModalVisible] = useState(false);
    const [selectedConditionFilter, setSelectedConditionFilter] = useState(PRODUCT_CONDITIONS_WITH_ALL[0]);
    const [isConditionModalVisible, setConditionModalVisible] = useState(false);
    const [minPriceInput, setMinPriceInput] = useState('');
    const [maxPriceInput, setMaxPriceInput] = useState('');
    const [appliedMinPrice, setAppliedMinPrice] = useState(null);
    const [appliedMaxPrice, setAppliedMaxPrice] = useState(null);
    const [buyerLocation, setBuyerLocation] = useState(null);
    const [wishlistIds, setWishlistIds] = useState(new Set());
    const [loadingWishlist, setLoadingWishlist] = useState(false);
    const [initialLoadAttempted, setInitialLoadAttempted] = useState(false);
    const [isFetchingInitialLocation, setIsFetchingInitialLocation] = useState(false);
    const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

    // --- Effects ---

    // 3. Update Auth state listener syntax
    useEffect(() => {
        const subscriber = auth().onAuthStateChanged(user => {
            setCurrentUser(user);
            if (user) {
                const name = user.displayName;
                const email = user.email;
                if (name) setUserInitial(name.charAt(0).toUpperCase());
                else if (email) setUserInitial(email.charAt(0).toUpperCase());
                else setUserInitial('?');
            } else {
                setUserInitial('');
                setWishlistIds(new Set());
                setUnreadNotificationsCount(0);
            }
        });
        return subscriber;
    }, []);

    // 4. Update Firebase function call syntax
    const fetchRankedProducts = useCallback(async (currentLocation = null) => {
        const locationData = currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : {};
        try {
            const result = await getRankedProductsFunc(locationData);
            if (result && result.data && Array.isArray(result.data.products)) {
                const productsWithDates = result.data.products.map(p => ({
                    ...p,
                    createdAt: p.createdAt ? new Date(p.createdAt._seconds * 1000) : new Date()
                }));
                setProducts(productsWithDates);
                setError(null);
            } else {
                throw new Error("Products data format error.");
            }
        } catch (err) {
            console.error("[HomeScreen] Error fetching ranked products:", err);
            setError(`Failed to load products. Pull to refresh.`);
            setProducts([]);
        }
    }, []);
    
    // Location fetching logic
    const getLocationAndFetchInitial = useCallback(async () => {
        setLoading(true);
        setIsFetchingInitialLocation(true);
        setError(null);
        let fetchedLocation = null;
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                let location = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (location?.coords) {
                    fetchedLocation = location.coords;
                    setBuyerLocation(fetchedLocation);
                }
            }
        } catch (err) {
            console.error("[HomeScreen] Location Error:", err);
            setError(`Location Error: ${err.message}.`);
        } finally {
            await fetchRankedProducts(fetchedLocation);
            setLoading(false);
            setIsFetchingInitialLocation(false);
            setInitialLoadAttempted(true);
        }
    }, [fetchRankedProducts]);

    // Initial data load
    useEffect(() => {
        if (!initialLoadAttempted && !isFetchingInitialLocation) {
            getLocationAndFetchInitial();
        }
    }, [initialLoadAttempted, isFetchingInitialLocation, getLocationAndFetchInitial]);

    // 5. Update Firestore listener syntax
    useFocusEffect(
        useCallback(() => {
            if (!currentUser) {
                setUnreadNotificationsCount(0);
                return;
            }
            const unsubscribe = firestore()
                .collection('users')
                .doc(currentUser.uid)
                .collection('notifications')
                .where('isRead', '==', false)
                .onSnapshot(snapshot => {
                    setUnreadNotificationsCount(snapshot.size);
                }, error => {
                    console.error("[HomeScreen] Error fetching unread notifications:", error);
                });
            return () => unsubscribe();
        }, [currentUser])
    );

    useFocusEffect(useCallback(() => {
        if (!currentUser) {
            setWishlistIds(new Set());
            return () => {};
        }
        setLoadingWishlist(true);
        const unsubscribe = firestore()
            .collection('users')
            .doc(currentUser.uid)
            .collection('wishlist')
            .onSnapshot(snapshot => {
                const ids = new Set(snapshot.docs.map(doc => doc.id));
                setWishlistIds(ids);
                setLoadingWishlist(false);
            }, error => {
                console.error("[HomeScreen] Wishlist Listener Error:", error);
                setLoadingWishlist(false);
            });
        return () => unsubscribe();
    }, [currentUser]));

    // Filtering/Sorting logic
    useEffect(() => {
        let tempProcessed = [...products];
        if (searchQuery) {
            const lowerCaseQuery = searchQuery.toLowerCase();
            tempProcessed = tempProcessed.filter(p =>
                (p.name?.toLowerCase().includes(lowerCaseQuery)) ||
                (p.sellerDisplayName?.toLowerCase().includes(lowerCaseQuery))
            );
        }
        if (selectedCategoryFilter !== PRODUCT_CATEGORIES_WITH_ALL[0]) {
            tempProcessed = tempProcessed.filter(p => p.category === selectedCategoryFilter);
        }
        if (selectedConditionFilter !== PRODUCT_CONDITIONS_WITH_ALL[0]) {
            tempProcessed = tempProcessed.filter(p => p.condition === selectedConditionFilter);
        }
        if (appliedMinPrice !== null) tempProcessed = tempProcessed.filter(p => (p.price || 0) >= appliedMinPrice);
        if (appliedMaxPrice !== null) tempProcessed = tempProcessed.filter(p => (p.price || 0) <= appliedMaxPrice);
        
        if (selectedSortOption === "Newest First") tempProcessed.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
        else if (selectedSortOption === "Price: Low to High") tempProcessed.sort((a, b) => (a.price || 0) - (b.price || 0));
        else if (selectedSortOption === "Price: High to Low") tempProcessed.sort((a, b) => (b.price || 0) - (a.price || 0));
        
        setFilteredProducts(tempProcessed);
    }, [searchQuery, selectedCategoryFilter, selectedSortOption, selectedConditionFilter, products, appliedMinPrice, appliedMaxPrice]);

    // --- Handlers ---
    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        await getLocationAndFetchInitial();
        setIsRefreshing(false);
    }, [getLocationAndFetchInitial]);

    // 6. Update SignOut syntax
    const handleLogout = () => {
        Alert.alert("Log Out", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Log Out", style: "destructive",
                onPress: () => auth().signOut().catch(e => Alert.alert("Logout Failed", e.message))
            }
        ]);
    };
    
    // 7. Update Firestore write syntax
    const handleSaveItem = async (productId) => {
        if (!currentUser) { Toast.show({ type: 'error', text1: 'Login Required' }); return; }
        const wishlistItemRef = firestore().collection('users').doc(currentUser.uid).collection('wishlist').doc(productId);
        await wishlistItemRef.set({ savedAt: firestore.FieldValue.serverTimestamp() });
        Toast.show({ type: 'success', text1: 'Added to Wishlist!', position: 'bottom' });
    };

    const handleUnsaveItem = async (productId) => {
        if (!currentUser) return;
        const wishlistItemRef = firestore().collection('users').doc(currentUser.uid).collection('wishlist').doc(productId);
        await wishlistItemRef.delete();
        Toast.show({ type: 'info', text1: 'Removed from Wishlist', position: 'bottom' });
    };

    // --- Render Functions & Main UI ---
    const renderProductItem = ({ item }) => {
        if (!item?.id) return null;
        const isSaved = wishlistIds.has(item.id);
        return (
            <View style={styles.productItemContainer}>
                <TouchableOpacity style={styles.productItemTouchable} onPress={() => navigation.navigate('Details', { productId: item.id })}>
                    <Image source={{ uri: item.imageUrl || 'https://placehold.co/150x120/e0e0e0/7f7f7f?text=No+Image' }} style={styles.productImage} />
                    {item.isSold && <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>SOLD</Text></View>}
                    <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                    {typeof item.distanceKm === 'number' && <Text style={styles.distanceText}>~{item.distanceKm.toFixed(1)} km away</Text>}
                    <Text style={styles.productPrice}>{`$${item.price.toFixed(2)}`}</Text>
                </TouchableOpacity>
                {currentUser && !item.isSold && (
                    <TouchableOpacity style={styles.saveButton} onPress={() => isSaved ? handleUnsaveItem(item.id) : handleSaveItem(item.id)}>
                        <Ionicons name={isSaved ? "heart" : "heart-outline"} size={24} color={isSaved ? colors.error : colors.textSecondary} />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const styles = useMemo(() => themedStyles(colors, isDarkMode, unreadNotificationsCount), [colors, isDarkMode, unreadNotificationsCount]);

    if (loading) {
        return (
            <SafeAreaView style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primaryTeal} />
                <Text style={styles.loadingText}>Loading Products...</Text>
            </SafeAreaView>
        );
    }
    
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.navigate('ProfileTab')} style={styles.headerAvatarTouchable} disabled={!currentUser}>
                    {currentUser?.photoURL ? <Image source={{ uri: currentUser.photoURL }} style={styles.headerAvatar} /> : <View style={styles.headerAvatarPlaceholder}><Text style={styles.headerAvatarInitial}>{userInitial}</Text></View>}
                </TouchableOpacity>
                <Text style={styles.headerAppName}>yahdsell</Text>
                <View style={styles.headerRightContainer}>
                    {currentUser && <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.iconButton}><Ionicons name="notifications-outline" size={26} color={colors.textPrimary} />{unreadNotificationsCount > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadNotificationsCount}</Text></View>}</TouchableOpacity>}
                    {currentUser ? <TouchableOpacity onPress={handleLogout} style={[styles.iconButton, { marginLeft: 10 }]}><Ionicons name="log-out-outline" size={26} color={colors.error} /></TouchableOpacity> : <TouchableOpacity onPress={() => navigation.navigate('Login')}><Text style={styles.loginPrompt}>Log In</Text></TouchableOpacity>}
                </View>
            </View>

            <FlatList
                data={filteredProducts}
                renderItem={renderProductItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={styles.listContainer}
                ListHeaderComponent={
                    <>
                        <TextInput style={styles.searchBar} placeholder="Search..." value={searchQuery} onChangeText={setSearchQuery} />
                        {/* Add other filters here */}
                    </>
                }
                ListEmptyComponent={<Text style={styles.emptyText}>No products found.</Text>}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
                extraData={wishlistIds}
            />
            
            <TouchableOpacity style={styles.fab} onPress={() => currentUser ? navigation.navigate('SubmitItem') : Alert.alert("Login Required", "You must be logged in to list an item.")}>
                <Text style={styles.fabIcon}>+</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};

// --- Styles ---
const themedStyles = (colors, isDarkMode, unreadCount) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 10, color: colors.textPrimary },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
    headerAvatarTouchable: { padding: 4 },
    headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border },
    headerAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryGreen, justifyContent: 'center', alignItems: 'center' },
    headerAvatarInitial: { color: colors.textOnPrimary, fontSize: 16, fontWeight: 'bold' },
    headerAppName: { fontSize: 20, fontWeight: 'bold', color: colors.primaryTeal },
    headerRightContainer: { flexDirection: 'row', alignItems: 'center' },
    loginPrompt: { color: colors.primaryTeal, fontSize: 16 },
    iconButton: { padding: 6, position: 'relative' },
    notificationBadge: { position: 'absolute', right: 2, top: 2, backgroundColor: colors.error, borderRadius: 9, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
    notificationBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    searchBar: { margin: 10, padding: 10, borderRadius: 20, backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
    listContainer: { paddingHorizontal: 5 },
    productItemContainer: { flex: 1/2, margin: 5, backgroundColor: colors.surface, borderRadius: 8, overflow: 'hidden' },
    productItemTouchable: { padding: 10 },
    productImage: { width: '100%', height: 120, borderRadius: 4 },
    productName: { marginTop: 8, fontWeight: 'bold', color: colors.textPrimary },
    distanceText: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
    productPrice: { marginTop: 4, color: colors.primaryGreen, fontWeight: 'bold' },
    soldBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 4 },
    soldBadgeText: { color: 'white', fontSize: 10 },
    saveButton: { position: 'absolute', top: 8, right: 8, padding: 6, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 15 },
    emptyText: { textAlign: 'center', marginTop: 50, color: colors.textSecondary },
    fab: { position: 'absolute', right: 25, bottom: 35, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primaryTeal, justifyContent: 'center', alignItems: 'center', elevation: 8 },
    fabIcon: { fontSize: 30, color: 'white' }
});

export default HomeScreen;
