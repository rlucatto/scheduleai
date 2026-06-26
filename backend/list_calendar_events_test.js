import { listEvents } from './services/calendar.js';

const run = async () => {
  try {
    const timeMin = '2025-01-01T00:00:00Z';
    const timeMax = '2027-12-31T23:59:59Z';
    console.log("Listing events...");
    const events = await listEvents(timeMin, timeMax);
    console.log(`Found ${events.length} events:`);
    events.forEach(e => {
      console.log(`- ID: ${e.id}`);
      console.log(`  Summary: ${e.summary}`);
      console.log(`  Start: ${JSON.stringify(e.start)}`);
      console.log(`  End: ${JSON.stringify(e.end)}`);
      console.log(`  Location: ${e.location}`);
      console.log();
    });
  } catch (error) {
    console.error("Error listing events:", error.message);
  }
};

run();
