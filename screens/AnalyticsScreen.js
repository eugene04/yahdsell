// screens/AnalyticsScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const AnalyticsScreen = () => {
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    const currentUser = auth().currentUser;

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useFocusEffect(
        useCallback(() => {
            if (!currentUser) {
                setError("You must be logged in to view analytics.");
                setLoading(false);
                return;
            }

            setLoading(true);
            const productsQuery = firestore()
                .collection('products')
                .where('sellerId', '==', currentUser.uid)
                .orderBy('createdAt', 'desc');

            const unsubscribe = productsQuery.onSnapshot(async (querySnapshot) => {
                const productsFromDb = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                try {
                    const productsWithStats = await Promise.all(
                        productsFromDb.map(async (product) => {
                            try {
                                const offersSnapshot = await firestore().collection('products').doc(product.id).collection('offers').get();
                                const wishlistSnapshot = await firestore().collectionGroup('wishlist').where('productId', '==', product.id).get();
                                
                                return {
                                    ...product,
                                    offerCount: offersSnapshot.size,
                                    wishlistCount: wishlistSnapshot.size,
                                };
                            } catch (statError) {
                                console.error(`Could not fetch stats for product ${product.id}`, statError);
                                return {
                                    ...product,
                                    offerCount: 0,
                                    wishlistCount: 0,
                                    statsError: true,
                                };
                            }
                        })
                    );
                    setProducts(productsWithStats);
                    setError(null);
                } catch (e) {
                    console.error("Error processing product stats:", e);
                    setError("An error occurred while analyzing your products.");
                } finally {
                    setLoading(false);
                }
            }, (err) => {
                console.error("Error fetching product list:", err);
                setError("Could not load your product data.");
                setLoading(false);
            });

            return () => unsubscribe();
        }, [currentUser])
    );

    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    const renderProductStatItem = ({ item }) => (
        <TouchableOpacity style={styles.itemContainer} onPress={() => navigation.navigate('Details', { productId: item.id })}>
            <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
            <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.itemPrice}>${item.price?.toFixed(2)}</Text>
                {item.statsError && <Text style={styles.statErrorText}>Stats unavailable</Text>}
            </View>
            <View style={styles.statsContainer}>
                <View style={styles.stat}>
                    <Ionicons name="eye-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.statText}>{item.viewCount || 0}</Text>
                </View>
                <View style={styles.stat}>
                    <Ionicons name="heart-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.statText}>{item.wishlistCount || 0}</Text>
                </View>
                <View style={styles.stat}>
                    <Ionicons name="pricetags-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.statText}>{item.offerCount || 0}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    }

    if (error) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={products}
                renderItem={renderProductStatItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                ListHeaderComponent={
                    <Text style={styles.headerTitle}>Your Listing Performance</Text>
                }
                ListEmptyComponent={
                    <View style={styles.centered}>
                        <Ionicons name="analytics-outline" size={48} color={colors.textDisabled} />
                        <Text style={styles.emptyText}>You have no listings to analyze.</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
};

const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
    listContainer: { padding: 15 },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 20,
    },
    itemContainer: {
        backgroundColor: colors.surface,
        borderRadius: 8,
        padding: 15,
        marginBottom: 15,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDarkMode ? 0.3 : 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    itemImage: {
        width: 60,
        height: 60,
        borderRadius: 4,
        backgroundColor: colors.border,
        marginRight: 15,
    },
    itemInfo: {
        flex: 1,
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    itemPrice: {
        fontSize: 14,
        color: colors.primaryGreen,
        fontWeight: 'bold',
    },
    statErrorText: {
        fontSize: 11,
        color: colors.error,
        fontStyle: 'italic',
        marginTop: 4,
    },
    statsContainer: {
        flexDirection: 'row',
        marginLeft: 10,
    },
    stat: {
        alignItems: 'center',
        marginLeft: 15,
    },
    statText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: 2,
    },
    emptyText: {
        textAlign: 'center',
        marginTop: 20,
        fontSize: 16,
        color: colors.textSecondary
    },
});

export default AnalyticsScreen;
