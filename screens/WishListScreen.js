// screens/WishlistScreen.js

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Image, ActivityIndicator,
  TouchableOpacity, SafeAreaView, Alert, RefreshControl
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../src/ThemeContext'; // Adjust path if needed
import { firestore, auth } from '../firebaseConfig'; // Adjust path if needed
import {
  collection, doc, getDoc, onSnapshot, deleteDoc, // Firestore methods
} from 'firebase/firestore';
import Ionicons from '@expo/vector-icons/Ionicons'; // For remove icon

// StarRating component (optional, if you want to show rating here too)
// const StarRating = ({ ... }) => { ... };

const WishlistScreen = () => {
  const navigation = useNavigation();
  const { colors, isDarkMode } = useTheme();
  const currentUser = auth.currentUser;

  const [wishlistItems, setWishlistItems] = useState([]); // Array of full product objects
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Fetch Wishlist Items ---
  const fetchWishlist = useCallback(() => {
    if (!currentUser) {
      // Should be handled by navigator, but good fallback
      setError("Please log in to view your wishlist.");
      setLoading(false);
      setIsRefreshing(false);
      setWishlistItems([]); // Clear items if logged out
      return () => {}; // Return empty cleanup
    }

    console.log("Fetching wishlist items...");
    setLoading(true);
    setError(null);

    const wishlistRef = collection(firestore, 'users', currentUser.uid, 'wishlist');

    // Listen to changes in the wishlist subcollection (IDs)
    const unsubscribe = onSnapshot(wishlistRef, async (snapshot) => {
      console.log(`Wishlist snapshot received with ${snapshot.size} items.`);
      if (snapshot.empty) {
        setWishlistItems([]);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Get product details for each ID in the wishlist
      const productPromises = snapshot.docs.map(async (wishlistDoc) => {
        const productId = wishlistDoc.id;
        const productRef = doc(firestore, 'products', productId);
        try {
          const productSnap = await getDoc(productRef);
          if (productSnap.exists()) {
            return { id: productSnap.id, ...productSnap.data() };
          } else {
            console.warn(`Product ${productId} from wishlist not found in products collection.`);
            // Optionally remove missing item from wishlist here?
            // await deleteDoc(wishlistDoc.ref);
            return null; // Indicate item is missing
          }
        } catch (err) {
          console.error(`Error fetching product details for ${productId}:`, err);
          return null; // Return null on error fetching specific item
        }
      });

      // Wait for all product fetches to complete
      const productsData = (await Promise.all(productPromises))
                           .filter(item => item !== null); // Filter out nulls (missing/error items)

      console.log(`Fetched details for ${productsData.length} wishlist items.`);
      setWishlistItems(productsData);
      setLoading(false);
      setIsRefreshing(false);

    }, (err) => {
      console.error("Error listening to wishlist collection:", err);
      setError("Failed to load wishlist.");
      setLoading(false);
      setIsRefreshing(false);
    });

    return unsubscribe; // Cleanup listener

  }, [currentUser]); // Depend on currentUser

  // Fetch data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const unsubscribe = fetchWishlist();
      return () => unsubscribe();
    }, [fetchWishlist])
  );

  // --- Pull-to-refresh ---
  const onRefresh = useCallback(() => {
    console.log("Refreshing wishlist...");
    setIsRefreshing(true);
    const unsubscribe = fetchWishlist(); // Refetch data
    // Cleanup isn't strictly needed as fetch handles it, but safe
    return () => unsubscribe();
  }, [fetchWishlist]);

  // --- Remove Item Handler ---
  const handleRemoveItem = async (productId) => {
    if (!currentUser || !productId) return;
    console.log(`Removing item ${productId} from wishlist`);
    const wishlistItemRef = doc(firestore, 'users', currentUser.uid, 'wishlist', productId);
    try {
      await deleteDoc(wishlistItemRef);
      // UI will update automatically via the onSnapshot listener
    } catch (error) {
      console.error("Error removing item from wishlist:", error);
      Alert.alert("Error", "Could not remove item.");
    }
  };

  // --- Render Wishlist Item ---
  const renderWishlistItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <TouchableOpacity
        style={styles.itemTouchable}
        onPress={() => navigation.navigate('Details', { productId: item.id })}
      >
        <Image source={{ uri: item.imageUrl || 'https://via.placeholder.com/150' }} style={styles.itemImage} resizeMode="cover"/>
        <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={2}>{item.name || 'No Name'}</Text>
            <Text style={styles.itemPrice}>{typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : 'N/A'}</Text>
            <Text style={styles.itemSeller} numberOfLines={1}>By: {item.sellerDisplayName || 'Unknown'}</Text>
        </View>
      </TouchableOpacity>
      {/* Remove Button */}
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => handleRemoveItem(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={22} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  // --- Themed Styles ---
  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors.background },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
    listContainer: { padding: 10 },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: colors.textSecondary },
    itemContainer: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
        alignItems: 'center', // Align items vertically
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDarkMode ? 0.3 : 0.1, shadowRadius: 2, elevation: 2,
    },
    itemTouchable: { // Takes up most space, navigates on press
        flexDirection: 'row',
        flex: 1, // Allow info to take available space
        alignItems: 'center',
    },
    itemImage: {
        width: 70, height: 70, borderRadius: 4,
        backgroundColor: colors.border, marginRight: 15,
    },
    itemInfo: {
        flex: 1, // Allow text to take available space before wrapping
        justifyContent: 'center',
    },
    itemName: { fontSize: 15, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 4, },
    itemPrice: { fontSize: 14, color: colors.primaryGreen, fontWeight: '600', marginBottom: 4, },
    itemSeller: { fontSize: 12, color: colors.textSecondary, },
    removeButton: {
        padding: 8, // Tap area
        marginLeft: 10, // Space from text content
    },
  }), [colors, isDarkMode]);


  // --- Loading / Error States ---
  if (loading && wishlistItems.length === 0) { // Show loading only initially
    return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
  }
  if (error && wishlistItems.length === 0) { // Show error only if list is empty
    return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
  }

  // --- Main List UI ---
  return (
    <View style={styles.container}>
      <FlatList
        data={wishlistItems}
        renderItem={renderWishlistItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>Your wishlist is empty.</Text>}
        contentContainerStyle={styles.listContainer}
        refreshControl={
            <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={colors.primaryTeal}
                colors={[colors.primaryTeal]}
            />
        }
      />
    </View>
  );
};

export default WishlistScreen;
