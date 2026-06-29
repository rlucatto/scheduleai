import dotenv from 'dotenv';
import path from 'path';
import { searchGoogleContacts } from './services/contacts.js';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

async function run() {
  try {
    console.log('Searching for "Aline" in Google Contacts...');
    const resAline = await searchGoogleContacts('Aline');
    console.log(`Found ${resAline.length} matches for "Aline":`);
    for (const c of resAline) {
      console.log(`- ResourceName: ${c.resourceName}`);
      console.log(`  Name: "${c.name}"`);
      console.log(`  Phone: "${c.phone}"`);
      console.log(`  Email: "${c.email}"`);
      console.log(`  Birthday: "${c.birthday}"`);
      console.log(`  Address: "${c.address}"`);
      console.log('-----------------------------');
    }

    console.log('Searching for "Aliza" in Google Contacts...');
    const resAliza = await searchGoogleContacts('Aliza');
    console.log(`Found ${resAliza.length} matches for "Aliza":`);
    for (const c of resAliza) {
      console.log(`- ResourceName: ${c.resourceName}`);
      console.log(`  Name: "${c.name}"`);
      console.log(`  Phone: "${c.phone}"`);
      console.log(`  Email: "${c.email}"`);
      console.log(`  Birthday: "${c.birthday}"`);
      console.log(`  Address: "${c.address}"`);
      console.log('-----------------------------');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
