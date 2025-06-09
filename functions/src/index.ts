// functions/src/index.ts (Storing Notification Records in Firestore)

import * as admin from "firebase-admin";
// Import v2 triggers, logger, and parameters
import { FieldValue, GeoPoint, getFirestore } from "firebase-admin/firestore"; // Added FieldValue
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

// --- Helper function to store notification record ---
async function storeNotificationRecord(
  recipientId: string,
  notificationPayload: {
    title: string;
    body: string;
    type: string;
    data: any; // This is the data object sent with the push notification
    // Add any other specific fields you want to store, e.g., senderId if not in data
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
                               .doc(); // Auto-generate ID

    await notificationRef.set({
      ...notificationPayload, // Spread the title, body, type, data
      recipientId: recipientId, // Store recipientId for potential queries
      createdAt: FieldValue.serverTimestamp(), // Use FieldValue for server timestamp
      isRead: false,
    });
    logger.log(`Notification record stored for recipient ${recipientId}, ID: ${notificationRef.id}`);
  } catch (error) {
    logger.error(`Error storing notification record for recipient ${recipientId}:`, error);
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
// --- End Haversine ---


// --- Function 1: Update Seller Rating ---
export const updateSellerRating = onDocumentWritten(
  "reviews/{reviewId}",
  async (event) => {
    // ... (existing code)
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const data = afterData || beforeData;

    if (!data) {
      logger.log(
        `No data found for review ${event.params.reviewId}, exiting.`
      );
      return;
    }
    const sellerId = data.sellerId;
    if (!sellerId) {
      logger.log(
        `Review ${event.params.reviewId} missing 'sellerId' field.`
      );
      return;
    }

    logger.log(
      `Recalculating rating for seller: ${sellerId} ` +
      `due to write on review ${event.params.reviewId}`
    );

    const sellerRef = db.collection("users").doc(sellerId);
    const reviewsQuery = db.collection("reviews")
      .where("sellerId", "==", sellerId);

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

      logger.log(
        `Seller ${sellerId}: Count=${ratingCount}, ` +
        `Sum=${totalRatingSum}, Avg=${roundedAverage}`
      );

      await sellerRef.set(
        {
          totalRatingSum,
          ratingCount,
          averageRating: roundedAverage,
        },
        {
          merge: true,
        }
      );

      logger.log(
        `Successfully updated ratings for seller ${sellerId}`
      );
    } catch (error: unknown) {
      const errorPrefix = "Error updating rating for seller ";
      const errorMessage = errorPrefix + sellerId + ":";
      logger.error(errorMessage, error);
    }
  });

// --- Function 2: Ask Gemini Chatbot ---
export const askGemini = onCall(async (request) => {
  // ... (existing code)
  const userPrompt = request.data.prompt;
  if (
    !userPrompt ||
    typeof userPrompt !== "string" ||
    userPrompt.trim().length === 0
  ) {
    logger.warn("askGemini called without valid prompt.");
    throw new HttpsError(
      "invalid-argument",
      "A non-empty 'prompt' string is required."
    );
  }

  const apiKey = geminiApiKey.value();

  if (!apiKey) {
    logger.error(
      "Gemini API key parameter (GEMINI_API_KEY) is not defined " +
      "for this function environment."
    );
    throw new HttpsError("internal", "API key parameter not configured.");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    logger.info(
      `Calling Gemini for user ${request.auth?.uid || "anonymous"}...`
    );

    const generationRequest = {
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      safetySettings,
    };
    const result = await model.generateContent(generationRequest);
    const response = result.response;

    if (!response || response.promptFeedback?.blockReason) {
      logger.warn("Gemini response blocked.",
        { feedback: response?.promptFeedback });
      const reason = response?.promptFeedback?.blockReason || "Safety";
      throw new HttpsError("invalid-argument", `Request blocked (${reason}).`);
    }

    const botReply = response.text();
    logger.info("Received reply from Gemini.");

    return { reply: botReply };
  } catch (error: unknown) {
    const errorMessage = "Error calling Google AI SDK (Gemini):";
    logger.error(errorMessage, error);
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
    // ... (existing code)
    logger.info("getRankedProducts called", { data: request.data });

    const buyerLat = request.data?.latitude;
    const buyerLon = request.data?.longitude;
    const hasBuyerLocation = (
      typeof buyerLat === "number" && typeof buyerLon === "number"
    );

    const ratingWeight = 0.6; const distanceWeight = 0.4;
    const maxDistanceKm = 100; const initialLimit = 200;
    const finalLimit = 50;

    try {
      const productsRef = db.collection("products");
      const q = productsRef
        .orderBy("sellerAverageRating", "desc")
        .orderBy("createdAt", "desc")
        .limit(initialLimit);

      const productSnapshot = await q.get();
      const candidateProducts: ProductData[] = productSnapshot.docs.map(
        (doc) => ({
          id: doc.id,
          ...doc.data(),
          score: 0,
          distanceKm: null,
        })
      );

      logger.info(`Fetched ${candidateProducts.length} initial candidates.`);

      if (hasBuyerLocation) {
        candidateProducts.forEach((prod) => {
          let distanceKm: number | null = null;
          const sellerLoc = prod.sellerLocation;

          if (sellerLoc instanceof GeoPoint) {
            distanceKm = getDistanceFromLatLonInKm(
              buyerLat, buyerLon,
              sellerLoc.latitude, sellerLoc.longitude
            );
            prod.distanceKm = distanceKm;
          }

          const rating = prod.sellerAverageRating || 0;
          const normalizedRating = rating / 5.0;
          let normalizedDistanceFactor = 0;
          if (distanceKm !== null && distanceKm <= maxDistanceKm) {
            normalizedDistanceFactor = 1.0 - (distanceKm / maxDistanceKm);
          }
          prod.score = (ratingWeight * normalizedRating) +
            (distanceWeight * normalizedDistanceFactor);
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
  // ... (existing code)
  logger.log("Running scheduled job: deleteOldProducts");
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);

  logger.log(`Querying for products created before: ${sevenDaysAgo.toISOString()}`);
  const oldProductsQuery = db.collection("products")
    .where("createdAt", "<", sevenDaysAgoTimestamp)
    .limit(500);

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
      const imagePath = productData.imageStoragePath;
      const imagePathsArray = productData.imageStoragePaths;

      logger.log(`Preparing to delete product ${productId}`);
      firestoreBatch.delete(doc.ref);

      if (imagePath && typeof imagePath === "string") {
        logger.log(`Preparing to delete image: ${imagePath}`);
        const fileRef = bucket.file(imagePath);
        deletePromises.push(
          fileRef.delete().catch((err: any) => {
            if (err.code === 404) {
              logger.warn(`Image not found, skipping delete: ${imagePath}`);
            } else {
              logger.error(`Failed to delete image ${imagePath} for product ${productId}:`, err);
            }
            return Promise.resolve();
          })
        );
      }
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
      if (!imagePath && !imagePathsArray) {
         logger.warn(`No valid imageStoragePath or imageStoragePaths found for product ${productId}.`);
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
export const updateUserProductsOnProfileChange = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    // ... (existing code)
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
        const productRef = doc.ref;
        logger.log(`Adding update for product ${doc.id}`);
        batch.update(productRef, productUpdates);
      });

      await batch.commit();
      logger.log(`Successfully updated products for seller ${userId}.`);
    } catch (error) {
      logger.error(`Error updating products for seller ${userId} after profile change:`, error);
      throw new Error(`Failed to update products for user ${userId}`);
    }
  }
);

// --- FUNCTION: Send Notification for New Private Chat Message ---
export const sendNewPrivateChatMessageNotification = onDocumentCreated(
  "privateChats/{chatId}/messages/{messageId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.log("No data associated with the event for new private chat message.");
      return;
    }
    const messageData = snapshot.data();
    const chatId = event.params.chatId;
    const messageId = event.params.messageId;
    if (!messageData || !messageData.user || !messageData.user._id) {
      logger.warn("Message data or sender ID missing.", { chatId, messageId });
      return;
    }
    if (messageData.system || (!messageData.text && !messageData.image)) {
      logger.log("Message is system or has no content, skipping.", { chatId, messageId });
      return;
    }
    const senderId = messageData.user._id;
    const senderName = messageData.user.name || "Someone";
    const messageText = messageData.text || (messageData.image ? "Sent an image" : "Sent a message");
    const participants = chatId.split("_");
    if (participants.length !== 2) {
      logger.error("Invalid chatId format.", { chatId });
      return;
    }
    const recipientId = participants.find((pId) => pId !== senderId);
    if (!recipientId) {
      logger.error("Could not determine recipientId.", { chatId, senderId });
      return;
    }

    // Prepare notification payload for storing and sending
    const notificationTitle = `New message from ${senderName}`;
    const notificationBody = messageText.length > 150 ? messageText.substring(0, 147) + "..." : messageText;
    const notificationType = "private_message";
    const notificationDeepLinkData = {
        type: notificationType,
        chatId: chatId,
        senderId: senderId, // This will be the recipient for the client when opening chat
        senderName: senderName,
    };

    // Store notification record
    await storeNotificationRecord(recipientId, {
        title: notificationTitle,
        body: notificationBody,
        type: notificationType,
        data: notificationDeepLinkData, // Store the same data used for push
    });

    // Get recipient's push tokens
    const tokensSnapshot = await db.collection("users").doc(recipientId).collection("pushTokens").get();
    if (tokensSnapshot.empty) {
      logger.log(`No push tokens found for recipient ${recipientId}.`);
      return;
    }
    const pushTokens: string[] = [];
    tokensSnapshot.forEach((tokenDoc) => {
      const tokenData = tokenDoc.data();
      if (tokenData.token && typeof tokenData.token === "string") {
        pushTokens.push(tokenData.token);
      }
    });
    if (pushTokens.length === 0) {
      logger.log(`No valid push tokens strings found for recipient ${recipientId}.`);
      return;
    }

    const messages = [];
    for (const pushToken of pushTokens) {
      if (!Expo.isExpoPushToken(pushToken)) {
        logger.warn(`Push token ${pushToken} is not valid.`);
        continue;
      }
      messages.push({
        to: pushToken,
        sound: "default",
        title: notificationTitle,
        body: notificationBody,
        data: notificationDeepLinkData,
      });
    }
    if (messages.length === 0) {
      logger.log("No valid messages to send.", { recipientId });
      return;
    }
    const chunks = expo.chunkPushNotifications(messages);
    try {
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      logger.log(`Successfully sent private message notifications to ${recipientId}.`);
    } catch (error) {
      logger.error("Error sending private message push notifications:", error);
    }
  }
);

// --- FUNCTION: Send Notification to Seller for New Offer ---
export const sendNewOfferNotificationToSeller = onDocumentCreated(
  "products/{productId}/offers/{offerId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.log("No data associated with the event for new offer.");
      return;
    }
    const offerData = snapshot.data();
    const productId = event.params.productId;
    if (!offerData || !offerData.buyerId || !offerData.sellerId || offerData.offerAmount == null || !offerData.buyerName) {
      logger.warn("Offer data missing required fields. Cannot send notification.", { productId });
      return;
    }
    const sellerId = offerData.sellerId;
    const buyerName = offerData.buyerName || "Someone";
    const offerAmount = offerData.offerAmount;
    let productName = "your item";
    try {
      const productDoc = await db.collection("products").doc(productId).get();
      if (productDoc.exists) {
        productName = productDoc.data()?.name || productName;
      }
    } catch (error) {
      logger.error(`Error fetching product ${productId} details:`, error);
    }

    const notificationTitle = `New Offer on "${productName}"`;
    const notificationBody = `${buyerName} offered $${offerAmount.toFixed(2)}.`;
    const notificationType = "new_offer";
    const notificationDeepLinkData = {
        type: notificationType,
        productId: productId,
        offerId: event.params.offerId,
        productName: productName,
    };

    await storeNotificationRecord(sellerId, {
        title: notificationTitle,
        body: notificationBody,
        type: notificationType,
        data: notificationDeepLinkData,
    });

    const tokensSnapshot = await db.collection("users").doc(sellerId).collection("pushTokens").get();
    if (tokensSnapshot.empty) {
      logger.log(`No push tokens found for seller ${sellerId}.`);
      return;
    }
    const pushTokens: string[] = [];
    tokensSnapshot.forEach((tokenDoc) => {
        const tokenData = tokenDoc.data();
        if (tokenData.token && typeof tokenData.token === "string") {
            pushTokens.push(tokenData.token);
        }
    });
    if (pushTokens.length === 0) {
      logger.log(`No valid push tokens for seller ${sellerId}.`);
      return;
    }
    const messages = [];
    for (const pushToken of pushTokens) {
      if (!Expo.isExpoPushToken(pushToken)) {
        logger.warn(`Push token ${pushToken} for seller ${sellerId} is not valid.`);
        continue;
      }
      messages.push({
        to: pushToken,
        sound: "default",
        title: notificationTitle,
        body: notificationBody,
        data: notificationDeepLinkData,
      });
    }
    if (messages.length === 0) {
      logger.log("No valid messages to send for new offer.", { sellerId, productId });
      return;
    }
    const chunks = expo.chunkPushNotifications(messages);
    try {
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      logger.log(`Successfully sent new offer notifications to seller ${sellerId}.`);
    } catch (error) {
      logger.error("Error sending new offer push notifications:", error);
    }
  }
);

// --- FUNCTION: Send Notification to Buyer on Offer Status Update ---
export const sendOfferStatusUpdateNotificationToBuyer = onDocumentUpdated(
  "products/{productId}/offers/{offerId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData) {
      logger.log("Offer data missing for update event.");
      return;
    }
    const oldStatus = beforeData.status;
    const newStatus = afterData.status;
    const productId = event.params.productId;
    if (oldStatus === newStatus || (newStatus !== "accepted" && newStatus !== "rejected")) {
      logger.log(`Offer status did not change to accepted/rejected. No notification.`);
      return;
    }
    const buyerId = afterData.buyerId;
    const offerAmount = afterData.offerAmount;
    if (!buyerId || offerAmount == null) {
      logger.warn(`Offer missing buyerId or offerAmount. Cannot send status update.`);
      return;
    }
    let productName = "your offered item";
    try {
      const productDoc = await db.collection("products").doc(productId).get();
      if (productDoc.exists) {
        productName = productDoc.data()?.name || productName;
      }
    } catch (error) {
      logger.error(`Error fetching product ${productId} for offer status:`, error);
    }

    let notificationTitle = "";
    let notificationBody = "";
    let notificationType = "";
    if (newStatus === "accepted") {
      notificationTitle = `Offer Accepted for "${productName}"! 🎉`;
      notificationBody = `Your offer of $${offerAmount.toFixed(2)} has been accepted.`;
      notificationType = "offer_accepted";
    } else if (newStatus === "rejected") {
      notificationTitle = `Offer Update for "${productName}"`;
      notificationBody = `Regarding your offer of $${offerAmount.toFixed(2)}, the seller has made a decision.`;
      notificationType = "offer_rejected";
    }

    const notificationDeepLinkData = {
        type: notificationType,
        productId: productId,
        offerId: event.params.offerId,
        productName: productName,
    };

    await storeNotificationRecord(buyerId, {
        title: notificationTitle,
        body: notificationBody,
        type: notificationType,
        data: notificationDeepLinkData,
    });

    const tokensSnapshot = await db.collection("users").doc(buyerId).collection("pushTokens").get();
    if (tokensSnapshot.empty) {
      logger.log(`No push tokens for buyer ${buyerId}.`);
      return;
    }
    const pushTokens: string[] = [];
    tokensSnapshot.forEach((tokenDoc) => {
        const tokenData = tokenDoc.data();
        if (tokenData.token && typeof tokenData.token === "string") {
            pushTokens.push(tokenData.token);
        }
    });
    if (pushTokens.length === 0) {
      logger.log(`No valid push tokens for buyer ${buyerId}.`);
      return;
    }
    const messages = [];
    for (const pushToken of pushTokens) {
      if (!Expo.isExpoPushToken(pushToken)) {
        logger.warn(`Push token ${pushToken} for buyer ${buyerId} is not valid.`);
        continue;
      }
      messages.push({
        to: pushToken,
        sound: "default",
        title: notificationTitle,
        body: notificationBody,
        data: notificationDeepLinkData,
      });
    }
    if (messages.length === 0) {
      logger.log("No valid messages for offer status update.", { buyerId, productId });
      return;
    }
    const chunks = expo.chunkPushNotifications(messages);
    try {
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      logger.log(`Successfully sent offer status update notifications to buyer ${buyerId}.`);
    } catch (error) {
      logger.error("Error sending offer status update notifications:", error);
    }
  }
);
