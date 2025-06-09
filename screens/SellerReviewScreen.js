// screens/SellerReviewsScreen.js (with Toast Feedback)

import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Button,
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

// Import Firebase services and functions
import {
    collection,
    doc,
    onSnapshot,
    orderBy, query,
    runTransaction // Import doc and runTransaction for aggregate update
    ,
    serverTimestamp, where
} from 'firebase/firestore';
import { auth, firestore } from '../firebaseConfig'; // Adjust path if needed

// *** 1. Import Toast ***
import Toast from 'react-native-toast-message';

// Import Theme hook if needed for styling
// import { useTheme } from '../src/ThemeContext';

// --- Simple Star Rating Component ---
const StarRating = ({ rating = 0, size = 20, style }) => {
    const filledStars = Math.round(rating);
    const totalStars = 5;
    return (
        <View style={[{ flexDirection: 'row' }, style]}>
            {[...Array(totalStars)].map((_, index) => {
                const starNumber = index + 1;
                return (
                    <Text key={starNumber} style={{ color: starNumber <= filledStars ? '#fadb14' : '#d9d9d9', fontSize: size, marginRight: 2 }}>
                        ★
                    </Text>
                );
            })}
        </View>
    );
};
// --- End Star Rating ---


const SellerReviewsScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    // const { colors, isDarkMode } = useTheme(); // Uncomment if using themed styles

    const { sellerId, sellerName } = route.params || {};

    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentUser] = useState(auth.currentUser);

    // State for adding review modal
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [myRating, setMyRating] = useState(0);
    const [myComment, setMyComment] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    // Set Navigation Header Title
    useLayoutEffect(() => {
        navigation.setOptions({ title: sellerName ? `${sellerName}'s Reviews` : 'Seller Reviews' });
    }, [navigation, sellerName]);

    // Fetch Reviews Effect
    useEffect(() => {
        if (!sellerId) {
            setError("Seller ID not provided."); setLoading(false); console.error("Seller ID missing."); return;
        }
        setLoading(true); setError(null);

        const reviewsCollectionRef = collection(firestore, 'reviews');
        const q = query(
            reviewsCollectionRef, where('sellerId', '==', sellerId), orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedReviews = [];
            querySnapshot.forEach((doc) => { fetchedReviews.push({ id: doc.id, ...doc.data() }); });
            setReviews(fetchedReviews); setLoading(false);
        }, (err) => {
            console.error("Error fetching reviews: ", err);
            if (err.code === 'failed-precondition') { setError("Firestore index required. Check console."); }
            else { setError("Failed to load reviews."); }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [sellerId]);

    // --- Add Review Logic ---
    const openReviewModal = () => {
        if (!currentUser) {
            Alert.alert("Login Required", "Log in to leave a review.", [{ text: "Cancel"}, { text: "Log In", onPress: () => navigation.navigate('Login') }]); return;
        }
        setMyRating(0); setMyComment(''); setSubmitError(null); setShowReviewModal(true);
    };

    const handleRatingSelect = (rating) => { setMyRating(rating); };

    // Client-side aggregate update using Transaction
    const handleSubmitReview = async () => {
        if (!currentUser) { Alert.alert("Error", "You must be logged in."); return; }
        if (myRating === 0) { Alert.alert("Rating Required", "Please select a star rating."); return; }
        if (!myComment.trim()) { Alert.alert("Comment Required", "Please enter a brief comment."); return; }

        setIsSubmittingReview(true); setSubmitError(null);

        const reviewData = {
            sellerId: sellerId, reviewerId: currentUser.uid,
            reviewerName: currentUser.displayName || currentUser.email || 'Anonymous',
            rating: myRating, comment: myComment.trim(), createdAt: serverTimestamp(),
        };

        const sellerUserRef = doc(firestore, 'users', sellerId);
        const newReviewRef = doc(collection(firestore, 'reviews'));

        try {
            await runTransaction(firestore, async (transaction) => {
                const sellerDoc = await transaction.get(sellerUserRef);
                let currentSum = 0; let currentCount = 0;
                if (sellerDoc.exists()) {
                    currentSum = sellerDoc.data().totalRatingSum || 0;
                    currentCount = sellerDoc.data().ratingCount || 0;
                }
                const newSum = currentSum + myRating;
                const newCount = currentCount + 1;
                const newAverage = newCount > 0 ? Math.round((newSum / newCount) * 10) / 10 : 0;

                transaction.set(newReviewRef, reviewData);
                transaction.set(sellerUserRef, {
                    totalRatingSum: newSum, ratingCount: newCount, averageRating: newAverage
                }, { merge: true });
            });

            // *** 2. Show Success Toast ***
            Toast.show({
                type: 'success',
                text1: 'Review Submitted!',
                text2: 'Thank you for your feedback.',
                position: 'bottom',
                visibilityTime: 3000
            });
            // Alert.alert("Review Submitted", "Thank you!"); // Remove Alert
            setShowReviewModal(false);

        } catch (err) {
            console.error("Error submitting review/updating rating:", err);
            setSubmitError("Failed to submit review. Please try again."); // Show error in modal

             // *** 3. Show Error Toast ***
             Toast.show({
                type: 'error',
                text1: 'Submission Error',
                text2: 'Could not submit review. Please try again.',
                position: 'bottom',
                visibilityTime: 4000
            });
            // Alert.alert("Error", "Could not submit review."); // Remove Alert

        } finally {
            setIsSubmittingReview(false);
        }
    };
    // --- End Add Review Logic ---

    // --- Render Function for each Review Item ---
    const renderReviewItem = ({ item }) => (
        <View style={styles.reviewItem}>
            <StarRating rating={item.rating || 0} />
            <Text style={styles.reviewComment}>{item.comment}</Text>
            <Text style={styles.reviewAuthor}>
                - {item.reviewerName || 'Anonymous'} on {item.createdAt?.toDate().toLocaleDateString() || '...'}
            </Text>
        </View>
    );

    // --- Loading State ---
    if (loading) {
        // Use themed color if available: color="#007bff" -> color={colors.primaryTeal}
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color="#007bff" /></SafeAreaView>;
    }

    // --- Error State ---
    if (error && !loading) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    }

    const canAddReview = currentUser && currentUser.uid !== sellerId;

    // --- Main Reviews List UI ---
    return (
        // Use themed background: backgroundColor: '#f8f8f8' -> backgroundColor: colors.background
        <SafeAreaView style={styles.container}>
            <FlatList
                data={reviews}
                renderItem={renderReviewItem}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={
                    canAddReview ? (
                        <TouchableOpacity style={styles.addReviewButton} onPress={openReviewModal}>
                            <Text style={styles.addReviewButtonText}>Leave a Review</Text>
                        </TouchableOpacity>
                    ) : null
                }
                ListEmptyComponent={<Text style={styles.emptyText}>No reviews yet for {sellerName || 'this seller'}.</Text>}
                contentContainerStyle={styles.listContainer}
            />

            {/* --- Add Review Modal --- */}
            <Modal animationType="slide" transparent={true} visible={showReviewModal} onRequestClose={() => { setShowReviewModal(false); }}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                    <ScrollView contentContainerStyle={styles.modalScrollView}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Leave a Review for {sellerName}</Text>
                            <Text style={styles.ratingLabel}>Your Rating:</Text>
                            <View style={styles.starInputContainer}>
                                {[1, 2, 3, 4, 5].map((ratingValue) => (
                                    <TouchableOpacity key={ratingValue} onPress={() => handleRatingSelect(ratingValue)}>
                                        <Text style={[styles.starInput, ratingValue <= myRating ? styles.starSelected : styles.starDeselected]}>★</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={styles.ratingLabel}>Your Comment:</Text>
                            <TextInput style={styles.commentInput} placeholder="Share your experience..." value={myComment} onChangeText={setMyComment} multiline maxLength={500} />
                            <View style={styles.modalButtonContainer}>
                                <Button title="Cancel" onPress={() => setShowReviewModal(false)} color="#6c757d" />
                                <View style={{ width: 15 }} />
                                <Button title={isSubmittingReview ? "Submitting..." : "Submit Review"} onPress={handleSubmitReview} disabled={isSubmittingReview || myRating === 0 || !myComment.trim()} />
                            </View>
                            {submitError && <Text style={[styles.errorText, { marginTop: 10 }]}>{submitError}</Text>}
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}; // End of Component


// --- Styles --- (Using basic styles, replace with themed styles if desired)
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f8f8' }, // Use colors.background
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    errorText: { color: 'red', fontSize: 16, textAlign: 'center' }, // Use colors.error
    listContainer: { padding: 15, paddingBottom: 40 },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: '#666' }, // Use colors.textSecondary
    reviewItem: { backgroundColor: '#ffffff', padding: 15, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: '#eee', }, // Use colors.surface, colors.border
    reviewComment: { fontSize: 15, color: '#333', marginVertical: 8, lineHeight: 21 }, // Use colors.textPrimary
    reviewAuthor: { fontSize: 12, color: '#888', textAlign: 'right', fontStyle: 'italic' }, // Use colors.textSecondary
    addReviewButton: { backgroundColor: '#007bff', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 20, }, // Use colors.primaryTeal
    addReviewButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }, // Use colors.textOnPrimary
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)' }, // Use colors.backdrop
    modalScrollView: { flexGrow: 1, width: '100%', justifyContent: 'center' },
    modalContent: { width: '90%', backgroundColor: 'white', borderRadius: 10, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, }, // Use colors.surface
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#333' }, // Use colors.textPrimary
    ratingLabel: { fontSize: 16, marginBottom: 5, alignSelf: 'flex-start', color: '#444'}, // Use colors.textSecondary or textPrimary
    starInputContainer: { flexDirection: 'row', marginBottom: 20 },
    starInput: { fontSize: 35, marginHorizontal: 5 },
    starSelected: { color: '#fadb14' }, // Keep gold color for stars
    starDeselected: { color: '#d9d9d9' }, // Keep light grey for stars
    commentInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, height: 100, textAlignVertical: 'top', width: '100%', marginBottom: 20, fontSize: 15, color: '#333' }, // Use colors.border, colors.textPrimary
    modalButtonContainer: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
    // Note: Button component color prop might override some theme styles
});

export default SellerReviewsScreen;
