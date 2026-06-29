import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

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
  const travelMode = mode || 'driving';

  if (!origin || !destination) {
    return {
      durationSeconds: 0,
      distanceText: '0 km',
      durationText: '0 mins',
      mode: travelMode,
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
            origin: origin,
            destination,
            mode: travelMode,
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
          mode: travelMode,
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
      mode: travelMode,
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
    mode: travelMode,
    isMock: true
  };
};

export const reverseGeocode = async (coords) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!coords) return null;

  const coordsRegex = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
  if (!coordsRegex.test(coords.trim())) {
    // Already an address, return as is
    return coords.trim();
  }

  if (mapsKey && mapsKey !== 'your_google_maps_api_key_here') {
    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            latlng: coords.trim(),
            key: mapsKey,
            language: 'pt-BR'
          }
        }
      );
      if (response.data.status === 'OK' && response.data.results && response.data.results.length > 0) {
        // Find the first result that is a street address or has street_number
        let bestResult = response.data.results.find(r => 
          r.types.includes('street_address') || 
          r.address_components.some(c => c.types.includes('street_number'))
        ) || response.data.results[0];

        // Extract components to format strictly
        const components = bestResult.address_components;
        const streetNumber = components.find(c => c.types.includes('street_number'))?.long_name || '1000'; // Default mock number if none found
        const route = components.find(c => c.types.includes('route'))?.long_name;
        const neighborhood = components.find(c => c.types.includes('sublocality_level_1') || c.types.includes('neighborhood'))?.long_name;
        const city = components.find(c => c.types.includes('locality'))?.long_name;
        const state = components.find(c => c.types.includes('administrative_area_level_1'))?.short_name;

        if (route && city) {
          const neighborhoodStr = neighborhood ? ` - ${neighborhood}` : '';
          const stateStr = state ? ` - ${state}` : '';
          return `${route}, ${streetNumber}${neighborhoodStr}, ${city}${stateStr}`;
        }

        return bestResult.formatted_address;
      }
    } catch (error) {
      console.error('Error in reverse geocoding:', error.message);
    }
  }

  return null;
};

const timezoneCache = new Map();

export const geocodeAddress = async (address) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!address) return null;

  if (mapsKey && mapsKey !== 'your_google_maps_api_key_here') {
    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            address: address.trim(),
            key: mapsKey
          }
        }
      );
      if (response.data.status === 'OK' && response.data.results && response.data.results.length > 0) {
        const loc = response.data.results[0].geometry.location;
        return { lat: loc.lat, lng: loc.lng };
      }
    } catch (error) {
      console.error('Error in geocoding address:', error.message);
    }
  }

  // Mock fallback
  const addrLower = address.toLowerCase();
  if (addrLower.includes('chicago') || addrLower.includes('spaulding')) {
    return { lat: 41.964, lng: -87.716 }; // Chicago spaulding coords
  }
  return { lat: -23.5616, lng: -46.6560 }; // São Paulo coords
};

export const getTimezoneFromCoords = async (coordsOrAddress) => {
  if (!coordsOrAddress) return 'America/Sao_Paulo';

  const cleanInput = coordsOrAddress.trim();
  
  // Check cache first
  if (timezoneCache.has(cleanInput)) {
    return timezoneCache.get(cleanInput);
  }

  const coordsRegex = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
  let coords = cleanInput;

  if (!coordsRegex.test(cleanInput)) {
    // If it's an address, geocode it first
    const latLng = await geocodeAddress(cleanInput);
    if (!latLng) {
      timezoneCache.set(cleanInput, 'America/Sao_Paulo');
      return 'America/Sao_Paulo';
    }
    coords = `${latLng.lat},${latLng.lng}`;
  }

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (mapsKey && mapsKey !== 'your_google_maps_api_key_here') {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/timezone/json',
        {
          params: {
            location: coords,
            timestamp,
            key: mapsKey
          }
        }
      );
      if (response.data.status === 'OK' && response.data.timeZoneId) {
        const tz = response.data.timeZoneId;
        timezoneCache.set(cleanInput, tz);
        return tz;
      }
    } catch (error) {
      console.error('Error fetching timezone from Google API:', error.message);
    }
  }

  // Fallback mocks
  const lower = cleanInput.toLowerCase();
  if (lower.includes('chicago') || lower.includes('spaulding') || coords.startsWith('41.9')) {
    timezoneCache.set(cleanInput, 'America/Chicago');
    return 'America/Chicago';
  }

  timezoneCache.set(cleanInput, 'America/Sao_Paulo');
  return 'America/Sao_Paulo';
};

