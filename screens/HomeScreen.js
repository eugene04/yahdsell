// screens/HomeScreen.js (With Notification Bell & Unread Count)

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection,
    onSnapshot, // Keep for products if still used, or for notifications
    query, // For notifications query
    where
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert, Animated,
    FlatList,
    Image,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput, TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message'; // Import Toast
import { app, auth, firestore } from '../firebaseConfig';
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

const functions = getFunctions(app);
const getRankedProductsFunc = httpsCallable(functions, 'getRankedProducts');

const HomeScreen = () => {
    console.log("[HomeScreen] Component Mounting / Re-rendering (Build Debug)...");
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();

    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [currentUser, setCurrentUser] = useState(() => auth.currentUser);
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

    // --- NEW: State for unread notifications count ---
    const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            const previousUserIsNull = !currentUser;
            setCurrentUser(user);
            if (user) {
                const name = user.displayName;
                const email = user.email;
                if (name) { setUserInitial(name.charAt(0).toUpperCase()); }
                else if (email) { setUserInitial(email.charAt(0).toUpperCase()); }
                else { setUserInitial('?'); }

                if (previousUserIsNull && initialLoadAttempted) {
                    const welcomeText = `Welcome ${name || email || 'Back'}!`;
                    setWelcomeMessage(welcomeText);
                    setShowWelcomePopup(true);
                }
            } else {
                setUserInitial('');
                setWishlistIds(new Set());
                setUnreadNotificationsCount(0); // Reset count on logout
            }
        });
        return unsubscribe;
    }, [initialLoadAttempted, currentUser]);

    // Welcome Popup Animation
    useEffect(() => {
        if (showWelcomePopup) {
            if (popupTimeoutRef.current) { clearTimeout(popupTimeoutRef.current); }
            popupOpacity.setValue(0);
            Animated.timing(popupOpacity, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }).start(() => {
                popupTimeoutRef.current = setTimeout(() => {
                    Animated.timing(popupOpacity, {
                        toValue: 0,
                        duration: 500,
                        useNativeDriver: true,
                    }).start(() => setShowWelcomePopup(false));
                }, 2500);
            });
        }
        return () => {
            if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
        };
    }, [showWelcomePopup, popupOpacity]);

    const fetchRankedProducts = useCallback(async (currentLocation = null, isRefresh = false) => {
        console.log(`[HomeScreen fetchRankedProducts] Called. isRefresh: ${isRefresh}`);
        const locationData = currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : {};
        if (!isRefresh) setLoading(true);
        else setIsRefreshing(true);
        try {
            console.log(`[HomeScreen fetchRankedProducts] Calling Firebase Function 'getRankedProducts'`);
            const result = await getRankedProductsFunc(locationData);
            if (result && result.data && Array.isArray(result.data.products)) {
                console.log("[HomeScreen fetchRankedProducts] Received products count:", result.data.products.length);
                setProducts(result.data.products);
                setError(null);
            } else {
                console.error("[HomeScreen fetchRankedProducts] Invalid response format:", result);
                throw new Error("Products data format error.");
            }
        } catch (err) {
            console.error("[HomeScreen fetchRankedProducts] CRITICAL ERROR:", err.message, err.code, err.details, err);
            setError(`Failed to load products: ${err.message}. Pull to refresh.`);
            setProducts([]);
        } finally {
            if (!isRefresh) {
                setLoading(false);
                setInitialLoadAttempted(true);
            } else {
                setIsRefreshing(false);
            }
        }
    }, []);

    const getLocationAndFetchInitial = useCallback(async () => {
        console.log("[HomeScreen getLocationAndFetchInitial] Called.");
        setIsFetchingInitialLocation(true);
        setError(null);
        let fetchedLocation = null;
        try {
            console.log("[HomeScreen getLocationAndFetchInitial] Requesting location permissions...");
            let { status } = await Location.requestForegroundPermissionsAsync();
            console.log("[HomeScreen getLocationAndFetchInitial] Location permission status:", status);
            if (status !== 'granted') {
                console.warn("[HomeScreen getLocationAndFetchInitial] Location permission denied.");
                setError("Location permission denied. Product ranking by distance will be affected.");
            } else {
                console.log("[HomeScreen getLocationAndFetchInitial] Getting location...");
                let location = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (location?.coords) {
                    fetchedLocation = location.coords;
                    setBuyerLocation(fetchedLocation);
                    console.log("[HomeScreen getLocationAndFetchInitial] Location fetched:", JSON.stringify(fetchedLocation).substring(0,100));
                } else {
                    console.warn("[HomeScreen getLocationAndFetchInitial] Could not get location fix.");
                    setError("Could not determine location. Products will be shown without distance ranking.");
                }
            }
        } catch (err) {
            console.error("[HomeScreen getLocationAndFetchInitial] CRITICAL ERROR:", err);
            setError(`Location Error: ${err.message}. Products will be shown without distance ranking.`);
        } finally {
            console.log("[HomeScreen getLocationAndFetchInitial] Finally block. Calling fetchRankedProducts.");
            await fetchRankedProducts(fetchedLocation, false);
            setIsFetchingInitialLocation(false);
            console.log("[HomeScreen getLocationAndFetchInitial] Finished.");
        }
    }, [fetchRankedProducts]);

    useEffect(() => {
        if (!initialLoadAttempted && !isFetchingInitialLocation) {
            getLocationAndFetchInitial();
        }
    }, [initialLoadAttempted, isFetchingInitialLocation, getLocationAndFetchInitial]);

    // --- Listener for Unread Notifications Count ---
    useFocusEffect(
        useCallback(() => {
            if (!currentUser || !firestore) {
                setUnreadNotificationsCount(0);
                return;
            }
            console.log(`[HomeScreen] Setting up notifications listener for user: ${currentUser.uid}`);
            const notificationsRef = collection(firestore, 'users', currentUser.uid, 'notifications');
            const q_unread = query(notificationsRef, where('isRead', '==', false));

            const unsubscribeNotifications = onSnapshot(q_unread, (snapshot) => {
                console.log(`[HomeScreen] Unread notifications snapshot size: ${snapshot.size}`);
                setUnreadNotificationsCount(snapshot.size);
            }, (error) => {
                console.error("[HomeScreen] Error fetching unread notifications count:", error);
                setError(prev => prev ? `${prev}\nCould not load notification count.` : "Could not load notification count.");
                setUnreadNotificationsCount(0);
            });

            return () => {
                console.log("[HomeScreen] Cleaning up notifications listener.");
                unsubscribeNotifications();
            };
        }, [currentUser]) // Re-run if currentUser changes
    );


    useFocusEffect(useCallback(() => {
        let unsubscribeWishlist = () => {};
        if (currentUser) {
            setLoadingWishlist(true);
            const wishlistRef = collection(firestore, 'users', currentUser.uid, 'wishlist');
            unsubscribeWishlist = onSnapshot(wishlistRef, (snapshot) => {
                const ids = new Set();
                snapshot.forEach((doc) => ids.add(doc.id));
                setWishlistIds(ids);
                setLoadingWishlist(false);
            }, (error) => {
                console.error("[HomeScreen Wishlist Listener] Error fetching wishlist:", error);
                setError(prev => prev ? `${prev}\nCould not load wishlist.` : "Could not load wishlist status.");
                setLoadingWishlist(false);
            });
        } else {
            setWishlistIds(new Set());
            setLoadingWishlist(false);
        }
        return () => unsubscribeWishlist();
    }, [currentUser])); // Added currentUser dependency

    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        setError(null);
        await getLocationAndFetchInitial();
    }, [getLocationAndFetchInitial]);

    useEffect(() => {
        let tempProcessed = [...products];
        if (searchQuery) {
            const lowerCaseQuery = searchQuery.toLowerCase();
            tempProcessed = tempProcessed.filter(product =>
                (product.name && product.name.toLowerCase().includes(lowerCaseQuery)) ||
                (product.sellerDisplayName && product.sellerDisplayName.toLowerCase().includes(lowerCaseQuery)) ||
                (product.description && product.description.toLowerCase().includes(lowerCaseQuery))
            );
        }
        if (selectedCategoryFilter && selectedCategoryFilter !== PRODUCT_CATEGORIES_WITH_ALL[0]) {
            tempProcessed = tempProcessed.filter(product =>
                product.category && product.category.toLowerCase() === selectedCategoryFilter.toLowerCase()
            );
        }
        if (selectedConditionFilter && selectedConditionFilter !== PRODUCT_CONDITIONS_WITH_ALL[0]) {
            tempProcessed = tempProcessed.filter(product =>
                product.condition && product.condition.toLowerCase() === selectedConditionFilter.toLowerCase()
            );
        }
        if (appliedMinPrice !== null) {
            tempProcessed = tempProcessed.filter(product => (product.price || 0) >= appliedMinPrice);
        }
        if (appliedMaxPrice !== null) {
            tempProcessed = tempProcessed.filter(product => (product.price || 0) <= appliedMaxPrice);
        }
        if (selectedSortOption === "Newest First") {
            tempProcessed.sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0));
        } else if (selectedSortOption === "Price: Low to High") {
            tempProcessed.sort((a, b) => (a.price || 0) - (b.price || 0));
        } else if (selectedSortOption === "Price: High to Low") {
            tempProcessed.sort((a, b) => (b.price || 0) - (a.price || 0));
        }
        setFilteredProducts(tempProcessed);
    }, [searchQuery, selectedCategoryFilter, selectedSortOption, selectedConditionFilter, products, appliedMinPrice, appliedMaxPrice]);

    const handleAddItemPress = () => {
        if (currentUser) navigation.navigate('SubmitItem');
        else Alert.alert("Login Required", "Log in to list an item.", [{ text: "Cancel" }, { text: "Log In", onPress: () => navigation.navigate('Login') }]);
    };
    const handleLogout = () => {
        Alert.alert("Log Out", "Are you sure you want to log out?",
            [{ text: "Cancel", style: "cancel" }, { text: "Log Out", style: "destructive", onPress: async () => {
                try {
                    await signOut(auth);
                    setInitialLoadAttempted(false);
                    setIsFetchingInitialLocation(false);
                    setProducts([]);
                    setFilteredProducts([]);
                    setBuyerLocation(null);
                    setError(null);
                    // currentUser state will update via onAuthStateChanged, triggering re-render
                } catch (e) {
                    Alert.alert("Logout Failed", e.message);
                }
            } }],
            { cancelable: true }
        );
    };

    const handleSaveItem = async (productId) => {
        if (!currentUser) { Toast.show({ type: 'error', text1: 'Login Required', text2: 'Please log in to save items.' }); return; }
        if (!productId) return;
        const wishlistItemRef = doc(firestore, 'users', currentUser.uid, 'wishlist', productId);
        try {
            await setDoc(wishlistItemRef, { savedAt: serverTimestamp() });
            Toast.show({ type: 'success', text1: 'Added to Wishlist!', position: 'bottom' });
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error Saving Item', text2: error.message });
        }
    };
    const handleUnsaveItem = async (productId) => {
        if (!currentUser || !productId) return;
        const wishlistItemRef = doc(firestore, 'users', currentUser.uid, 'wishlist', productId);
        try {
            await deleteDoc(wishlistItemRef);
            Toast.show({ type: 'info', text1: 'Removed from Wishlist', position: 'bottom' });
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error Removing Item', text2: error.message });
        }
    };

    const handleSelectCategoryFilter = (selectedCategory) => { setSelectedCategoryFilter(selectedCategory); setCategoryFilterModalVisible(false); };
    const handleSelectSortOption = (sortOption) => { setSelectedSortOption(sortOption); setSortModalVisible(false); };
    const handleSelectConditionFilter = (condition) => { setSelectedConditionFilter(condition); setConditionModalVisible(false); };
    const navigateToProfile = () => { navigation.navigate('ProfileTab'); }; // Assumes ProfileTab is the route name for UserProfileScreen in tabs

    const handleApplyPriceFilter = () => {
        const min = parseFloat(minPriceInput);
        const max = parseFloat(maxPriceInput);
        setAppliedMinPrice(isNaN(min) || min < 0 ? null : min);
        setAppliedMaxPrice(isNaN(max) || max < 0 ? null : max);
        Toast.show({ type: 'info', text1: 'Price filter applied!', position: 'bottom', visibilityTime: 1500 });
    };
    const handleClearPriceFilter = () => {
        setMinPriceInput(''); setMaxPriceInput('');
        setAppliedMinPrice(null); setAppliedMaxPrice(null);
        Toast.show({ type: 'info', text1: 'Price filter cleared.', position: 'bottom', visibilityTime: 1500 });
    };

    // --- NEW: Navigate to Notifications Screen ---
    const handleNotificationsPress = () => {
        if (currentUser) {
            navigation.navigate('Notifications'); // We will create this screen next
        } else {
            Alert.alert("Login Required", "Log in to view notifications.", [{ text: "Cancel" }, { text: "Log In", onPress: () => navigation.navigate('Login') }]);
        }
    };


    const renderProductItem = ({ item }) => {
        try {
            if (!item || typeof item.id === 'undefined') {
                console.warn("[HomeScreen renderProductItem] Invalid item data for FlatList:", item);
                return <View style={styles.productItemContainer}><Text style={{color: colors?.error || 'red'}}>Item data error</Text></View>;
            }
            const isSaved = wishlistIds.has(item.id);
            return (
                <View style={[styles.productItemContainer, item.isSold && styles.soldProductContainer]}>
                    <TouchableOpacity
                        style={styles.productItemTouchable}
                        onPress={() => navigation.navigate('Details', { productId: item.id })}
                        disabled={item.isSold}
                    >
                        <Image
                            source={{ uri: item.imageUrl || 'https://placehold.co/150x120/e0e0e0/7f7f7f?text=No+Image' }}
                            style={[styles.productImage, item.isSold && styles.soldProductImage]}
                            resizeMode="cover"
                            onError={(e) => console.warn(`[IMG_LOAD_ERR] ${item.imageUrl}:`, e.nativeEvent.error)}
                        />
                        {item.isSold && (<View style={styles.soldBadge}><Text style={styles.soldBadgeText}>SOLD</Text></View>)}
                        <Text style={styles.productName} numberOfLines={2}>{item.name || 'Unnamed Product'}</Text>
                        <View style={styles.sellerContainer}>
                            <Text style={styles.sellerName} numberOfLines={1}>By: {item.sellerDisplayName || 'Unknown Seller'}</Text>
                            {typeof item.distanceKm === 'number' && buyerLocation && (
                                <Text style={styles.distanceText}>~{item.distanceKm.toFixed(1)} km away</Text>
                            )}
                        </View>
                        <Text style={styles.productPrice}>{typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : 'Price N/A'}</Text>
                        {item.condition && <Text style={styles.productCondition}>{item.condition}</Text>}
                    </TouchableOpacity>
                    {currentUser && !item.isSold && (
                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={() => isSaved ? handleUnsaveItem(item.id) : handleSaveItem(item.id)}
                            disabled={loadingWishlist}
                        >
                            {loadingWishlist && wishlistIds.has(item.id) === isSaved ?
                                <ActivityIndicator size="small" color={colors?.primaryTeal} /> :
                                <Ionicons name={isSaved ? "heart" : "heart-outline"} size={24} color={isSaved ? colors?.error : colors?.textSecondary} />
                            }
                        </TouchableOpacity>
                    )}
                </View>
            );
        } catch (renderItemError) {
            console.error("[HomeScreen renderProductItem] CRITICAL ERROR rendering item ID:", item?.id, renderItemError);
            return <View style={styles.productItemContainer}><Text style={{color: colors?.error || 'red'}}>Display Error</Text></View>;
        }
    };

    const styles = useMemo(() => themedStyles(colors, isDarkMode, unreadNotificationsCount), [colors, isDarkMode, unreadNotificationsCount]); // Add unreadNotificationsCount

    if (error && !loading && (!initialLoadAttempted || products.length === 0) ) {
        console.log("[HomeScreen Render] Displaying CRITICAL ERROR message:", error);
        return (
            <SafeAreaView style={styles.centered}>
                 <Ionicons name="alert-circle-outline" size={60} color={colors?.error || 'red'} />
                <Text style={styles.errorTitleText}>An Error Occurred</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={onRefresh} style={styles.tryAgainButton}>
                    <Text style={styles.tryAgainButtonText}>Try Again</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    if (loading && !initialLoadAttempted) {
        return (
            <SafeAreaView style={styles.centered}>
                <ActivityIndicator size="large" color={colors?.primaryTeal} />
                <Text style={styles.loadingText}>Loading Products...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <View style={styles.header}>
                <View style={styles.headerLeftContainer}>
                    {currentUser && (
                        <TouchableOpacity onPress={navigateToProfile} style={styles.headerAvatarTouchable}>
                            {currentUser.photoURL ? (
                                <Image source={{ uri: currentUser.photoURL }} style={styles.headerAvatar} />
                            ) : (
                                <View style={styles.headerAvatarPlaceholder}>
                                    <Text style={styles.headerAvatarInitial}>{userInitial || '?'}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.headerCenterContainer}>
                    {currentUser ? (
                        <Text style={styles.headerAppName}>yahdsell</Text>
                    ) : (
                        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                            <Text style={styles.loginPrompt}>Log In / Sign Up</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.headerRightContainer}>
                    {/* --- Notification Bell --- */}
                    {currentUser && (
                        <TouchableOpacity onPress={handleNotificationsPress} style={styles.iconButton}>
                            <Ionicons name="notifications-outline" size={26} color={colors?.textPrimary} />
                            {unreadNotificationsCount > 0 && (
                                <View style={styles.notificationBadge}>
                                    <Text style={styles.notificationBadgeText}>
                                        {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                    {currentUser ? ( <TouchableOpacity onPress={handleLogout} style={[styles.iconButton, { marginLeft: 10 }]}><Ionicons name="log-out-outline" size={26} color={colors?.error} /></TouchableOpacity> ) : ( <View style={{ width: 40 }} /> )}
                </View>
            </View>

            <View style={styles.searchFilterSortContainer}>
                <TextInput
                    style={styles.searchBar}
                    placeholder="Search products, sellers..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholderTextColor={colors?.textSecondary}
                    clearButtonMode="while-editing"
                />
                 <TouchableOpacity
                    style={styles.filterSortButton}
                    onPress={() => setSortModalVisible(true)}
                >
                    <Ionicons name="swap-vertical-outline" size={18} color={colors?.primaryTeal} />
                    <Text style={styles.filterSortButtonText} numberOfLines={1}>
                        {selectedSortOption === SORT_OPTIONS[0] ? 'Sort' : selectedSortOption.split(':')[0]}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.filterButtonsRow}>
                <TouchableOpacity
                    style={styles.filterChipButton}
                    onPress={() => setCategoryFilterModalVisible(true)}
                >
                    <Ionicons name="filter-outline" size={16} color={colors?.primaryTeal} style={{marginRight: 4}} />
                    <Text style={styles.filterChipButtonText} numberOfLines={1}>
                        {selectedCategoryFilter === PRODUCT_CATEGORIES_WITH_ALL[0] ? 'Category' : selectedCategoryFilter}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.filterChipButton}
                    onPress={() => setConditionModalVisible(true)}
                >
                    <Ionicons name="shield-checkmark-outline" size={16} color={colors?.primaryTeal} style={{marginRight: 4}}/>
                    <Text style={styles.filterChipButtonText} numberOfLines={1}>
                        {selectedConditionFilter === PRODUCT_CONDITIONS_WITH_ALL[0] ? 'Condition' : selectedConditionFilter}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.priceFilterContainer}>
                <TextInput
                    style={[styles.priceInput, {marginRight: 5}]}
                    placeholder="Min Price"
                    keyboardType="numeric"
                    value={minPriceInput}
                    onChangeText={setMinPriceInput}
                    placeholderTextColor={colors?.textSecondary}
                />
                <TextInput
                    style={[styles.priceInput, {marginLeft: 5}]}
                    placeholder="Max Price"
                    keyboardType="numeric"
                    value={maxPriceInput}
                    onChangeText={setMaxPriceInput}
                    placeholderTextColor={colors?.textSecondary}
                />
                <TouchableOpacity style={styles.priceApplyButton} onPress={handleApplyPriceFilter}>
                    <Text style={styles.priceApplyButtonText}>Apply</Text>
                </TouchableOpacity>
                {(appliedMinPrice !== null || appliedMaxPrice !== null) && (
                    <TouchableOpacity onPress={handleClearPriceFilter} style={styles.priceClearButton}>
                        <Ionicons name="close-circle-outline" size={22} color={colors?.textSecondary} />
                    </TouchableOpacity>
                )}
            </View>

            {error && products.length > 0 && <Text style={styles.inlineErrorText}>{error}</Text>}

            <FlatList
                data={filteredProducts}
                renderItem={renderProductItem}
                keyExtractor={(item, index) => item?.id || `product-item-${index}`}
                numColumns={2}
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={
                    !loading && !error ? (
                        <View style={styles.centered}>
                            <Ionicons name="storefront-outline" size={60} color={colors?.textDisabled} />
                            <Text style={styles.emptyText}>
                                {products.length === 0 ? "No products available right now. Pull to refresh." :
                                 "No products match your current filters."}
                            </Text>
                            {products.length === 0 &&
                                <TouchableOpacity onPress={onRefresh} style={styles.tryAgainButton}>
                                    <Text style={styles.tryAgainButtonText}>Refresh</Text>
                                </TouchableOpacity>
                            }
                        </View>
                    ) : null
                }
                refreshControl={ <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors?.primaryTeal} colors={[colors?.primaryTeal || '#007bff']} /> }
                extraData={{wishlistIds, loadingWishlist, currentUser, appliedMinPrice, appliedMaxPrice, selectedCategoryFilter, selectedConditionFilter, selectedSortOption, unreadNotificationsCount}}
            />

            <TouchableOpacity style={styles.fab} onPress={handleAddItemPress} activeOpacity={0.7} >
                <Text style={styles.fabIcon}>+</Text>
            </TouchableOpacity>

            {showWelcomePopup && ( <Animated.View style={[styles.welcomePopup, { opacity: popupOpacity }]}><Text style={styles.welcomePopupText}>{welcomeMessage}</Text></Animated.View> )}

            {/* Modals */}
            <Modal transparent={true} visible={isCategoryFilterModalVisible} animationType="fade" onRequestClose={() => setCategoryFilterModalVisible(false)}>
                 <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setCategoryFilterModalVisible(false)} >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Filter by Category</Text>
                        <FlatList data={PRODUCT_CATEGORIES_WITH_ALL} keyExtractor={(item) => item} renderItem={({ item }) => ( <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectCategoryFilter(item)} > <Text style={[ styles.modalItemText, item === selectedCategoryFilter && styles.modalItemSelectedText ]}>{item}</Text> </TouchableOpacity> )} style={styles.modalList} />
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCategoryFilterModalVisible(false)} ><Text style={styles.modalCloseButtonText}>Close</Text></TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
            <Modal transparent={true} visible={isSortModalVisible} animationType="fade" onRequestClose={() => setSortModalVisible(false)}>
                 <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setSortModalVisible(false)} >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Sort Products By</Text>
                        <FlatList data={SORT_OPTIONS} keyExtractor={(item) => item} renderItem={({ item }) => ( <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectSortOption(item)} > <Text style={[ styles.modalItemText, item === selectedSortOption && styles.modalItemSelectedText ]}>{item}</Text> </TouchableOpacity> )} style={styles.modalList} />
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSortModalVisible(false)} ><Text style={styles.modalCloseButtonText}>Close</Text></TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
            <Modal transparent={true} visible={isConditionModalVisible} animationType="fade" onRequestClose={() => setConditionModalVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setConditionModalVisible(false)}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Filter by Condition</Text>
                        <FlatList data={PRODUCT_CONDITIONS_WITH_ALL} keyExtractor={(item) => item} renderItem={({ item }) => ( <TouchableOpacity style={styles.modalItem} onPress={() => handleSelectConditionFilter(item)}> <Text style={[styles.modalItemText, item === selectedConditionFilter && styles.modalItemSelectedText]}>{item}</Text> </TouchableOpacity> )} style={styles.modalList} />
                        <TouchableOpacity style={styles.modalCloseButton} onPress={() => setConditionModalVisible(false)}><Text style={styles.modalCloseButtonText}>Close</Text></TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
};

const themedStyles = (colors, isDarkMode, unreadCount) => StyleSheet.create({ // Added unreadCount to styles
    container: { flex: 1, backgroundColor: colors?.background || '#fff' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors?.background || '#fff' },
    loadingText: { marginTop: 15, fontSize: 16, color: colors?.textSecondary || '#555', },
    errorTitleText: { fontSize: 20, fontWeight: 'bold', color: colors?.textPrimary || '#000', marginBottom: 10, marginTop:15, textAlign: 'center'},
    errorText: { color: colors?.error || 'red', fontSize: 16, textAlign: 'center', paddingHorizontal: 20, marginBottom: 15, },
    inlineErrorText: { color: colors?.error || 'red', fontSize: 14, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 15, backgroundColor: isDarkMode ? 'rgba(239, 83, 80, 0.2)' : 'rgba(239, 83, 80, 0.1)', borderTopWidth:1, borderBottomWidth: 1, borderColor: colors?.errorMuted || colors?.error || 'red' },
    tryAgainButton: { backgroundColor: colors?.primaryTeal || '#007bff', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, marginTop: 20, },
    tryAgainButtonText: { color: colors?.textOnPrimary || '#ffffff', fontSize: 16, fontWeight: 'bold', },
    emptyText: { textAlign: 'center', marginTop: 20, fontSize: 16, color: colors?.textSecondary || '#555', paddingHorizontal: 20 },

    header: {
        paddingHorizontal: 15,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 5 : (StatusBar.currentHeight || 0) + 15,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: colors?.border,
        backgroundColor: colors?.surface,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDarkMode ? 0.2 : 0.08,
        shadowRadius: 2,
        elevation: 3,
    },
    headerLeftContainer: { minWidth: 50, alignItems: 'flex-start', justifyContent: 'center' }, // minWidth to balance
    headerCenterContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerRightContainer: { minWidth: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }, // Increased width for bell + logout
    headerAvatarTouchable: { padding: 4, },
    headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors?.border, },
    headerAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors?.primaryGreen, justifyContent: 'center', alignItems: 'center', },
    headerAvatarInitial: { color: colors?.textOnPrimary, fontSize: 16, fontWeight: 'bold', },
    headerAppName: { fontSize: 20, fontWeight: 'bold', color: colors?.primaryTeal, },
    loginPrompt: { fontSize: 16, color: colors?.primaryTeal, textDecorationLine: 'underline', fontWeight: '500' },
    iconButton: { padding: 6, position: 'relative' }, // Added position relative for badge

    // --- Notification Badge Styles ---
    notificationBadge: {
        position: 'absolute',
        right: 0,
        top: 0,
        backgroundColor: colors?.error || 'red',
        borderRadius: 9,
        width: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors?.surface || '#fff', // To make it pop
    },
    notificationBadgeText: {
        color: colors?.textOnPrimary || '#ffffff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    // --- End Notification Badge Styles ---

    searchFilterSortContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, alignItems: 'center', backgroundColor: colors?.surface, borderBottomWidth: 1, borderBottomColor: colors?.border, },
    searchBar: { flex: 1, height: 40, borderColor: colors?.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 15, backgroundColor: colors?.background, fontSize: 15, color: colors?.textPrimary, marginRight: 8, },
    filterSortButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors?.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors?.border, height: 40, marginLeft: 5, },
    filterSortButtonText: { color: colors?.primaryTeal, marginLeft: 4, fontSize: 13, fontWeight: '500', },

    filterButtonsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors?.surface, borderBottomWidth: 1, borderBottomColor: colors?.border, },
    filterChipButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors?.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors?.border, marginHorizontal: 3, },
    filterChipButtonText: { color: colors?.primaryTeal, fontSize: 13, fontWeight: '500', },

    priceFilterContainer: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: colors?.surface, borderBottomWidth: 1, borderBottomColor: colors?.border, alignItems: 'center', },
    priceInput: { flex: 1, height: 38, borderColor: colors?.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, backgroundColor: colors?.background, fontSize: 14, color: colors?.textPrimary, },
    priceApplyButton: { backgroundColor: colors?.primaryTeal, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginLeft: 10, height: 38, justifyContent: 'center', },
    priceApplyButtonText: { color: colors?.textOnPrimary || '#ffffff', fontWeight: 'bold', fontSize: 14, },
    priceClearButton: { padding: 5, marginLeft: 8, justifyContent: 'center', alignItems: 'center', },

    listContainer: { paddingHorizontal: 5, paddingBottom: 100, },
    productItemContainer: { flex: 1 / 2, margin: 5, backgroundColor: colors?.surface, borderRadius: 8, shadowColor: isDarkMode ? '#444' : '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDarkMode ? 0.3 : 0.15, shadowRadius: 2.5, elevation: 2, minHeight: 230, position: 'relative' },
    soldProductContainer: { opacity: 0.6, },
    soldProductImage: { /* Optional: styles for sold image */ },
    soldBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: colors?.error, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, zIndex: 1, },
    soldBadgeText: { color: colors?.textOnPrimary || '#ffffff', fontSize: 10, fontWeight: 'bold', },
    productItemTouchable: { padding: 10, alignItems: 'center', flex: 1, justifyContent: 'space-between' },
    productImage: { width: '100%', height: 120, borderRadius: 4, marginBottom: 8, backgroundColor: colors?.border },
    productName: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 4, color: colors?.textPrimary, minHeight: 34, },
    sellerContainer: { flexDirection: 'column', alignItems: 'center', marginBottom: 6, width: '100%', },
    sellerName: { fontSize: 12, color: colors?.textSecondary, textAlign: 'center', marginBottom: 2, },
    distanceText: { fontSize: 11, color: colors?.textSecondary, fontStyle: 'italic', marginTop: 3, },
    productPrice: { fontSize: 14, color: colors?.primaryGreen || colors?.textPrimary, fontWeight: 'bold', marginTop: 'auto', },
    productCondition: { fontSize: 11, color: colors?.textDisabled, fontStyle: 'italic', textAlign: 'center', marginTop: 3, marginBottom: 2 },
    saveButton: { position: 'absolute', top: 5, right: 5, zIndex: 1, padding: 6, backgroundColor: isDarkMode ? 'rgba(30, 30, 30, 0.6)' : 'rgba(255, 255, 255, 0.7)', borderRadius: 15, },

    fab: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: colors?.primaryTeal, justifyContent: 'center', alignItems: 'center', right: 25, bottom: 35, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, zIndex: 10 },
    fabIcon: { fontSize: 30, color: colors?.textOnPrimary, includeFontPadding: false, textAlignVertical: 'center', lineHeight: 34,},

    welcomePopup: { position: 'absolute', top: Platform.OS === 'android' ? StatusBar.currentHeight + 70 : (StatusBar.currentHeight || 0) + 80, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.8)', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', zIndex: 100, },
    welcomePopupText: { color: '#ffffff', fontSize: 16, textAlign: 'center', },

    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors?.backdrop || 'rgba(0, 0, 0, 0.6)', },
    modalContent: { backgroundColor: colors?.surface, borderRadius: 10, paddingTop: 20, paddingBottom: 10, paddingHorizontal: 0, width: '85%', maxHeight: '70%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, alignItems: 'center', },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: colors?.textPrimary, paddingHorizontal: 20 },
    modalList: { width: '100%', marginBottom: 10, },
    modalItem: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors?.border, },
    modalItemText: { fontSize: 16, color: colors?.textPrimary, textAlign: 'center', },
    modalItemSelectedText: { fontWeight: 'bold', color: colors?.primaryTeal, },
    modalCloseButton: { paddingVertical: 12, alignItems: 'center', width: '100%', borderTopWidth: 1, borderTopColor: colors?.border, marginTop: 5},
    modalCloseButtonText: { fontSize: 16, color: colors?.primaryTeal, fontWeight: '600', },
});

export default HomeScreen;
