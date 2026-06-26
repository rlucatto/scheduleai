import { google } from 'googleapis';
import { oauth2Client, isGoogleConnected } from './calendar.js';

// Search contacts by query
export const searchGoogleContacts = async (query) => {
  if (!isGoogleConnected || !oauth2Client) {
    throw new Error('Google Account is not connected.');
  }

  const people = google.people({ version: 'v1', auth: oauth2Client });

  try {
    // Warmup request as recommended by the API
    await people.people.searchContacts({
      query: '',
      readMask: 'names',
      pageSize: 1
    });

    const res = await people.people.searchContacts({
      query: query,
      readMask: 'names,emailAddresses,phoneNumbers,addresses',
      pageSize: 10
    });

    const results = res.data.results || [];
    
    return results.map(r => {
      const person = r.person || {};
      const name = person.names?.[0]?.displayName || 'Sem Nome';
      const email = person.emailAddresses?.[0]?.value || '';
      const phone = person.phoneNumbers?.[0]?.value || '';
      const address = person.addresses?.[0]?.formattedValue || person.addresses?.[0]?.streetAddress || '';
      return {
        resourceName: person.resourceName,
        name,
        email,
        phone,
        address
      };
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    throw new Error(`Falha ao buscar contatos: ${error.message}`);
  }
};

// Create a new contact
export const createGoogleContact = async (contactData) => {
  if (!isGoogleConnected || !oauth2Client) {
    throw new Error('Google Account is not connected.');
  }

  const people = google.people({ version: 'v1', auth: oauth2Client });

  const { name, email, phone, address } = contactData;

  const names = name ? [{ displayName: name, givenName: name }] : [];
  const emailAddresses = email ? [{ value: email, type: 'home' }] : [];
  const phoneNumbers = phone ? [{ value: phone, type: 'mobile' }] : [];
  const addresses = address ? [{ formattedValue: address, streetAddress: address, type: 'home' }] : [];

  try {
    const res = await people.people.createContact({
      requestBody: {
        names,
        emailAddresses,
        phoneNumbers,
        addresses
      }
    });

    const person = res.data;
    return {
      resourceName: person.resourceName,
      name: person.names?.[0]?.displayName || name,
      email: person.emailAddresses?.[0]?.value || '',
      phone: person.phoneNumbers?.[0]?.value || '',
      address: person.addresses?.[0]?.formattedValue || person.addresses?.[0]?.streetAddress || ''
    };
  } catch (error) {
    console.error('Error creating contact:', error);
    throw new Error(`Falha ao criar contato: ${error.message}`);
  }
};
