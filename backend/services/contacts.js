import { google } from 'googleapis';
import { oauth2Client, isGoogleConnected } from './calendar.js';

// In-memory mock contacts list
let mockContacts = [
  {
    resourceName: 'people/c1',
    name: 'João Silva',
    email: 'joao.silva@example.com',
    phone: '11999999999',
    address: '',
    birthday: ''
  },
  {
    resourceName: 'people/c2',
    name: 'João Silva',
    email: 'joao.silva2@example.com',
    phone: '11888888888',
    address: 'Rua Augusta, 1500, São Paulo, SP',
    birthday: '1995-10-15'
  },
  {
    resourceName: 'people/c3',
    name: 'Maria Santos',
    email: 'maria.santos@example.com',
    phone: '11777777777',
    address: 'Avenida Paulista, 1000, São Paulo, SP',
    birthday: '1990-06-27'
  },
  {
    resourceName: 'people/shiva1',
    name: 'Shiva',
    email: 'shiva@example.com',
    phone: '11977776666',
    address: 'Rua Augusta, 1200, São Paulo, SP',
    birthday: ''
  }
];

// Search contacts by query
export const searchGoogleContacts = async (query) => {
  if (process.env.TEST_MOCK_CONTACTS === 'true' || !isGoogleConnected || !oauth2Client) {
    console.log(`[MOCK] searchGoogleContacts called with query: "${query}"`);
    const q = query.toLowerCase();

    // Check specific test scenarios for automated verification
    if (process.env.TEST_MOCK_CONTACTS === 'true') {
      const scenario = process.env.TEST_SCENARIO || 'one_has_address';
      if (scenario === 'one_has_address') {
        return [
          {
            resourceName: 'people/c1',
            name: 'João Silva',
            email: 'joao.silva@example.com',
            phone: '11999999999',
            address: ''
          },
          {
            resourceName: 'people/c2',
            name: 'João Silva',
            email: 'joao.silva2@example.com',
            phone: '11888888888',
            address: 'Rua Augusta, 1500, São Paulo, SP'
          }
        ];
      } else if (scenario === 'none_have_address') {
        return [
          {
            resourceName: 'people/c1',
            name: 'João Silva',
            email: 'joao.silva@example.com',
            phone: '11999999999',
            address: ''
          },
          {
            resourceName: 'people/c2',
            name: 'João Silva',
            email: 'joao.silva2@example.com',
            phone: '11888888888',
            address: ''
          }
        ];
      } else if (scenario === 'all_have_address') {
        return [
          {
            resourceName: 'people/c1',
            name: 'João Silva',
            email: 'joao.silva@example.com',
            phone: '11999999999',
            address: 'Avenida Paulista, 1000, São Paulo, SP'
          },
          {
            resourceName: 'people/c2',
            name: 'João Silva',
            email: 'joao.silva2@example.com',
            phone: '11888888888',
            address: 'Rua Augusta, 1500, São Paulo, SP'
          }
        ];
      } else if (scenario === 'shiva_flow') {
        return [
          {
            resourceName: 'people/shiva1',
            name: 'Shiva',
            email: 'shiva@example.com',
            phone: '11977776666',
            address: 'Rua Augusta, 1200, São Paulo, SP'
          }
        ];
      } else if (scenario === 'shiva_no_address') {
        return [
          {
            resourceName: 'people/shiva1',
            name: 'Shiva',
            email: 'shiva@example.com',
            phone: '11977776666',
            address: ''
          }
        ];
      }
    }

    return mockContacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
    );
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
      readMask: 'names,emailAddresses,phoneNumbers,addresses,birthdays',
      pageSize: 10
    });

    const results = res.data.results || [];
    
    return results.map(r => {
      const person = r.person || {};
      const name = person.names?.[0]?.displayName || 'Sem Nome';
      const email = person.emailAddresses?.[0]?.value || '';
      const phone = person.phoneNumbers?.[0]?.value || '';
      const address = person.addresses?.[0]?.formattedValue || person.addresses?.[0]?.streetAddress || '';
      
      const bdayObj = person.birthdays?.[0]?.date;
      let birthday = '';
      if (bdayObj) {
        const year = bdayObj.year || '';
        const month = String(bdayObj.month).padStart(2, '0');
        const day = String(bdayObj.day).padStart(2, '0');
        birthday = year ? `${year}-${month}-${day}` : `${month}-${day}`;
      }

      return {
        resourceName: person.resourceName,
        name,
        email,
        phone,
        address,
        birthday
      };
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    throw new Error(`Falha ao buscar contatos: ${error.message}`);
  }
};

// Create a new contact
export const createGoogleContact = async (contactData) => {
  if (process.env.TEST_MOCK_CONTACTS === 'true' || !isGoogleConnected || !oauth2Client) {
    const newContact = {
      resourceName: `people/c${Date.now()}`,
      name: contactData.name || 'Sem Nome',
      email: contactData.email || '',
      phone: contactData.phone || '',
      address: contactData.address || '',
      birthday: contactData.birthday || ''
    };
    mockContacts.push(newContact);
    return newContact;
  }

  const people = google.people({ version: 'v1', auth: oauth2Client });

  const { name, email, phone, address, birthday } = contactData;

  const names = name ? [{ displayName: name, givenName: name }] : [];
  const emailAddresses = email ? [{ value: email, type: 'home' }] : [];
  const phoneNumbers = phone ? [{ value: phone, type: 'mobile' }] : [];
  const addresses = address ? [{ formattedValue: address, streetAddress: address, type: 'home' }] : [];

  const birthdays = [];
  if (birthday) {
    const parts = birthday.split('-');
    if (parts.length === 3) {
      birthdays.push({ date: { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) } });
    } else if (parts.length === 2) {
      birthdays.push({ date: { month: parseInt(parts[0]), day: parseInt(parts[1]) } });
    }
  }

  try {
    const res = await people.people.createContact({
      requestBody: {
        names,
        emailAddresses,
        phoneNumbers,
        addresses,
        birthdays
      }
    });

    const person = res.data;
    const bdayObj = person.birthdays?.[0]?.date;
    let bdayStr = '';
    if (bdayObj) {
      const year = bdayObj.year || '';
      const month = String(bdayObj.month).padStart(2, '0');
      const day = String(bdayObj.day).padStart(2, '0');
      bdayStr = year ? `${year}-${month}-${day}` : `${month}-${day}`;
    }

    return {
      resourceName: person.resourceName,
      name: person.names?.[0]?.displayName || name,
      email: person.emailAddresses?.[0]?.value || '',
      phone: person.phoneNumbers?.[0]?.value || '',
      address: person.addresses?.[0]?.formattedValue || person.addresses?.[0]?.streetAddress || '',
      birthday: bdayStr
    };
  } catch (error) {
    console.error('Error creating contact:', error);
    throw new Error(`Falha ao criar contato: ${error.message}`);
  }
};

// Update an existing contact
export const updateGoogleContact = async (resourceName, contactData) => {
  if (process.env.TEST_MOCK_CONTACTS === 'true' || !isGoogleConnected || !oauth2Client) {
    console.log(`[MOCK] updateGoogleContact called for resource: "${resourceName}"`);
    const index = mockContacts.findIndex(c => c.resourceName === resourceName);
    if (index === -1) {
      throw new Error(`Contato com resourceName ${resourceName} não encontrado.`);
    }
    const updated = {
      ...mockContacts[index],
      ...Object.fromEntries(Object.entries(contactData).filter(([_, v]) => v !== undefined))
    };
    mockContacts[index] = updated;
    return updated;
  }

  const people = google.people({ version: 'v1', auth: oauth2Client });

  try {
    // 1. Get the contact first to get its current etag and existing fields
    const res = await people.people.get({
      resourceName: resourceName,
      personFields: 'names,emailAddresses,phoneNumbers,addresses,metadata,birthdays'
    });

    const person = res.data;
    const updateFields = [];

    // 2. Overwrite the fields specified in contactData
    if (contactData.name !== undefined) {
      person.names = [{ displayName: contactData.name, givenName: contactData.name }];
      updateFields.push('names');
    }
    
    if (contactData.email !== undefined) {
      person.emailAddresses = [{ value: contactData.email, type: 'home' }];
      updateFields.push('emailAddresses');
    }

    if (contactData.phone !== undefined) {
      person.phoneNumbers = [{ value: contactData.phone, type: 'mobile' }];
      updateFields.push('phoneNumbers');
    }

    if (contactData.address !== undefined) {
      person.addresses = [{ formattedValue: contactData.address, streetAddress: contactData.address, type: 'home' }];
      updateFields.push('addresses');
    }

    if (contactData.birthday !== undefined) {
      if (contactData.birthday) {
        const parts = contactData.birthday.split('-');
        if (parts.length === 3) {
          person.birthdays = [{ date: { year: parseInt(parts[0]), month: parseInt(parts[1]), day: parseInt(parts[2]) } }];
        } else if (parts.length === 2) {
          person.birthdays = [{ date: { month: parseInt(parts[0]), day: parseInt(parts[1]) } }];
        }
      } else {
        person.birthdays = [];
      }
      updateFields.push('birthdays');
    }

    if (updateFields.length === 0) {
      throw new Error('Nenhum campo fornecido para atualização.');
    }

    // 3. Perform update
    const updateRes = await people.people.updateContact({
      resourceName: resourceName,
      updatePersonFields: updateFields.join(','),
      requestBody: person
    });

    const updatedPerson = updateRes.data;
    const bdayObj = updatedPerson.birthdays?.[0]?.date;
    let bdayStr = '';
    if (bdayObj) {
      const year = bdayObj.year || '';
      const month = String(bdayObj.month).padStart(2, '0');
      const day = String(bdayObj.day).padStart(2, '0');
      bdayStr = year ? `${year}-${month}-${day}` : `${month}-${day}`;
    }

    return {
      resourceName: updatedPerson.resourceName,
      name: updatedPerson.names?.[0]?.displayName || '',
      email: updatedPerson.emailAddresses?.[0]?.value || '',
      phone: updatedPerson.phoneNumbers?.[0]?.value || '',
      address: updatedPerson.addresses?.[0]?.formattedValue || updatedPerson.addresses?.[0]?.streetAddress || '',
      birthday: bdayStr
    };
  } catch (error) {
    console.error('Error updating contact:', error);
    throw new Error(`Falha ao atualizar contato: ${error.message}`);
  }
};
