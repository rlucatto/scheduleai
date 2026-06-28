import fs from 'fs';
import path from 'path';

const TAGS_FILE = path.join(process.cwd(), 'tags.json');

// Default state
const defaultState = {
  tags: [
    { id: 'tag-amigo', name: 'Amigo', type: 'global', owner: 'system' },
    { id: 'tag-pessoal', name: 'Pessoal', type: 'global', owner: 'system' },
    { id: 'tag-trabalho', name: 'Trabalho', type: 'global', owner: 'system' }
  ],
  associations: [] // array of { contactId, tagName, email }
};

// Load tags from file
const loadTagsData = () => {
  if (fs.existsSync(TAGS_FILE)) {
    try {
      const content = fs.readFileSync(TAGS_FILE, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.error('[TAGS] Error reading tags.json:', err.message);
      return defaultState;
    }
  }
  return defaultState;
};

// Save tags to file
const saveTagsData = (data) => {
  try {
    fs.writeFileSync(TAGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[TAGS] Error writing tags.json:', err.message);
  }
};

export const getVisibleTags = (email) => {
  const data = loadTagsData();
  const lowerEmail = (email || '').toLowerCase();
  return data.tags.filter(tag => {
    if (tag.type === 'global') return true;
    return tag.owner.toLowerCase() === lowerEmail;
  });
};

export const addTag = (name, type, email) => {
  const data = loadTagsData();
  const lowerEmail = (email || '').toLowerCase();
  const isAdmin = lowerEmail === 'rafael.lucatto@gmail.com';
  
  // Force type to private if not admin
  const finalType = isAdmin ? type : 'private';
  
  // Check if tag already exists in visible scope
  const exists = data.tags.some(tag => {
    if (tag.name.toLowerCase() !== name.toLowerCase()) return false;
    if (tag.type === 'global' && finalType === 'global') return true;
    return tag.owner.toLowerCase() === lowerEmail;
  });
  
  if (exists) {
    throw new Error(`A tag "${name}" já existe.`);
  }
  
  const newTag = {
    id: `tag-${Date.now()}`,
    name,
    type: finalType,
    owner: finalType === 'global' ? 'system' : lowerEmail
  };
  
  data.tags.push(newTag);
  saveTagsData(data);
  return getVisibleTags(email);
};

export const getContactTags = (contactId, email) => {
  const data = loadTagsData();
  const lowerEmail = (email || '').toLowerCase();
  
  // Find visible tags first
  const visibleTags = getVisibleTags(email);
  const visibleTagNames = new Set(visibleTags.map(t => t.name.toLowerCase()));
  
  // Filter associations for this contact
  const assoc = data.associations.filter(a => a.contactId === contactId);
  
  // Return tag names that are visible to this user
  return assoc
    .filter(a => {
      const isOwner = a.email.toLowerCase() === lowerEmail || a.email.toLowerCase() === 'system';
      const isVisibleTag = visibleTagNames.has(a.tagName.toLowerCase());
      return isOwner && isVisibleTag;
    })
    .map(a => a.tagName);
};

export const updateContactTags = (contactId, tags, email) => {
  const data = loadTagsData();
  const lowerEmail = (email || '').toLowerCase();
  
  // Remove existing associations of visible tags for this contact and user
  const visibleTags = getVisibleTags(email);
  const visibleTagNames = new Set(visibleTags.map(t => t.name.toLowerCase()));
  
  data.associations = data.associations.filter(a => {
    if (a.contactId !== contactId) return true;
    const isVisibleInScope = visibleTagNames.has(a.tagName.toLowerCase());
    const isUserAssoc = a.email.toLowerCase() === lowerEmail || a.email.toLowerCase() === 'system';
    return !(isVisibleInScope && isUserAssoc);
  });
  
  // Add new associations
  tags.forEach(tagName => {
    const tagObj = visibleTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    const assocOwner = (tagObj && tagObj.type === 'global') ? 'system' : lowerEmail;
    
    data.associations.push({
      contactId,
      tagName,
      email: assocOwner
    });
  });
  
  saveTagsData(data);
  return getContactTags(contactId, email);
};

export const deleteTag = (tagName, email) => {
  const data = loadTagsData();
  const lowerEmail = (email || '').toLowerCase();
  const isAdmin = lowerEmail === 'rafael.lucatto@gmail.com';
  
  const tagIndex = data.tags.findIndex(t => t.name.toLowerCase() === tagName.toLowerCase());
  if (tagIndex === -1) {
    throw new Error(`Tag "${tagName}" não encontrada.`);
  }
  
  const tag = data.tags[tagIndex];
  
  // Admin can delete any tag. Private tags can be deleted by their owners.
  if (!isAdmin && tag.owner.toLowerCase() !== lowerEmail) {
    throw new Error('Você não tem permissão para excluir esta tag.');
  }
  
  data.tags.splice(tagIndex, 1);
  
  // Clean up contact tag associations for the deleted tag
  data.associations = data.associations.filter(a => a.tagName.toLowerCase() !== tagName.toLowerCase());
  
  saveTagsData(data);
  return getVisibleTags(email);
};
