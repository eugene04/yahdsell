// screens/HomeScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
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

// Use the correct, modern @react-native-firebase modules
import { auth, firestore, functions } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Constants ---
const PRODUCT_CATEGORIES_WITH_ALL = [ "All Categories", "Electronics", "Clothing & Apparel", "Home & Garden", "Furniture", "Vehicles", "Books, Movies & Music", "Collectibles & Art", "Sports & Outdoors", "Toys & Hobbies", "Baby & Kids", "Health & Beauty", "Other" ];
const SORT_OPTIONS = [ "Recommended", "Newest First", "Price: Low to High", "Price: High to Low" ];
const PRODUCT_CONDITIONS_WITH_ALL = [ "Any Condition", "New", "Used - Like New", "Used - Good", "Used - Fair" ];

// --- Firebase Functions Reference ---
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
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  
  // --- UI & Filter State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState(PRODUCT_CATEGORIES_WITH_ALL[0]);
  const [selectedSortOption, setSelectedSortOption] = useState(SORT_OPTIONS[0]);
  const [selectedConditionFilter, setSelectedConditionFilter] = useState(PRODUCT_CONDITIONS_WITH_ALL[0]);
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [appliedMinPrice, setAppliedMinPrice] = useState(null);
  const [appliedMaxPrice, setAppliedMaxPrice] = useState(null);
  const [isCategoryFilterModalVisible, setCategoryFilterModalVisible] = useState(false);
  const [isSortModalVisible, setSortModalVisible] = useState(false);
  const [isConditionModalVisible, setConditionModalVisible] = useState(false);
  
  // --- Welcome Popup State ---
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const popupTimeoutRef = useRef(null);

  // --- Login Gate Helper ---
  const requireLogin = (actionName) => {
      if (!currentUser) {
          Alert.alert(
              "Login Required",
              `You must be logged in to ${actionName}.`,
              [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Log In', onPress: () => navigation.navigate('Login') },
              ]
          );
          return false;
      }
      return true;
  };

  // --- Auth State Listener ---
  useEffect(() => {
    const subscriber = auth().onAuthStateChanged((user) => {
      const wasPreviouslyLoggedOut = !currentUser;
      setCurrentUser(user);
      if (user) {
        const name = user.displayName;
        const email = user.email;
        if (name) setUserInitial(name.charAt(0).toUpperCase());
        else if (email) setUserInitial(email.charAt(0).toUpperCase());
        else setUserInitial('?');

        if (wasPreviouslyLoggedOut) {
          setShowWelcomePopup(true);
        }
      } else {
        setUserInitial('');
        setWishlistIds(new Set());
        setUnreadNotificationsCount(0);
      }
    });
    return subscriber;
  }, [currentUser]);

  // --- Welcome Popup Animation ---
  useEffect(() => {
    if (showWelcomePopup) {
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
      popupOpacity.setValue(0);
      Animated.timing(popupOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start(() => {
        popupTimeoutRef.current = setTimeout(() => {
          Animated.timing(popupOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => setShowWelcomePopup(false));
        }, 2500);
      });
    }
    return () => { if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current); };
  }, [showWelcomePopup, popupOpacity]);

  // --- Data Fetching ---
  const fetchRankedProducts = useCallback(async (currentLocation = null) => {
    const locationData = currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : {};
    try {
      const result = await getRankedProductsFunc(locationData);
      if (result?.data?.products) {
        setProducts(result.data.products);
        setError(null);
      } else {
        throw new Error("Invalid product data format from server.");
      }
    } catch (err) {
      console.error("[HomeScreen] Error fetching ranked products:", err);
      setError("Could not load products. Please try again.");
      setProducts([]);
    }
  }, []);

  const getLocationAndFetchInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    let fetchedLocation = null;
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let location = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        fetchedLocation = location?.coords;
      }
    } catch (err) {
      console.warn("[HomeScreen] Location Error:", err.message);
    } finally {
      await fetchRankedProducts(fetchedLocation);
      setLoading(false);
    }
  }, [fetchRankedProducts]);

  useEffect(() => {
    getLocationAndFetchInitial();
  }, [getLocationAndFetchInitial]);

  // --- Real-time Listeners ---
  useFocusEffect(
    useCallback(() => {
      if (!currentUser) return;
      const notificationsQuery = firestore().collection('users').doc(currentUser.uid).collection('notifications').where('isRead', '==', false);
      const unsubscribeNotifications = notificationsQuery.onSnapshot(snapshot => setUnreadNotificationsCount(snapshot.size));
      
      const wishlistQuery = firestore().collection('users').doc(currentUser.uid).collection('wishlist');
      const unsubscribeWishlist = wishlistQuery.onSnapshot(snapshot => setWishlistIds(new Set(snapshot.docs.map(doc => doc.id))));

      return () => {
        unsubscribeNotifications();
        unsubscribeWishlist();
      };
    }, [currentUser])
  );

  // --- Filtering & Sorting Logic ---
  useEffect(() => {
    let tempProcessed = [...products];
    if (searchQuery) {
      const lowerCaseQuery = searchQuery.toLowerCase();
      tempProcessed = tempProcessed.filter(p => p.name?.toLowerCase().includes(lowerCaseQuery) || p.sellerDisplayName?.toLowerCase().includes(lowerCaseQuery));
    }
    if (selectedCategoryFilter !== PRODUCT_CATEGORIES_WITH_ALL[0]) tempProcessed = tempProcessed.filter(p => p.category === selectedCategoryFilter);
    if (selectedConditionFilter !== PRODUCT_CONDITIONS_WITH_ALL[0]) tempProcessed = tempProcessed.filter(p => p.condition === selectedConditionFilter);
    if (appliedMinPrice !== null) tempProcessed = tempProcessed.filter(p => (p.price || 0) >= appliedMinPrice);
    if (appliedMaxPrice !== null) tempProcessed = tempProcessed.filter(p => (p.price || 0) <= appliedMaxPrice);
    
    if (selectedSortOption === "Newest First") tempProcessed.sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
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

  const handleLogout = () => Alert.alert("Log Out", "Are you sure?", [{ text: "Cancel", style: "cancel" }, { text: "Log Out", style: "destructive", onPress: () => auth().signOut() }]);
  const handleAddItemPress = () => requireLogin('list an item') && navigation.navigate('SubmitItem');
  const handleApplyPriceFilter = () => { setAppliedMinPrice(parseFloat(minPriceInput) || null); setAppliedMaxPrice(parseFloat(maxPriceInput) || null); };
  const handleClearPriceFilter = () => { setMinPriceInput(''); setMaxPriceInput(''); setAppliedMinPrice(null); setAppliedMaxPrice(null); };
  
  const handleSaveToggle = (productId) => {
    if (!requireLogin('save items')) return;
    const wishlistItemRef = firestore().collection('users').doc(currentUser.uid).collection('wishlist').doc(productId);
    
    const previouslySaved = wishlistIds.has(productId);

    // Optimistic UI Update
    setWishlistIds(prev => {
        const newSet = new Set(prev);
        if (previouslySaved) newSet.delete(productId);
        else newSet.add(productId);
        return newSet;
    });

    if (previouslySaved) {
        wishlistItemRef.delete().catch(() => {
            setWishlistIds(prev => new Set(prev).add(productId)); // Revert on error
            Toast.show({ type: 'error', text1: 'Error removing item' });
        });
    } else {
        wishlistItemRef.set({ savedAt: firestore.FieldValue.serverTimestamp() }).catch(() => {
            setWishlistIds(prev => { // Revert on error
                const newSet = new Set(prev);
                newSet.delete(productId);
                return newSet;
            });
            Toast.show({ type: 'error', text1: 'Error saving item' });
        });
    }
  };

  // --- Render Functions ---
  const renderProductItem = ({ item }) => {
    const isSaved = wishlistIds.has(item.id);
    return (
      <View style={[styles.productItemContainer, item.isSold && styles.soldProductContainer]}>
        <TouchableOpacity style={styles.productItemTouchable} onPress={() => navigation.navigate('Details', { productId: item.id })} disabled={item.isSold}>
          <Image source={{ uri: item.imageUrl || 'https://placehold.co/150x120/e0e0e0/7f7f7f?text=No+Image' }} style={[styles.productImage, item.isSold && styles.soldProductImage]} />
          {item.isSold && <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>SOLD</Text></View>}
          <Text style={styles.productName} numberOfLines={2}>{item.name || 'Unnamed Product'}</Text>
          <View style={styles.sellerContainer}>
            <Text style={styles.sellerName} numberOfLines={1}>By: {item.sellerDisplayName || 'Seller'}</Text>
            {typeof item.distanceKm === 'number' && <Text style={styles.distanceText}>~{item.distanceKm.toFixed(1)} km away</Text>}
          </View>
          <Text style={styles.productPrice}>${item.price?.toFixed(2) || '0.00'}</Text>
          {item.condition && <Text style={styles.productCondition}>{item.condition}</Text>}
        </TouchableOpacity>
        {currentUser && !item.isSold && (
          <TouchableOpacity style={styles.saveButton} onPress={() => handleSaveToggle(item.id)}>
            <Ionicons name={isSaved ? "heart" : "heart-outline"} size={24} color={isSaved ? colors.error : colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

  if (loading) {
    return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /><Text style={styles.loadingText}>Loading Products...</Text></SafeAreaView>;
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
          {currentUser && <TouchableOpacity onPress={handleLogout} style={[styles.iconButton, { marginLeft: 10 }]}><Ionicons name="log-out-outline" size={26} color={colors.error} /></TouchableOpacity>}
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
            <View style={styles.searchFilterSortContainer}>
              <TextInput style={styles.searchBar} placeholder="Search products, sellers..." value={searchQuery} onChangeText={setSearchQuery} placeholderTextColor={colors.textSecondary} clearButtonMode="while-editing" />
              <TouchableOpacity style={styles.filterSortButton} onPress={() => setSortModalVisible(true)}>
                <Ionicons name="swap-vertical-outline" size={18} color={colors.primaryTeal} />
                <Text style={styles.filterSortButtonText} numberOfLines={1}>{selectedSortOption === SORT_OPTIONS[0] ? 'Sort' : selectedSortOption.split(':')[0]}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.filterButtonsRow}>
              <TouchableOpacity style={styles.filterChipButton} onPress={() => setCategoryFilterModalVisible(true)}><Ionicons name="filter-outline" size={16} color={colors.primaryTeal} style={{marginRight: 4}} /><Text style={styles.filterChipButtonText} numberOfLines={1}>{selectedCategoryFilter === PRODUCT_CATEGORIES_WITH_ALL[0] ? 'Category' : selectedCategoryFilter}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.filterChipButton} onPress={() => setConditionModalVisible(true)}><Ionicons name="shield-checkmark-outline" size={16} color={colors.primaryTeal} style={{marginRight: 4}}/><Text style={styles.filterChipButtonText} numberOfLines={1}>{selectedConditionFilter === PRODUCT_CONDITIONS_WITH_ALL[0] ? 'Condition' : selectedConditionFilter}</Text></TouchableOpacity>
            </View>
            <View style={styles.priceFilterContainer}>
              <TextInput style={[styles.priceInput, {marginRight: 5}]} placeholder="Min Price" keyboardType="numeric" value={minPriceInput} onChangeText={setMinPriceInput} placeholderTextColor={colors.textSecondary} />
              <TextInput style={[styles.priceInput, {marginLeft: 5}]} placeholder="Max Price" keyboardType="numeric" value={maxPriceInput} onChangeText={setMaxPriceInput} placeholderTextColor={colors.textSecondary} />
              <TouchableOpacity style={styles.priceApplyButton} onPress={handleApplyPriceFilter}><Text style={styles.priceApplyButtonText}>Apply</Text></TouchableOpacity>
              {(appliedMinPrice !== null || appliedMaxPrice !== null) && <TouchableOpacity onPress={handleClearPriceFilter} style={styles.priceClearButton}><Ionicons name="close-circle-outline" size={22} color={colors.textSecondary} /></TouchableOpacity>}
            </View>
            {error && <Text style={styles.inlineErrorText}>{error}</Text>}
          </>
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="storefront-outline" size={60} color={colors.textDisabled} />
            <Text style={styles.emptyText}>{products.length === 0 ? "No products available right now." : "No products match your filters."}</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primaryTeal} colors={[colors.primaryTeal]} />}
        extraData={{ wishlistIds }}
      />
      
      <TouchableOpacity style={styles.fab} onPress={handleAddItemPress} activeOpacity={0.7}><Text style={styles.fabIcon}>+</Text></TouchableOpacity>
      {showWelcomePopup && <Animated.View style={[styles.welcomePopup, { opacity: popupOpacity }]}><Text style={styles.welcomePopupText}>Welcome {currentUser?.displayName || 'Back'}!</Text></Animated.View>}
      
      {/* Modals */}
      <Modal transparent={true} visible={isCategoryFilterModalVisible} animationType="fade" onRequestClose={() => setCategoryFilterModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setCategoryFilterModalVisible(false)}>
          <View style={styles.modalContent}><Text style={styles.modalTitle}>Filter by Category</Text><FlatList data={PRODUCT_CATEGORIES_WITH_ALL} keyExtractor={(item) => item} renderItem={({ item }) => (<TouchableOpacity style={styles.modalItem} onPress={() => {setSelectedCategoryFilter(item); setCategoryFilterModalVisible(false);}}><Text style={[styles.modalItemText, item === selectedCategoryFilter && styles.modalItemSelectedText]}>{item}</Text></TouchableOpacity>)} style={styles.modalList} /></View>
        </TouchableOpacity>
      </Modal>
      <Modal transparent={true} visible={isSortModalVisible} animationType="fade" onRequestClose={() => setSortModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setSortModalVisible(false)}>
          <View style={styles.modalContent}><Text style={styles.modalTitle}>Sort Products By</Text><FlatList data={SORT_OPTIONS} keyExtractor={(item) => item} renderItem={({ item }) => (<TouchableOpacity style={styles.modalItem} onPress={() => {setSelectedSortOption(item); setSortModalVisible(false);}}><Text style={[styles.modalItemText, item === selectedSortOption && styles.modalItemSelectedText]}>{item}</Text></TouchableOpacity>)} style={styles.modalList} /></View>
        </TouchableOpacity>
      </Modal>
      <Modal transparent={true} visible={isConditionModalVisible} animationType="fade" onRequestClose={() => setConditionModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setConditionModalVisible(false)}>
          <View style={styles.modalContent}><Text style={styles.modalTitle}>Filter by Condition</Text><FlatList data={PRODUCT_CONDITIONS_WITH_ALL} keyExtractor={(item) => item} renderItem={({ item }) => (<TouchableOpacity style={styles.modalItem} onPress={() => {setSelectedConditionFilter(item); setConditionModalVisible(false);}}><Text style={[styles.modalItemText, item === selectedConditionFilter && styles.modalItemSelectedText]}>{item}</Text></TouchableOpacity>)} style={styles.modalList} /></View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    loadingText: { marginTop: 15, fontSize: 16, color: colors.textSecondary },
    inlineErrorText: { color: colors.error, fontSize: 14, textAlign: 'center', paddingVertical: 8, backgroundColor: isDarkMode ? 'rgba(239, 83, 80, 0.2)' : 'rgba(239, 83, 80, 0.1)'},
    emptyText: { textAlign: 'center', marginTop: 20, fontSize: 16, color: colors.textSecondary, paddingHorizontal: 20 },
    header: { paddingHorizontal: 15, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerAvatarTouchable: { padding: 4 },
    headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border },
    headerAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryGreen, justifyContent: 'center', alignItems: 'center' },
    headerAvatarInitial: { color: colors.textOnPrimary, fontSize: 16, fontWeight: 'bold' },
    headerAppName: { fontSize: 20, fontWeight: 'bold', color: colors.primaryTeal },
    headerRightContainer: { flexDirection: 'row', alignItems: 'center' },
    iconButton: { padding: 6, position: 'relative' },
    notificationBadge: { position: 'absolute', right: 2, top: 2, backgroundColor: colors.error, borderRadius: 9, width: 18, height: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.surface },
    notificationBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    searchFilterSortContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    searchBar: { flex: 1, height: 40, borderColor: colors.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 15, backgroundColor: colors.background, fontSize: 15, color: colors.textPrimary, marginRight: 8 },
    filterSortButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, height: 40, marginLeft: 5 },
    filterSortButtonText: { color: colors.primaryTeal, marginLeft: 4, fontSize: 13, fontWeight: '500' },
    filterButtonsRow: { flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    filterChipButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
    filterChipButtonText: { color: colors.primaryTeal, fontSize: 13, fontWeight: '500' },
    priceFilterContainer: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
    priceInput: { flex: 1, height: 38, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, backgroundColor: colors.background, fontSize: 14, color: colors.textPrimary },
    priceApplyButton: { backgroundColor: colors.primaryTeal, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginLeft: 10, height: 38, justifyContent: 'center' },
    priceApplyButtonText: { color: colors.textOnPrimary, fontWeight: 'bold', fontSize: 14 },
    priceClearButton: { padding: 5, marginLeft: 8 },
    listContainer: { paddingHorizontal: 5, paddingBottom: 100 },
    productItemContainer: { flex: 1 / 2, margin: 5, backgroundColor: colors.surface, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDarkMode ? 0.3 : 0.1, shadowRadius: 2, elevation: 2, position: 'relative' },
    soldProductContainer: { opacity: 0.6 },
    soldBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.error, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, zIndex: 1 },
    soldBadgeText: { color: colors.textOnPrimary, fontSize: 10, fontWeight: 'bold' },
    productItemTouchable: { flex: 1, padding: 10 },
    productImage: { width: '100%', height: 120, borderRadius: 4, marginBottom: 8, backgroundColor: colors.border },
    soldProductImage: { opacity: 0.7 },
    productName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, minHeight: 34 },
    sellerContainer: { width: '100%', marginTop: 4, marginBottom: 6 },
    sellerName: { fontSize: 12, color: colors.textSecondary },
    distanceText: { fontSize: 11, color: colors.textDisabled, fontStyle: 'italic', marginTop: 3 },
    productPrice: { fontSize: 14, color: colors.primaryGreen, fontWeight: 'bold', marginTop: 'auto' },
    productCondition: { fontSize: 11, color: colors.textDisabled, fontStyle: 'italic', marginTop: 3 },
    saveButton: { position: 'absolute', top: 5, right: 5, zIndex: 1, padding: 6, backgroundColor: isDarkMode ? 'rgba(30,30,30,0.6)' : 'rgba(255,255,255,0.7)', borderRadius: 15 },
    fab: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primaryTeal, justifyContent: 'center', alignItems: 'center', right: 25, bottom: 35, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
    fabIcon: { fontSize: 30, color: colors.textOnPrimary },
    welcomePopup: { position: 'absolute', top: Platform.OS === 'android' ? StatusBar.currentHeight + 60 : 100, left: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.8)', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center' },
    welcomePopupText: { color: '#ffffff', fontSize: 16, textAlign: 'center' },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backdrop },
    modalContent: { backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 10, width: '85%', maxHeight: '70%' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', color: colors.textPrimary, padding: 10 },
    modalList: { width: '100%' },
    modalItem: { paddingVertical: 14, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    modalItemText: { fontSize: 16, color: colors.textPrimary, textAlign: 'center' },
    modalItemSelectedText: { fontWeight: 'bold', color: colors.primaryTeal },
});

export default HomeScreen;
