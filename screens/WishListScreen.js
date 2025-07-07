// screens/WishlistScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, RefreshControl, SafeAreaView, StyleSheet, Text, TouchableOpacity, View
} from 'react-native';

// 1. Import the new firebase modules
import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const WishlistScreen = () => {
  const navigation = useNavigation();
  const { colors, isDarkMode } = useTheme();
  
  // 2. Use the new auth syntax to get current user
  const currentUser = auth().currentUser;

  const [wishlistItems, setWishlistItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Fetch Wishlist Items ---
  const fetchWishlist = useCallback(() => {
    if (!currentUser) {
      setError("Please log in to view your wishlist.");
      setWishlistItems([]);
      setLoading(false);
      setIsRefreshing(false);
      return () => {};
    }

    setLoading(true);
    setError(null);

    // 3. Update Firestore listener syntax
    const wishlistRef = firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('wishlist');

    const unsubscribe = wishlistRef.onSnapshot(async (snapshot) => {
      if (snapshot.empty) {
        setWishlistItems([]);
        setLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Get product details for each ID in the wishlist
      const productPromises = snapshot.docs.map(async (wishlistDoc) => {
        const productId = wishlistDoc.id;
        // Use the new syntax for getting a document
        const productRef = firestore().collection('products').doc(productId);
        try {
          const productSnap = await productRef.get();
          if (productSnap.exists) {
            return { id: productSnap.id, ...productSnap.data() };
          }
          return null;
        } catch (err) {
          console.error(`Error fetching product details for ${productId}:`, err);
          return null;
        }
      });

      const productsData = (await Promise.all(productPromises)).filter(Boolean);
      setWishlistItems(productsData);
      setLoading(false);
      setIsRefreshing(false);
    }, (err) => {
      console.error("Error listening to wishlist collection:", err);
      setError("Failed to load wishlist.");
      setLoading(false);
      setIsRefreshing(false);
    });

    return unsubscribe;
  }, [currentUser]);

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = fetchWishlist();
      return () => unsubscribe();
    }, [fetchWishlist])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchWishlist();
  }, [fetchWishlist]);

  // --- Remove Item Handler ---
  const handleRemoveItem = async (productId) => {
    if (!currentUser || !productId) return;
    
    // 4. Update delete syntax
    const wishlistItemRef = firestore()
      .collection('users')
      .doc(currentUser.uid)
      .collection('wishlist')
      .doc(productId);
      
    try {
      await wishlistItemRef.delete();
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
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDarkMode ? 0.3 : 0.1, shadowRadius: 2, elevation: 2,
    },
    itemTouchable: {
        flexDirection: 'row',
        flex: 1,
        alignItems: 'center',
    },
    itemImage: {
        width: 70, height: 70, borderRadius: 4,
        backgroundColor: colors.border, marginRight: 15,
    },
    itemInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    itemName: { fontSize: 15, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 4, },
    itemPrice: { fontSize: 14, color: colors.primaryGreen, fontWeight: '600', marginBottom: 4, },
    itemSeller: { fontSize: 12, color: colors.textSecondary, },
    removeButton: {
        padding: 8,
        marginLeft: 10,
    },
  }), [colors, isDarkMode]);

  // --- Loading / Error States ---
  if (loading && wishlistItems.length === 0) {
    return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
  }
  if (error && wishlistItems.length === 0) {
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
