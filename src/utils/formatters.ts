export const capitalizeName = (name: string): string => {
  if (!name) return '';

  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const removeAccents = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

export const normalizeAssessor = (assessor: string): string => {
  if (!assessor) return '';
  return removeAccents(assessor.toLowerCase().trim())
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/');
};

export const capitalizeAssessor = (assessor: string): string => {
  if (!assessor) return '';
  return assessor
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .split('/')
    .map(part => part.trim().charAt(0).toUpperCase() + part.trim().slice(1).toLowerCase())
    .join('/');
};
