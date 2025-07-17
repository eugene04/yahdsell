// functions/src/index.ts

import * as admin from "firebase-admin";
// Import v2 triggers, logger, and parameters
import { FieldValue, GeoPoint, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineString } from "firebase-functions/params";
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten
} from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
// Import Google AI SDK
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { getStorage } from "firebase-admin/storage";
import { onSchedule } from "firebase-functions/v2/scheduler";

// Import Expo Server SDK
import { Expo } from "expo-server-sdk";

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = getFirestore();
const bucket = getStorage().bucket();

// Initialize Expo SDK Client
const expo = new Expo();

// --- Define Parameters ---
const geminiApiKey = defineString("GEMINI_API_KEY");

// --- Constants for AI Suggestions ---
const PRODUCT_CATEGORIES_FOR_AI = [ "Electronics", "Clothing & Apparel", "Home & Garden", "Furniture", "Vehicles", "Books, Movies & Music", "Collectibles & Art", "Sports & Outdoors", "Toys & Hobbies", "Baby & Kids", "Health & Beauty", "Other" ];


// --- Helper function to store notification record ---
async function storeNotificationRecord(
  recipientId: string,
  notificationPayload: {
    title: string;
    body: string;
    type: string;
    data: any;
  }
) {
  if (!recipientId) {
    logger.error("Recipient ID is undefined, cannot store notification record.");
    return;
  }
  try {
    const notificationRef = db.collection("users")
                               .doc(recipientId)
                               .collection("notifications")
                               .doc();

    await notificationRef.set({
      ...notificationPayload,
      recipientId: recipientId,
      createdAt: FieldValue.serverTimestamp(),
      isRead: false,
    });
    logger.log(`Notification record stored for recipient ${recipientId}, ID: ${notificationRef.id}`);
  } catch (error) {
    logger.error(`Error storing notification record for recipient ${recipientId}:`, error);
  }
}

// --- Helper function to send push notifications ---
async function sendPushNotifications(userId: string, payload: { title: string; body: string; data: any; }) {
    const tokensSnapshot = await db.collection("users").doc(userId).collection("pushTokens").get();
    if (tokensSnapshot.empty) {
        logger.log(`No push tokens found for user ${userId}.`);
        return;
    }

    const messages = tokensSnapshot.docs
        .map(doc => doc.data().token)
        .filter(token => Expo.isExpoPushToken(token))
        .map(pushToken => ({
            to: pushToken,
            sound: "default" as const,
            title: payload.title,
            body: payload.body,
            data: payload.data,
        }));

    if (messages.length > 0) {
        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
            try {
                await expo.sendPushNotificationsAsync(chunk);
                logger.log(`Sent push notification chunk to user ${userId}.`);
            } catch (error) {
                logger.error(`Error sending push notification chunk to user ${userId}:`, error);
            }
        }
    }
}

// --- HELPER FUNCTION: To send a system message to a private chat (WITH ENHANCED LOGGING) ---
async function sendSystemChatMessage(
  uid1: string,
  uid2: string,
  messageText: string
) {
  logger.log("Attempting to send system chat message.", { uid1, uid2 });

  if (!uid1 || !uid2) {
    logger.error("Cannot send system message, one or both UIDs are missing.", { uid1, uid2 });
    return;
  }

  const chatId = [uid1, uid2].sort().join("_");
  logger.log(`Generated Chat ID: ${chatId}`);

  const chatDocRef = db.collection("privateChats").doc(chatId);
  const messagesCollectionRef = chatDocRef.collection("messages");

  const messageData = {
    text: messageText,
    createdAt: FieldValue.serverTimestamp(),
    system: true,
    user: {
      _id: "system",
      name: "YahdSell System",
    },
  };

  const chatMetadata = {
    lastMessage: {
      text: `[System] ${messageText.substring(0, 45)}...`,
      createdAt: FieldValue.serverTimestamp(),
      senderId: "system",
    },
    lastActivity: FieldValue.serverTimestamp(),
  };

  try {
    logger.log(`Writing message to subcollection: privateChats/${chatId}/messages`);
    await messagesCollectionRef.add(messageData);
    logger.log("Message document added successfully.");

    logger.log(`Updating metadata for chat document: privateChats/${chatId}`);
    await chatDocRef.set(chatMetadata, { merge: true });
    logger.log("Chat metadata updated successfully.");
    
    logger.info(`Successfully sent system message to chat: ${chatId}`);
  } catch (error) {
    logger.error(`FATAL: Error sending system message to chat ${chatId}.`, {
        error: error,
        chatId: chatId,
        messageData: messageData,
    });
  }
}

// --- NEW HELPER FUNCTION: To check for semantic match using AI ---
async function isSemanticMatch(searchQuery: string, product: any): Promise<boolean> {
  const apiKey = geminiApiKey.value();
  if (!apiKey) {
    logger.error("Gemini API key is not available for semantic match.");
    return false; // Default to no match if API key is missing
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `A user has a saved search for: "${searchQuery}". A new product has been listed with the title: "${product.name}" and description: "${product.description}". Based on the user's search, is this new product a good and relevant match? Please consider synonyms, related items, and context. Answer with only "yes" or "no".`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toLowerCase();

    logger.log(`Semantic match check for query "${searchQuery}" on product "${product.name}": AI responded with "${responseText}".`);

    return responseText === "yes";
  } catch (error) {
    logger.error("Error during semantic match API call:", {
      searchQuery,
      productName: product.name,
      error,
    });
    return false; // Default to no match on API error
  }
}


// --- Haversine Distance Calculation Helpers ---
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return null;
  }
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// --- Function 1: Update Seller Rating ---
export const updateSellerRating = onDocumentWritten(
  "reviews/{reviewId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const data = afterData || beforeData;

    if (!data) {
      logger.log(`No data found for review ${event.params.reviewId}, exiting.`);
      return;
    }
    const sellerId = data.sellerId;
    if (!sellerId) {
      logger.log(`Review ${event.params.reviewId} missing 'sellerId' field.`);
      return;
    }

    logger.log(`Recalculating rating for seller: ${sellerId} due to write on review ${event.params.reviewId}`);

    const sellerRef = db.collection("users").doc(sellerId);
    const reviewsQuery = db.collection("reviews").where("sellerId", "==", sellerId);

    try {
      const reviewsSnapshot = await reviewsQuery.get();
      let totalRatingSum = 0;
      const ratingCount = reviewsSnapshot.size;

      if (ratingCount > 0) {
        reviewsSnapshot.forEach((doc) => {
          const rating = Number(doc.data().rating) || 0;
          totalRatingSum += rating;
        });
      }

      const averageRating = ratingCount > 0 ? totalRatingSum / ratingCount : 0;
      const roundedAverage = Math.round(averageRating * 10) / 10;

      logger.log(`Seller ${sellerId}: Count=${ratingCount}, Sum=${totalRatingSum}, Avg=${roundedAverage}`);

      await sellerRef.set({ totalRatingSum, ratingCount, averageRating: roundedAverage }, { merge: true });

      logger.log(`Successfully updated ratings for seller ${sellerId}`);
    } catch (error: unknown) {
      logger.error(`Error updating rating for seller ${sellerId}:`, error);
    }
  });

// --- Function 2: Ask Gemini Chatbot ---
export const askGemini = onCall(async (request) => {
  const userPrompt = request.data.prompt;
  if (!userPrompt || typeof userPrompt !== "string" || userPrompt.trim().length === 0) {
    logger.warn("askGemini called without valid prompt.");
    throw new HttpsError("invalid-argument", "A non-empty 'prompt' string is required.");
  }

  const apiKey = geminiApiKey.value();
  if (!apiKey) {
    logger.error("Gemini API key parameter (GEMINI_API_KEY) is not defined.");
    throw new HttpsError("internal", "API key parameter not configured.");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    logger.info(`Calling Gemini for user ${request.auth?.uid || "anonymous"}...`);

    const generationRequest = {
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      safetySettings,
    };
    const result = await model.generateContent(generationRequest);
    const response = result.response;

    if (!response || response.promptFeedback?.blockReason) {
      logger.warn("Gemini response blocked.", { feedback: response?.promptFeedback });
      const reason = response?.promptFeedback?.blockReason || "Safety";
      throw new HttpsError("invalid-argument", `Request blocked (${reason}).`);
    }

    const botReply = response.text();
    logger.info("Received reply from Gemini.");
    return { reply: botReply };
  } catch (error: unknown) {
    logger.error("Error calling Google AI SDK (Gemini):", error);
    let clientErrorMessage = "Failed to process request with AI model.";
    if (error instanceof Error && error.message?.includes("SAFETY")) {
      clientErrorMessage = "Request blocked by safety filters.";
    } else if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", clientErrorMessage);
  }
});

// --- Function 3: Get Ranked Products ---
type ProductData = {
  id: string;
  score: number;
  distanceKm: number | null;
  sellerLocation?: GeoPoint;
  sellerAverageRating?: number;
  sellerRatingCount?: number;
  [key: string]: any;
};

export const getRankedProducts = onCall(
  async (request): Promise<{ products: ProductData[] }> => {
    logger.info("getRankedProducts called", { data: request.data });

    const buyerLat = request.data?.latitude;
    const buyerLon = request.data?.longitude;
    const hasBuyerLocation = (typeof buyerLat === "number" && typeof buyerLon === "number");

    const ratingWeight = 0.6;
    const distanceWeight = 0.4;
    const maxDistanceKm = 100;
    const initialLimit = 200;
    const finalLimit = 50;

    try {
      const productsRef = db.collection("products");
      const q = productsRef.orderBy("sellerAverageRating", "desc").orderBy("createdAt", "desc").limit(initialLimit);

      const productSnapshot = await q.get();
      const candidateProducts: ProductData[] = productSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        score: 0,
        distanceKm: null,
      }));

      logger.info(`Fetched ${candidateProducts.length} initial candidates.`);

      if (hasBuyerLocation) {
        candidateProducts.forEach((prod) => {
          let distanceKm: number | null = null;
          const sellerLoc = prod.sellerLocation;

          if (sellerLoc instanceof GeoPoint) {
            distanceKm = getDistanceFromLatLonInKm(buyerLat, buyerLon, sellerLoc.latitude, sellerLoc.longitude);
            prod.distanceKm = distanceKm;
          }

          const rating = prod.sellerAverageRating || 0;
          const normalizedRating = rating / 5.0;
          let normalizedDistanceFactor = 0;
          if (distanceKm !== null && distanceKm <= maxDistanceKm) {
            normalizedDistanceFactor = 1.0 - (distanceKm / maxDistanceKm);
          }
          prod.score = (ratingWeight * normalizedRating) + (distanceWeight * normalizedDistanceFactor);
        });

        candidateProducts.sort((a, b) => (b.score || 0) - (a.score || 0));
        logger.info("Products sorted by weighted score.");
      } else {
        logger.info("Buyer location not provided, using rating order.");
        candidateProducts.forEach((p) => {
          p.score = ratingWeight * (p.sellerAverageRating || 0) / 5.0;
        });
      }

      const rankedProducts = candidateProducts.slice(0, finalLimit);
      logger.info(`Returning ${rankedProducts.length} ranked products.`);
      return { products: rankedProducts };
    } catch (error: unknown) {
      logger.error("Error getting ranked products:", error);
      throw new HttpsError("internal", "Failed to retrieve product ranking.");
    }
  });

// --- SCHEDULED FUNCTION: Delete Old Products ---
export const deleteOldProducts = onSchedule("every 24 hours", async (event) => {
  logger.log("Running scheduled job: deleteOldProducts");
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);

  logger.log(`Querying for products created before: ${sevenDaysAgo.toISOString()}`);
  const oldProductsQuery = db.collection("products").where("createdAt", "<", sevenDaysAgoTimestamp).limit(500);

  try {
    const snapshot = await oldProductsQuery.get();
    if (snapshot.empty) {
      logger.log("No old products found to delete.");
      return;
    }
    logger.log(`Found ${snapshot.size} old products to delete.`);

    const firestoreBatch = db.batch();
    const deletePromises: Promise<any>[] = [];

    snapshot.docs.forEach((doc) => {
      const productData = doc.data();
      const productId = doc.id;
      const imagePathsArray = productData.imageStoragePaths;

      logger.log(`Preparing to delete product ${productId}`);
      firestoreBatch.delete(doc.ref);

      if (Array.isArray(imagePathsArray)) {
        imagePathsArray.forEach((path: string) => {
          if (path && typeof path === "string") {
            logger.log(`Preparing to delete image from array: ${path}`);
            const fileRef = bucket.file(path);
            deletePromises.push(
              fileRef.delete().catch((err: any) => {
                if (err.code === 404) {
                  logger.warn(`Image not found, skipping delete: ${path}`);
                } else {
                  logger.error(`Failed to delete image ${path} for product ${productId}:`, err);
                }
                return Promise.resolve();
              })
            );
          }
        });
      }
    });

    deletePromises.push(firestoreBatch.commit());
    await Promise.all(deletePromises);
    logger.log(`Successfully deleted ${snapshot.size} old products and attempted image cleanup.`);
    return;
  } catch (error) {
    logger.error("Error querying or deleting old products:", error);
    throw new Error("Failed to delete old products.");
  }
});

// --- FUNCTION: Update Product Info on User Profile Change ---
export const updateUserProductsOnProfileChange = onDocumentUpdated("users/{userId}", async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) {
      logger.log(`User data missing for update event on users/${event.params.userId}`);
      return;
    }

    const nameChanged = beforeData.displayName !== afterData.displayName;
    const picChanged = beforeData.profilePicUrl !== afterData.profilePicUrl;

    if (!nameChanged && !picChanged) {
      logger.log(`No relevant profile fields changed for user ${event.params.userId}. No product update needed.`);
      return;
    }

    const userId = event.params.userId;
    const productUpdates: { sellerDisplayName?: string; sellerProfilePicUrl?: string | null } = {};

    if (nameChanged) {
        productUpdates.sellerDisplayName = afterData.displayName;
        logger.log(`Display name changed for user ${userId} to "${afterData.displayName}".`);
    }
    if (picChanged) {
        productUpdates.sellerProfilePicUrl = afterData.profilePicUrl || null;
        logger.log(`Profile picture changed for user ${userId}.`);
    }

    const productsRef = db.collection("products");
    const query = productsRef.where("sellerId", "==", userId);

    try {
      const productSnapshot = await query.get();
      if (productSnapshot.empty) {
        logger.log(`No products found for seller ${userId}. No updates needed.`);
        return;
      }

      const batch = db.batch();
      productSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, productUpdates);
      });

      await batch.commit();
      logger.log(`Successfully updated ${productSnapshot.size} products for seller ${userId}.`);
    } catch (error) {
      logger.error(`Error updating products for seller ${userId} after profile change:`, error);
    }
  }
);

// --- NOTIFICATION FUNCTIONS ---
export const sendNewPrivateChatMessageNotification = onDocumentCreated("privateChats/{chatId}/messages/{messageId}", async (event) => {
    const messageData = event.data?.data();
    if (!messageData) return;
    
    const { user, text, image, system } = messageData;
    if (system || (!text && !image)) return;

    const senderId = user?._id;
    const senderName = user?.name || "Someone";
    const recipientId = event.params.chatId.split('_').find(id => id !== senderId);

    if (!senderId || !recipientId) return;

    const notificationPayload = {
        title: `New message from ${senderName}`,
        body: text || "Sent an image",
        type: "private_message",
        data: { type: "private_message", chatId: event.params.chatId, senderId, senderName, url: `yahdsell2://chat/${recipientId}` },
    };

    await storeNotificationRecord(recipientId, notificationPayload);
    await sendPushNotifications(recipientId, notificationPayload);
});

export const sendNewOfferNotificationToSeller = onDocumentCreated("products/{productId}/offers/{offerId}", async (event) => {
    const offerData = event.data?.data();
    if (!offerData) return;

    const currentProductId = event.params.productId;

    const { sellerId, buyerId, buyerName, offerAmount } = offerData;
    if (!sellerId || !buyerId) {
        logger.error("Offer created with missing sellerId or buyerId.", { offerId: event.params.offerId });
        return;
    }

    const productDoc = await db.collection("products").doc(currentProductId).get();
    const productName = productDoc.data()?.name || "your item";

    const notificationPayload = {
        title: `New Offer on "${productName}"`,
        body: `${buyerName} offered $${offerAmount.toFixed(2)}.`,
        type: "new_offer",
        data: { type: "new_offer", productId: currentProductId, offerId: event.params.offerId, url: `yahdsell2://product/${currentProductId}` },
    };

    await storeNotificationRecord(sellerId, notificationPayload);
    await sendPushNotifications(sellerId, notificationPayload);

    const chatMessage = `A new offer of $${offerAmount.toFixed(2)} was made by ${buyerName} for "${productName}".`;
    await sendSystemChatMessage(sellerId, buyerId, chatMessage);
});

export const sendOfferStatusUpdateNotificationToBuyer = onDocumentUpdated("products/{productId}/offers/{offerId}", async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData || beforeData.status === afterData.status) return;

    const currentProductId = event.params.productId;

    const { status, buyerId, sellerId, offerAmount } = afterData;
     if (!buyerId || !sellerId) {
        logger.error("Offer updated with missing sellerId or buyerId.", { offerId: event.params.offerId });
        return;
    }

    if (status !== "accepted" && status !== "rejected") return;
    
    const productDoc = await db.collection("products").doc(currentProductId).get();
    const productName = productDoc.data()?.name || "your offered item";

    const notificationPayload = {
        title: status === "accepted" ? `Offer Accepted for "${productName}"! 🎉` : `Offer Update for "${productName}"`,
        body: status === "accepted" ? `Your offer of $${offerAmount.toFixed(2)} has been accepted.` : `Regarding your offer of $${offerAmount.toFixed(2)}, the seller has made a decision.`,
        type: `offer_${status}`,
        data: { type: `offer_${status}`, productId: currentProductId, offerId: event.params.offerId, url: `yahdsell2://product/${currentProductId}` },
    };

    await storeNotificationRecord(buyerId, notificationPayload);
    await sendPushNotifications(buyerId, notificationPayload);

    let chatMessage = "";
    if (status === "accepted") {
        chatMessage = `🎉 Your offer of $${offerAmount.toFixed(2)} for "${productName}" was ACCEPTED! You can now arrange payment and collection.`;
    } else { // status === "rejected"
        chatMessage = `Regarding your offer of $${offerAmount.toFixed(2)} for "${productName}", the seller has declined the offer.`;
    }
    await sendSystemChatMessage(sellerId, buyerId, chatMessage);
});


// --- AI FUNCTION: Get AI-Powered Listing Suggestions (TITLE-BASED) ---
export const getListingDetailsFromTitle = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to use this feature.");
  }

  const { title } = request.data;
  if (!title || typeof title !== "string") {
    throw new HttpsError("invalid-argument", "A valid product title string is required.");
  }

  const apiKey = geminiApiKey.value();
  if (!apiKey) {
    logger.error("Gemini API key is not configured.");
    throw new HttpsError("internal", "API key not configured.");
  }

  try {
    logger.info("Initializing GoogleGenerativeAI for listing details from title.");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Based on the product title "${title}", generate a compelling and informative product description (2-3 sentences) for a marketplace listing. Also, suggest the most appropriate category from the provided list. Respond with a valid JSON object only, with the following structure: {"description": "...", "category": "..."}. Valid Categories: ${PRODUCT_CATEGORIES_FOR_AI.join(", ")}`;

    logger.info("Sending request to Gemini 1.5 Flash model.");
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const cleanedText = responseText.replace(/^```json\s*|```$/g, "").trim();
    
    logger.info("Received response from Gemini, parsing JSON.");
    const suggestions = JSON.parse(cleanedText);

    if (!PRODUCT_CATEGORIES_FOR_AI.includes(suggestions.category)) {
        logger.warn(`Gemini suggested an invalid category: "${suggestions.category}". Falling back to 'Other'.`);
        suggestions.category = "Other";
    }

    logger.info("Successfully generated listing details.", { suggestions });
    return { suggestions };

  } catch (error) {
    logger.error("Error calling Gemini Text API:", error);
    if (error instanceof SyntaxError) {
      throw new HttpsError("internal", "Failed to parse AI response. Please try again.");
    }
    throw new HttpsError("internal", "Could not generate suggestions at this time.");
  }
});


// --- SCHEDULED FUNCTION: Wishlist Expiry Notifications ---
export const notifyOnExpiringWishlistItems = onSchedule("every 24 hours", async (event) => {
    logger.log("Running scheduled job: notifyOnExpiringWishlistItems");

    const now = new Date();
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const sixDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(sixDaysAgo);
    const sevenDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);

    logger.log(`Querying for products created between ${sevenDaysAgo.toISOString()} and ${sixDaysAgo.toISOString()}`);

    const expiringProductsQuery = db.collection("products")
        .where("isSold", "==", false)
        .where("createdAt", ">=", sevenDaysAgoTimestamp)
        .where("createdAt", "<", sixDaysAgoTimestamp);

    try {
        const snapshot = await expiringProductsQuery.get();
        if (snapshot.empty) {
            logger.log("No products expiring in the next 24 hours. Job finished.");
            return;
        }

        logger.log(`Found ${snapshot.size} products expiring soon.`);

        for (const productDoc of snapshot.docs) {
            const product = productDoc.data();
            const productId = productDoc.id;
            const productName = product.name || "An item";

            logger.log(`Processing product: ${productName} (${productId})`);

            const wishlistQuery = db.collectionGroup('wishlist').where(admin.firestore.FieldPath.documentId(), '==', productId);
            const wishlistSnapshot = await wishlistQuery.get();

            if (wishlistSnapshot.empty) {
                logger.log(`No users have "${productName}" on their wishlist.`);
                continue;
            }

            for (const wishlistDoc of wishlistSnapshot.docs) {
                const userId = wishlistDoc.ref.parent.parent?.id;
                if (userId) {
                    logger.log(`Found user ${userId} who wants "${productName}". Preparing notification.`);
                    const notificationPayload = {
                        title: "Don't Miss Out! ⏳",
                        body: `An item on your wishlist, "${productName}", is expiring soon!`,
                        type: "wishlist_expiry_alert",
                        data: { type: "wishlist_expiry_alert", productId: productId, url: `yahdsell2://product/${productId}` },
                    };

                    await storeNotificationRecord(userId, notificationPayload);
                    await sendPushNotifications(userId, notificationPayload);
                }
            }
        }
        logger.log("Finished processing all expiring wishlist items.");

    } catch (error) {
        logger.error("Error in notifyOnExpiringWishlistItems job:", error);
        throw new Error("Failed to process expiring wishlist items.");
    }
});

// --- FUNCTION: Track Product Views ---
export const trackProductView = onCall(async (request) => {
    if (!request.auth) {
        logger.info("Unauthenticated user tried to track a view. Ignoring.");
        return { success: false, message: "Authentication required." };
    }

    const { productId } = request.data;
    if (!productId || typeof productId !== "string") {
        logger.warn("trackProductView called without a valid productId.");
        return { success: false, message: "Invalid productId." };
    }

    const productRef = db.collection("products").doc(productId);

    try {
        const productDoc = await productRef.get();
        if (!productDoc.exists) {
            logger.warn(`Product with ID ${productId} not found.`);
            return { success: false, message: "Product not found." };
        }

        const productData = productDoc.data();
        const sellerId = productData?.sellerId;

        if (sellerId === request.auth.uid) {
            logger.info(`Seller ${sellerId} viewed their own product ${productId}. Not counting view.`);
            return { success: false, message: "Seller viewing own product." };
        }

        await productRef.update({
            viewCount: FieldValue.increment(1)
        });

        logger.info(`Successfully tracked view for product ${productId} by user ${request.auth.uid}`);
        return { success: true };

    } catch (error) {
        logger.error(`Error tracking view for product ${productId}:`, error);
        return { success: false, message: "An internal error occurred." };
    }
});

// --- FUNCTION: Notify on New Matching Product (SMARTER VERSION) ---
export const notifyOnNewMatchingProduct = onDocumentCreated("products/{productId}", async (event) => {
    const newProduct = event.data?.data();
    if (!newProduct) {
        logger.log("No data in new product document. Exiting.");
        return;
    }

    logger.log(`New product created: ${newProduct.name} (${event.params.productId}). Checking saved searches.`);

    try {
        const savedSearchesSnapshot = await db.collectionGroup("savedSearches").get();
        if (savedSearchesSnapshot.empty) {
            logger.log("No saved searches in the database. Exiting.");
            return;
        }

        logger.log(`Found ${savedSearchesSnapshot.size} total saved searches to check.`);

        const notificationsToSend: Promise<void>[] = [];

        for (const doc of savedSearchesSnapshot.docs) {
            const search = doc.data();
            const userId = doc.ref.parent.parent?.id;

            if (!userId || userId === newProduct.sellerId) {
                continue; // Skip if no user ID or if it's the seller's own search
            }

            const criteria = search.criteria;
            let isMatch = true;

            // Check non-text criteria first
            if (criteria.category && newProduct.category !== criteria.category) isMatch = false;
            if (isMatch && criteria.condition && newProduct.condition !== criteria.condition) isMatch = false;
            if (isMatch && criteria.minPrice != null && newProduct.price < criteria.minPrice) isMatch = false;
            if (isMatch && criteria.maxPrice != null && newProduct.price > criteria.maxPrice) isMatch = false;

            // If other criteria match and a search query exists, perform the smart check
            if (isMatch && criteria.searchQuery) {
                isMatch = await isSemanticMatch(criteria.searchQuery, newProduct);
            }

            if (isMatch) {
                logger.log(`Product "${newProduct.name}" is a match for search "${search.name}" for user ${userId}.`);
                const notificationPayload = {
                    title: "New Item Alert!",
                    body: `A new item matching your search "${search.name}" was just listed: ${newProduct.name}`,
                    type: "saved_search_match",
                    data: { type: "saved_search_match", productId: event.params.productId, url: `yahdsell2://product/${event.params.productId}` },
                };
                
                notificationsToSend.push(storeNotificationRecord(userId, notificationPayload));
                notificationsToSend.push(sendPushNotifications(userId, notificationPayload));
            }
        }

        await Promise.all(notificationsToSend);
        logger.log("Finished processing new product against saved searches.");

    } catch (error) {
        logger.error("Error in notifyOnNewMatchingProduct function:", error);
    }
});


// --- NEW FUNCTION: Get Products in Region for Map ---
export const getProductsInRegion = onCall(async (request) => {
    const { latitude, longitude, radius } = request.data;

    if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof radius !== 'number') {
        throw new HttpsError('invalid-argument', 'Latitude, longitude, and radius must be numbers.');
    }

    try {
        const productsSnapshot = await db.collection('products')
            .where('isSold', '==', false)
            .orderBy('createdAt', 'desc')
            .limit(500)
            .get();

        const nearbyProducts: ProductData[] = [];

        productsSnapshot.forEach(doc => {
            const product = doc.data() as ProductData;
            product.id = doc.id;
            
            // --- FIX: Use a more robust check for the GeoPoint object ---
            if (product.sellerLocation && typeof product.sellerLocation.latitude === 'number' && typeof product.sellerLocation.longitude === 'number') {
                const distance = getDistanceFromLatLonInKm(
                    latitude,
                    longitude,
                    product.sellerLocation.latitude,
                    product.sellerLocation.longitude
                );

                if (distance !== null && distance <= radius) {
                    product.distanceKm = distance;
                    nearbyProducts.push(product);
                }
            }
        });
        
        logger.info(`Found ${nearbyProducts.length} products within ${radius}km.`);
        return { products: nearbyProducts };

    } catch (error) {
        logger.error('Error fetching products by region:', error);
        throw new HttpsError('internal', 'Could not retrieve products for the map.');
    }
});
