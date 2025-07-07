// screens/SellerReviewsScreen.js

import { useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// 1. Import the new firebase modules
import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Helper Component ---
const StarRating = ({ rating = 0, size = 20, style, color }) => {
    const filledStars = Math.round(rating);
    const starColor = color || '#fadb14'; // Gold color for stars
    return (
        <View style={[{ flexDirection: 'row' }, style]}>
            {[...Array(5)].map((_, index) => (
                <Text key={index} style={{ color: index < filledStars ? starColor : '#d9d9d9', fontSize: size, marginRight: 2 }}>
                    ★
                </Text>
            ))}
        </View>
    );
};

const SellerReviewsScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    const { sellerId, sellerName } = route.params || {};
    // 2. Use new auth syntax
    const currentUser = auth().currentUser;

    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [myRating, setMyRating] = useState(0);
    const [myComment, setMyComment] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    useLayoutEffect(() => {
        navigation.setOptions({ title: `${sellerName || 'Seller'}'s Reviews` });
    }, [navigation, sellerName]);

    useEffect(() => {
        if (!sellerId) {
            setError("Seller ID not provided.");
            setLoading(false);
            return;
        }
        
        // 3. Use new Firestore query syntax
        const reviewsQuery = firestore()
            .collection('reviews')
            .where('sellerId', '==', sellerId)
            .orderBy('createdAt', 'desc');

        const unsubscribe = reviewsQuery.onSnapshot(querySnapshot => {
            const fetchedReviews = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setReviews(fetchedReviews);
            if(loading) setLoading(false);
        }, err => {
            console.error("Error fetching reviews: ", err);
            setError("Failed to load reviews.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [sellerId]);

    const openReviewModal = () => {
        if (!currentUser) { Alert.alert("Login Required", "You must be logged in to leave a review."); return; }
        if (currentUser.uid === sellerId) { Alert.alert("Cannot Review", "You cannot review your own profile."); return; }
        setShowReviewModal(true);
        setMyRating(0);
        setMyComment('');
        setSubmitError(null);
    };
    
    const handleSubmitReview = async () => {
        if (myRating === 0 || !myComment.trim()) { Alert.alert("Missing Info", "Please provide a star rating and a comment."); return; }

        setIsSubmittingReview(true);
        setSubmitError(null);
        const sellerUserRef = firestore().collection('users').doc(sellerId);
        const newReviewRef = firestore().collection('reviews').doc();

        try {
            // 4. Use new Firestore transaction syntax
            await firestore().runTransaction(async (transaction) => {
                const sellerDoc = await transaction.get(sellerUserRef);
                const currentSum = sellerDoc.exists ? sellerDoc.data().totalRatingSum || 0 : 0;
                const currentCount = sellerDoc.exists ? sellerDoc.data().ratingCount || 0 : 0;
                
                const newSum = currentSum + myRating;
                const newCount = currentCount + 1;
                const newAverage = Math.round((newSum / newCount) * 10) / 10;

                transaction.set(newReviewRef, {
                    sellerId,
                    reviewerId: currentUser.uid,
                    reviewerName: currentUser.displayName || 'Anonymous',
                    rating: myRating,
                    comment: myComment.trim(),
                    createdAt: firestore.FieldValue.serverTimestamp(),
                });

                transaction.set(sellerUserRef, {
                    totalRatingSum: newSum,
                    ratingCount: newCount,
                    averageRating: newAverage
                }, { merge: true });
            });

            Toast.show({ type: 'success', text1: 'Review Submitted!', position: 'bottom' });
            setShowReviewModal(false);

        } catch (err) {
            console.error("Error submitting review:", err);
            setSubmitError('Failed to submit review. Please try again.');
        } finally {
            setIsSubmittingReview(false);
        }
    };
    
    // --- Render Logic ---
    const renderReviewItem = ({ item }) => (
        <View style={styles.reviewItem}>
            <StarRating rating={item.rating || 0} />
            <Text style={styles.reviewComment}>{item.comment}</Text>
            <Text style={styles.reviewAuthor}>
                - {item.reviewerName || 'Anonymous'} on {item.createdAt?.toDate().toLocaleDateString() || '...'}
            </Text>
        </View>
    );
    
    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);
    
    if (loading) return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    if (error) return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    
    const canAddReview = currentUser && currentUser.uid !== sellerId;

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={reviews}
                renderItem={renderReviewItem}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={canAddReview ? (<TouchableOpacity style={styles.addReviewButton} onPress={openReviewModal}><Text style={styles.addReviewButtonText}>Leave a Review</Text></TouchableOpacity>) : null}
                ListEmptyComponent={<Text style={styles.emptyText}>No reviews yet for {sellerName || 'this seller'}.</Text>}
                contentContainerStyle={styles.listContainer}
            />
            <Modal animationType="slide" transparent={true} visible={showReviewModal} onRequestClose={() => setShowReviewModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                    <ScrollView contentContainerStyle={styles.modalScrollView}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Leave a Review for {sellerName}</Text>
                            <Text style={styles.ratingLabel}>Your Rating:</Text>
                            <View style={styles.starInputContainer}>
                                {[1, 2, 3, 4, 5].map((ratingValue) => (
                                    <TouchableOpacity key={ratingValue} onPress={() => setMyRating(ratingValue)}>
                                        <Text style={[styles.starInput, ratingValue <= myRating ? styles.starSelected : styles.starDeselected]}>★</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={styles.ratingLabel}>Your Comment:</Text>
                            <TextInput style={styles.commentInput} placeholder="Share your experience..." value={myComment} onChangeText={setMyComment} multiline maxLength={500} placeholderTextColor={colors.textDisabled}/>
                            {submitError && <Text style={[styles.errorText, { marginTop: 10 }]}>{submitError}</Text>}
                            <View style={styles.modalButtonContainer}>
                                <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowReviewModal(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
                                <TouchableOpacity style={[styles.modalButton, styles.submitButton, (isSubmittingReview || myRating === 0 || !myComment.trim()) && styles.buttonDisabled]} onPress={handleSubmitReview} disabled={isSubmittingReview || myRating === 0 || !myComment.trim()}>
                                    {isSubmittingReview ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.submitButtonText}>Submit</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>
            <Toast />
        </SafeAreaView>
    );
};

// --- Styles ---
const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
    listContainer: { padding: 15, paddingBottom: 40 },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: colors.textSecondary },
    reviewItem: { backgroundColor: colors.surface, padding: 15, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    reviewComment: { fontSize: 15, color: colors.textPrimary, marginVertical: 8, lineHeight: 21 },
    reviewAuthor: { fontSize: 12, color: colors.textSecondary, textAlign: 'right', fontStyle: 'italic' },
    addReviewButton: { backgroundColor: colors.primaryTeal, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
    addReviewButtonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: 'bold' },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backdrop },
    modalScrollView: { flexGrow: 1, width: '100%', justifyContent: 'center' },
    modalContent: { width: '90%', backgroundColor: colors.surface, borderRadius: 10, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: colors.textPrimary },
    ratingLabel: { fontSize: 16, marginBottom: 10, alignSelf: 'flex-start', color: colors.textSecondary, fontWeight: '500' },
    starInputContainer: { flexDirection: 'row', marginBottom: 20 },
    starInput: { fontSize: 40, marginHorizontal: 5 },
    starSelected: { color: '#fadb14' },
    starDeselected: { color: colors.border },
    commentInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, height: 100, textAlignVertical: 'top', width: '100%', marginBottom: 20, fontSize: 15, color: colors.textPrimary, backgroundColor: colors.background },
    modalButtonContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 5 },
    cancelButton: { backgroundColor: colors.surfaceLight || '#E0E0E0' },
    cancelButtonText: { color: colors.textPrimary, fontWeight: 'bold' },
    submitButton: { backgroundColor: colors.primaryGreen },
    submitButtonText: { color: colors.textOnPrimary, fontWeight: 'bold' },
    buttonDisabled: { backgroundColor: colors.textDisabled },
});

export default SellerReviewsScreen;
