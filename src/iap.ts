/**
 * In-App Purchases Service
 *
 * Uses react-native-iap v14 for native Apple/Google subscription management.
 * Product IDs must match those configured in App Store Connect / Google Play Console.
 *
 * Flow:
 * 1. initIAP() – connect to the store and fetch products
 * 2. User selects a plan → purchaseSubscription()
 * 3. purchaseUpdatedListener fires with receipt
 * 4. Receipt is sent to Convex backend for validation & activation
 * 5. finishTransaction() acknowledges the purchase
 */

import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getAvailablePurchases,
  type Purchase,
  type ProductSubscription,
  type PurchaseError,
  type EventSubscription,
} from 'react-native-iap';

// ─── Product IDs ───
// These must match the subscription product IDs in App Store Connect / Google Play Console
export const IAP_PRODUCT_IDS = {
  monthly: 'com.unlocked.escapeapp.pro.monthly',
  yearly: 'com.unlocked.escapeapp.pro.yearly',
};

export const ALL_PRODUCT_IDS = [IAP_PRODUCT_IDS.monthly, IAP_PRODUCT_IDS.yearly];

let isConnected = false;

// ─── Initialize IAP connection ───
export async function initIAP(): Promise<void> {
  try {
    await initConnection();
    isConnected = true;
    console.log('[IAP] Connected to store');
  } catch (err) {
    console.warn('[IAP] Failed to connect:', err);
    isConnected = false;
  }
}

// ─── Disconnect IAP ───
export async function disconnectIAP(): Promise<void> {
  if (isConnected) {
    try {
      await endConnection();
      isConnected = false;
      console.log('[IAP] Disconnected from store');
    } catch (err) {
      console.warn('[IAP] Error disconnecting:', err);
    }
  }
}

// ─── Fetch available subscription products ───
export async function fetchSubscriptionProducts(): Promise<ProductSubscription[]> {
  if (!isConnected) {
    console.warn('[IAP] Not connected — call initIAP() first');
    return [];
  }
  try {
    const subscriptions = (await fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' })) as ProductSubscription[];
    console.log('[IAP] Fetched subscriptions:', subscriptions.length);
    return subscriptions;
  } catch (err) {
    console.warn('[IAP] Failed to fetch subscriptions:', err);
    return [];
  }
}

// ─── Purchase a subscription ───
export async function purchaseSubscription(
  plan: 'monthly' | 'yearly'
): Promise<void> {
  const sku = IAP_PRODUCT_IDS[plan];
  try {
    if (Platform.OS === 'android') {
      await requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [sku],
          },
        },
      });
    } else {
      await requestPurchase({
        type: 'subs',
        request: {
          apple: {
            sku,
          },
        },
      });
    }
  } catch (err) {
    console.error('[IAP] Purchase error:', err);
    throw err;
  }
}

// ─── Restore previous purchases ───
export async function restorePurchases(): Promise<Purchase[]> {
  try {
    const purchases = await getAvailablePurchases({
      onlyIncludeActiveItemsIOS: true,
    });
    console.log('[IAP] Restored purchases:', purchases.length);
    return purchases;
  } catch (err) {
    console.warn('[IAP] Failed to restore purchases:', err);
    throw err;
  }
}

// ─── Finish / acknowledge a transaction ───
export async function acknowledgePurchase(
  purchase: Purchase
): Promise<void> {
  try {
    await finishTransaction({ purchase, isConsumable: false });
    console.log('[IAP] Transaction finished:', purchase.id);
  } catch (err) {
    console.warn('[IAP] Failed to finish transaction:', err);
  }
}

// ─── Extract receipt data for server validation ───
export function extractReceiptData(purchase: Purchase) {
  return {
    productId: purchase.productId,
    transactionId: purchase.id,
    transactionReceipt: purchase.purchaseToken ?? '',
    platform: Platform.OS as 'ios' | 'android',
    purchaseToken: purchase.purchaseToken ?? undefined,
  };
}

// ─── Listener setup helpers ───
export function onPurchaseUpdated(
  callback: (purchase: Purchase) => void
): EventSubscription {
  return purchaseUpdatedListener(callback);
}

export function onPurchaseError(
  callback: (error: PurchaseError) => void
): EventSubscription {
  return purchaseErrorListener(callback);
}
