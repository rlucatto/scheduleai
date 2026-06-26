import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Dictionary of predefined mock travel durations for São Paulo (or generic lookups)
// to make the simulation look realistic and instantaneous.
const MOCK_TRAVEL_TIMES = [
  { keywords: ['rubaiyat', 'faria lima'], durationSeconds: 1500, distanceText: '8.4 km', durationText: '25 mins' },
  { keywords: ['google', 'escritorio', 'escritório'], durationSeconds: 1200, distanceText: '6.2 km', durationText: '20 mins' },
  { keywords: ['aeroporto', 'guarulhos', 'gru'], durationSeconds: 3200, distanceText: '29.5 km', durationText: '53 mins' },
  { keywords: ['congonhas'], durationSeconds: 900, distanceText: '5.1 km', durationText: '15 mins' },
  { keywords: ['jantar', 'shopping'], durationSeconds: 1800, distanceText: '11.0 km', durationText: '30 mins' }
];

export const getTravelTime = async (origin, destination, mode = 'driving') => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!destination) {
    return {
      durationSeconds: 0,
      distanceText: '0 km',
      durationText: '0 mins',
      mode,
      isMock: true
    };
  }

  // If Google Maps API key is configured, try using it
  if (mapsKey && mapsKey !== 'your_google_maps_api_key_here') {
    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/directions/json',
        {
          params: {
            origin: origin || 'São Paulo, SP',
            destination,
            mode,
            key: mapsKey
          }
        }
      );

      if (response.data.status === 'OK' && response.data.routes && response.data.routes.length > 0) {
        const leg = response.data.routes[0].legs[0];
        return {
          durationSeconds: leg.duration.value,
          distanceText: leg.distance.text,
          durationText: leg.duration.text,
          originAddress: leg.start_address,
          destinationAddress: leg.end_address,
          mode,
          isMock: false
        };
      }
    } catch (error) {
      console.error('Error fetching from Google Maps Directions API:', error.message);
      // Fallback to mock below
    }
  }

  // Fallback / Mock Mode: Match keywords from destination name to find realistic travel values
  const destLower = destination.toLowerCase();
  const matched = MOCK_TRAVEL_TIMES.find(item =>
    item.keywords.some(keyword => destLower.includes(keyword))
  );

  if (matched) {
    return {
      durationSeconds: matched.durationSeconds,
      distanceText: matched.distanceText,
      durationText: matched.durationText,
      originAddress: origin || 'Minha Localização',
      destinationAddress: destination,
      mode,
      isMock: true
    };
  }

  // Catch-all default mock fallback (e.g. 25 minutes, 10km)
  // Generates a stable random-like travel time based on the string length of the destination
  const baseTime = 1000 + (destination.length * 15) % 1800; // between 1000s (16m) and 2800s (46m)
  const durationMin = Math.round(baseTime / 60);
  const distanceKm = (durationMin * 0.45).toFixed(1); // average speed driving math

  return {
    durationSeconds: baseTime,
    distanceText: `${distanceKm} km`,
    durationText: `${durationMin} mins`,
    originAddress: origin || 'Minha Localização',
    destinationAddress: destination,
    mode,
    isMock: true
  };
};
