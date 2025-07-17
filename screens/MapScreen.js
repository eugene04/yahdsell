// screens/MapScreen.js

import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker } from 'react-native-maps';

import { functions } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const getProductsInRegionFunc = functions().httpsCallable('getProductsInRegion');

const MapScreen = () => {
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    const mapRef = useRef(null);

    const [initialRegion, setInitialRegion] = useState(null);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setErrorMsg('Permission to access location was denied');
                setInitialRegion({
                    latitude: 34.0522,
                    longitude: -118.2437,
                    latitudeDelta: LATITUDE_DELTA,
                    longitudeDelta: LONGITUDE_DELTA,
                });
                setLoading(false);
                return;
            }

            try {
                let location = await Location.getCurrentPositionAsync({});
                const region = {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: LATITUDE_DELTA,
                    longitudeDelta: LONGITUDE_DELTA,
                };
                setInitialRegion(region);
            } catch (e) {
                setErrorMsg("Could not fetch location.");
                 setInitialRegion({
                    latitude: 34.0522,
                    longitude: -118.2437,
                    latitudeDelta: LATITUDE_DELTA,
                    longitudeDelta: LONGITUDE_DELTA,
                });
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const fetchProducts = useCallback(async (region) => {
        if (!region) return;
        setLoading(true);
        try {
            const result = await getProductsInRegionFunc({
                latitude: region.latitude,
                longitude: region.longitude,
                radius: 50,
            });
            if (result.data.products) {
                setProducts(result.data.products);
            }
        } catch (err) {
            console.error("Error fetching products for map:", err);
            Alert.alert("Error", "Could not load items for this area.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialRegion) {
            fetchProducts(initialRegion);
        }
    }, [initialRegion, fetchProducts]);

    const handleRegionChangeComplete = (region) => {
        fetchProducts(region);
    };

    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    if (!initialRegion) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primaryTeal} />
                <Text style={styles.loadingText}>Getting your location...</Text>
                {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
            </View>
        );
    }
    
    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={initialRegion}
                showsUserLocation={true}
                onRegionChangeComplete={handleRegionChangeComplete}
            >
                {/* FIX: Filter products to ensure sellerLocation and its coordinates are valid before rendering a Marker.
                  This prevents the "null latitude" crash if some products in the database have missing or malformed location data.
                */}
                {products
                    .filter(p => p.sellerLocation && typeof p.sellerLocation.latitude === 'number' && typeof p.sellerLocation.longitude === 'number')
                    .map(product => (
                    <Marker
                        key={product.id}
                        coordinate={{
                            latitude: product.sellerLocation.latitude,
                            longitude: product.sellerLocation.longitude,
                        }}
                        pinColor={colors.primaryTeal}
                    >
                        <Callout tooltip onPress={() => navigation.navigate('Details', { productId: product.id })}>
                            <View style={styles.calloutContainer}>
                                <Image
                                    source={{ uri: product.imageUrl || 'https://placehold.co/100x80' }}
                                    style={styles.calloutImage}
                                />
                                <View style={styles.calloutTextContainer}>
                                    <Text style={styles.calloutTitle} numberOfLines={1}>{product.name}</Text>
                                    <Text style={styles.calloutPrice}>${product.price?.toFixed(2)}</Text>
                                </View>
                            </View>
                        </Callout>
                    </Marker>
                ))}
            </MapView>
            {loading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color={colors.primaryTeal} />
                </View>
            )}
        </View>
    );
};

const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', alignItems: 'center' },
    map: { ...StyleSheet.absoluteFillObject },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    loadingText: { marginTop: 10, color: colors.textSecondary },
    errorText: { marginTop: 10, color: colors.error },
    loadingOverlay: {
        position: 'absolute',
        top: 20,
        left: '50%',
        transform: [{ translateX: -25 }],
        backgroundColor: colors.surface,
        borderRadius: 25,
        padding: 10,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    calloutContainer: {
        backgroundColor: colors.surface,
        borderRadius: 8,
        padding: 10,
        width: 180,
        borderColor: colors.border,
        borderWidth: 1,
    },
    calloutImage: {
        width: '100%',
        height: 80,
        borderRadius: 4,
        marginBottom: 5,
    },
    calloutTextContainer: {
        flex: 1,
    },
    calloutTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    calloutPrice: {
        fontSize: 13,
        color: colors.primaryGreen,
        marginTop: 4,
    },
});

export default MapScreen;
