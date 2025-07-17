// screens/SavedSearchesScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const SavedSearchesScreen = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const currentUser = auth().currentUser;

    const [savedSearches, setSavedSearches] = useState([]);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            if (!currentUser) {
                Alert.alert("Login Required", "You must be logged in to view saved searches.");
                navigation.goBack();
                return;
            }

            const searchesRef = firestore()
                .collection('users')
                .doc(currentUser.uid)
                .collection('savedSearches')
                .orderBy('createdAt', 'desc');

            const unsubscribe = searchesRef.onSnapshot(snapshot => {
                const searches = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                setSavedSearches(searches);
                if (loading) setLoading(false);
            }, error => {
                console.error("Error fetching saved searches: ", error);
                setLoading(false);
                Toast.show({ type: 'error', text1: 'Could not load searches.' });
            });

            return () => unsubscribe();
        }, [currentUser, loading])
    );

    const handleDeleteSearch = (searchId) => {
        if (!currentUser || !searchId) return;

        Alert.alert(
            "Delete Search",
            "Are you sure you want to delete this saved search?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await firestore()
                                .collection('users')
                                .doc(currentUser.uid)
                                .collection('savedSearches')
                                .doc(searchId)
                                .delete();
                            Toast.show({ type: 'info', text1: 'Search Deleted' });
                        } catch (error) {
                            console.error("Error deleting search:", error);
                            Toast.show({ type: 'error', text1: 'Failed to delete search.' });
                        }
                    },
                },
            ]
        );
    };

    const renderSearchItem = ({ item }) => (
        <View style={styles.itemContainer}>
            <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={3}>{item.name}</Text>
                <Text style={styles.itemDate}>Saved on {item.createdAt?.toDate().toLocaleDateString()}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteSearch(item.id)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={24} color={colors.error} />
            </TouchableOpacity>
        </View>
    );

    const styles = useMemo(() => themedStyles(colors), [colors]);

    if (loading) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={savedSearches}
                renderItem={renderSearchItem}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                    <View style={styles.centered}>
                        <Ionicons name="bookmark-outline" size={48} color={colors.textDisabled} />
                        <Text style={styles.emptyText}>You have no saved searches.</Text>
                        <Text style={styles.emptySubText}>Apply filters on the home screen and tap the bookmark icon to save a search.</Text>
                    </View>
                }
                contentContainerStyle={styles.listContainer}
            />
            <Toast />
        </SafeAreaView>
    );
};

const themedStyles = (colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    listContainer: { padding: 15 },
    emptyText: { marginTop: 20, fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
    emptySubText: { marginTop: 10, fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 20 },
    itemContainer: {
        backgroundColor: colors.surface,
        borderRadius: 8,
        padding: 15,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    itemInfo: {
        flex: 1,
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 5,
    },
    itemDate: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    deleteButton: {
        padding: 8,
        marginLeft: 15,
    },
});

export default SavedSearchesScreen;
