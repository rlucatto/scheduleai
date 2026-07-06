import { getDBPreferences } from '../services/db.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

const defaultPreferences = {
  origin: 'Avenida Paulista, 1000 - Bela Vista, São Paulo - SP',
  homeAddress: 'Avenida Paulista, 1000 - Bela Vista, São Paulo - SP',
  workAddress: 'Avenida Brigadeiro Faria Lima, 3477 - Itaim Bibi, São Paulo - SP',
  transportMode: 'driving',
  prepTimeMinutes: 60,
  leadTimeMinutes: 15,
  advanceArrivalMinutes: 15,
  modelPriority: ['gemini-2.5-flash'],
  ttsMode: 'gemini',
  ttsVoice: 'Puck',
  hobbies: '',
  birthdayAlerts: ''
};

const run = async () => {
  try {
    const prefs = await getDBPreferences(defaultPreferences);
    console.log('--- FIRESTORE PREFERENCES ---');
    console.log(JSON.stringify(prefs, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
};

run();
