import webpush from 'web-push';
import { getDBVapidKeys, saveDBVapidKeys, getDBSubscriptions } from './db.js';

let vapidKeys = null;

export const initPushService = async () => {
  try {
    // Tenta carregar chaves salvas no Firestore ou JSON local
    let keys = await getDBVapidKeys();
    
    if (!keys) {
      console.log('[PUSH] Generating new VAPID key pair...');
      keys = webpush.generateVAPIDKeys();
      await saveDBVapidKeys(keys);
    }
    
    vapidKeys = keys;
    
    webpush.setVapidDetails(
      'mailto:rafael.lucatto@gmail.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    
    console.log('[PUSH] Web Push Service initialized successfully.');
  } catch (err) {
    console.error('[PUSH] Failed to initialize Web Push Service:', err.message);
  }
};

export const getPublicKey = () => {
  return vapidKeys ? vapidKeys.publicKey : null;
};

export const sendPushToAll = async (title, body) => {
  try {
    const subscriptions = await getDBSubscriptions();
    if (subscriptions.length === 0) {
      console.log('[PUSH] No registered subscriptions found. Skipping push broadcast.');
      return;
    }

    console.log(`[PUSH] Broadcasting message "${title}" to ${subscriptions.length} subscription(s)...`);
    const payload = JSON.stringify({ title, body });

    const promises = subscriptions.map((sub) => {
      return webpush.sendNotification(sub, payload).catch((err) => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // A inscrição expirou ou foi cancelada pelo usuário. Deveríamos limpar futuramente, mas ignoramos no log por agora.
          console.warn('[PUSH] Expired subscription found and skipped.');
        } else {
          console.error('[PUSH] Error sending push to endpoint:', sub.endpoint, err.message);
        }
      });
    });

    await Promise.all(promises);
  } catch (err) {
    console.error('[PUSH] Error during push broadcast:', err.message);
  }
};
