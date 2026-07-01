import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.dirname(__dirname);

// Local files for fallback when Firebase is not configured
const PREFS_FILE = path.join(BACKEND_DIR, 'preferences.json');
const TAGS_FILE = path.join(BACKEND_DIR, 'tags.json');
const TOKENS_FILE = path.join(BACKEND_DIR, 'tokens.json');

let db = null;
let isFirebaseInitialized = false;

// Attempt to initialize Firebase Admin SDK
try {
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  const localKeyPath = path.join(BACKEND_DIR, 'firebase-key.json');

  if (serviceAccountVar) {
    console.log('[DB] Initializing Firebase Admin with FIREBASE_SERVICE_ACCOUNT env var...');
    const serviceAccount = JSON.parse(serviceAccountVar);
    initializeApp({
      credential: cert(serviceAccount)
    });
    db = getFirestore();
    isFirebaseInitialized = true;
  } else if (fs.existsSync(localKeyPath)) {
    console.log('[DB] Initializing Firebase Admin with local firebase-key.json...');
    const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount)
    });
    db = getFirestore();
    isFirebaseInitialized = true;
  } else {
    console.log('[DB] Firebase credentials not found. Falling back to local JSON files.');
  }
} catch (error) {
  console.error('[DB] Failed to initialize Firebase Admin:', error.message);
  console.log('[DB] Falling back to local JSON files.');
}

let isPrefsMigrated = false;
let isTokensMigrated = false;
let isTagsMigrated = false;

// ----------------- Preferences -----------------
export const getDBPreferences = async (defaultPrefs) => {
  if (isFirebaseInitialized) {
    try {
      const doc = await db.collection('settings').doc('preferences').get();
      if (doc.exists) {
        return { ...defaultPrefs, ...doc.data() };
      } else {
        // First run after Firebase is enabled: Migrate local preferences to Firestore
        if (fs.existsSync(PREFS_FILE) && !isPrefsMigrated) {
          isPrefsMigrated = true;
          try {
            const content = fs.readFileSync(PREFS_FILE, 'utf8');
            const localPrefs = JSON.parse(content);
            console.log('[DB] Migrating local preferences.json to Firestore...');
            await db.collection('settings').doc('preferences').set(localPrefs);
            return { ...defaultPrefs, ...localPrefs };
          } catch (migrateErr) {
            console.error('[DB] Failed to migrate local preferences to Firestore:', migrateErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[DB] Error getting preferences from Firestore:', err.message);
    }
  }
  // Local fallback
  if (fs.existsSync(PREFS_FILE)) {
    try {
      const content = fs.readFileSync(PREFS_FILE, 'utf8');
      return { ...defaultPrefs, ...JSON.parse(content) };
    } catch (err) {
      console.error('[DB] Error reading local preferences:', err.message);
    }
  }
  return defaultPrefs;
};

export const saveDBPreferences = async (preferences) => {
  if (isFirebaseInitialized) {
    try {
      await db.collection('settings').doc('preferences').set(preferences);
      console.log('[DB] Preferences saved successfully to Firestore.');
    } catch (err) {
      console.error('[DB] Error saving preferences to Firestore:', err.message);
    }
  }
  // Local fallback (always write locally too for redundancy/dev)
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify(preferences, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Error writing preferences to local file:', err.message);
  }
};

// ----------------- Tokens -----------------
export const getDBTokens = async () => {
  if (isFirebaseInitialized) {
    try {
      const doc = await db.collection('settings').doc('tokens').get();
      if (doc.exists) {
        return doc.data();
      } else {
        // Migrate local tokens to Firestore
        if (fs.existsSync(TOKENS_FILE) && !isTokensMigrated) {
          isTokensMigrated = true;
          try {
            const content = fs.readFileSync(TOKENS_FILE, 'utf8');
            const localTokens = JSON.parse(content);
            console.log('[DB] Migrating local tokens.json to Firestore...');
            await db.collection('settings').doc('tokens').set(localTokens);
            return localTokens;
          } catch (migrateErr) {
            console.error('[DB] Failed to migrate local tokens to Firestore:', migrateErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[DB] Error getting tokens from Firestore:', err.message);
    }
  }
  // Local fallback
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      const content = fs.readFileSync(TOKENS_FILE, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error('[DB] Error reading local tokens:', err.message);
    }
  }
  return null;
};

export const saveDBTokens = async (tokens) => {
  if (isFirebaseInitialized) {
    try {
      await db.collection('settings').doc('tokens').set(tokens);
      console.log('[DB] Tokens saved successfully to Firestore.');
    } catch (err) {
      console.error('[DB] Error saving tokens to Firestore:', err.message);
    }
  }
  // Local fallback
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Error writing tokens to local file:', err.message);
  }
};

export const deleteDBTokens = async () => {
  if (isFirebaseInitialized) {
    try {
      await db.collection('settings').doc('tokens').delete();
      console.log('[DB] Tokens deleted successfully from Firestore.');
    } catch (err) {
      console.error('[DB] Error deleting tokens from Firestore:', err.message);
    }
  }
  // Local fallback
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      fs.unlinkSync(TOKENS_FILE);
    }
  } catch (err) {
    console.error('[DB] Error deleting local tokens:', err.message);
  }
};

// ----------------- Tags -----------------
export const getDBTags = async (defaultState) => {
  if (isFirebaseInitialized) {
    try {
      const doc = await db.collection('settings').doc('tags').get();
      if (doc.exists) {
        return doc.data();
      } else {
        // Migrate local tags to Firestore
        if (fs.existsSync(TAGS_FILE) && !isTagsMigrated) {
          isTagsMigrated = true;
          try {
            const content = fs.readFileSync(TAGS_FILE, 'utf8');
            const localTags = JSON.parse(content);
            console.log('[DB] Migrating local tags.json to Firestore...');
            await db.collection('settings').doc('tags').set(localTags);
            return localTags;
          } catch (migrateErr) {
            console.error('[DB] Failed to migrate local tags to Firestore:', migrateErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[DB] Error getting tags from Firestore:', err.message);
    }
  }
  // Local fallback
  if (fs.existsSync(TAGS_FILE)) {
    try {
      const content = fs.readFileSync(TAGS_FILE, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error('[DB] Error reading local tags:', err.message);
    }
  }
  return defaultState;
};

export const saveDBTags = async (tagsData) => {
  if (isFirebaseInitialized) {
    try {
      await db.collection('settings').doc('tags').set(tagsData);
      console.log('[DB] Tags saved successfully to Firestore.');
    } catch (err) {
      console.error('[DB] Error saving tags to Firestore:', err.message);
    }
  }
  // Local fallback
  try {
    fs.writeFileSync(TAGS_FILE, JSON.stringify(tagsData, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Error writing tags to local file:', err.message);
  }
};

// ----------------- Web Push / PWA -----------------
export const getDBSubscriptions = async () => {
  if (isFirebaseInitialized) {
    try {
      const doc = await db.collection('settings').doc('subscriptions').get();
      if (doc.exists) {
        return doc.data().list || [];
      }
    } catch (err) {
      console.error('[DB] Error getting subscriptions from Firestore:', err.message);
    }
  }
  // Local fallback
  const SUBS_FILE = path.join(BACKEND_DIR, 'subscriptions.json');
  if (fs.existsSync(SUBS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
    } catch (e) {
      console.error('[DB] Error reading subscriptions.json:', e.message);
    }
  }
  return [];
};

export const saveDBSubscription = async (subscription) => {
  const current = await getDBSubscriptions();
  const exists = current.some(sub => sub.endpoint === subscription.endpoint);
  if (!exists) {
    current.push(subscription);
    if (isFirebaseInitialized) {
      try {
        await db.collection('settings').doc('subscriptions').set({ list: current });
        console.log('[DB] Subscription saved successfully to Firestore.');
      } catch (err) {
        console.error('[DB] Error saving subscription to Firestore:', err.message);
      }
    }
    // Local fallback
    const SUBS_FILE = path.join(BACKEND_DIR, 'subscriptions.json');
    try {
      fs.writeFileSync(SUBS_FILE, JSON.stringify(current, null, 2), 'utf8');
    } catch (err) {
      console.error('[DB] Error writing subscriptions to local file:', err.message);
    }
  }
};

export const getDBVapidKeys = async () => {
  if (isFirebaseInitialized) {
    try {
      const doc = await db.collection('settings').doc('vapid_keys').get();
      if (doc.exists) {
        return doc.data();
      }
    } catch (err) {
      console.error('[DB] Error getting VAPID keys from Firestore:', err.message);
    }
  }
  // Local fallback
  const VAPID_FILE = path.join(BACKEND_DIR, 'vapid_keys.json');
  if (fs.existsSync(VAPID_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
    } catch (e) {
      console.error('[DB] Error reading vapid_keys.json:', e.message);
    }
  }
  return null;
};

export const saveDBVapidKeys = async (keys) => {
  if (isFirebaseInitialized) {
    try {
      await db.collection('settings').doc('vapid_keys').set(keys);
    } catch (err) {
      console.error('[DB] Error saving VAPID keys to Firestore:', err.message);
    }
  }
  const VAPID_FILE = path.join(BACKEND_DIR, 'vapid_keys.json');
  try {
    fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Error writing VAPID keys to local file:', err.message);
  }
};

const LOCATIONS_FILE = path.join(BACKEND_DIR, 'locations.json');

export const saveDBLocationRecord = async (locationRecord) => {
  if (isFirebaseInitialized) {
    try {
      await db.collection('locations').add(locationRecord);
      console.log('[DB] Location record saved to Firestore.');
    } catch (err) {
      console.error('[DB] Error saving location to Firestore:', err.message);
    }
  }
  // Local fallback
  try {
    let locations = [];
    if (fs.existsSync(LOCATIONS_FILE)) {
      locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
    }
    locations.push(locationRecord);
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2), 'utf8');
    console.log('[DB] Location record saved locally.');
  } catch (err) {
    console.error('[DB] Error saving location to local file:', err.message);
  }
};

export const getDBLocations = async () => {
  if (isFirebaseInitialized) {
    try {
      const snapshot = await db.collection('locations').get();
      return snapshot.docs.map(doc => doc.data());
    } catch (err) {
      console.error('[DB] Error getting locations from Firestore:', err.message);
    }
  }
  // Local fallback
  if (fs.existsSync(LOCATIONS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
    } catch (err) {
      console.error('[DB] Error reading local locations:', err.message);
    }
  }
  return [];
};

export const deleteDBLocationRecordByTimestamp = async (timestamp) => {
  if (isFirebaseInitialized) {
    try {
      const snapshot = await db.collection('locations').where('timestamp', '==', timestamp).get();
      const promises = snapshot.docs.map(doc => doc.ref.delete());
      await Promise.all(promises);
      console.log(`[DB] Location record with timestamp ${timestamp} deleted from Firestore.`);
    } catch (err) {
      console.error('[DB] Error deleting location from Firestore:', err.message);
    }
  }
  try {
    if (fs.existsSync(LOCATIONS_FILE)) {
      let locations = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
      const initialLength = locations.length;
      locations = locations.filter(loc => loc.timestamp !== timestamp);
      if (locations.length < initialLength) {
        fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(locations, null, 2), 'utf8');
        console.log(`[DB] Location record with timestamp ${timestamp} deleted locally.`);
      }
    }
  } catch (err) {
    console.error('[DB] Error deleting location from local file:', err.message);
  }
};


