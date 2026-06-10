export function formatPhoneFromJid(jid: string | null | undefined): string {
  if (!jid) return '';
  return jid.replace(/@.*$/, '');
}

export function isLidJid(jid: string | null | undefined): boolean {
  if (!jid) return false;
  return jid.includes('@lid');
}

export function formatPhoneDisplay(jid: string | null | undefined): string {
  const num = formatPhoneFromJid(jid);
  if (!num || num.length < 10) return num;
  if (isLidJid(jid)) return num;
  if (num.startsWith('55') && num.length >= 12) {
    const ddd = num.slice(2, 4);
    const rest = num.slice(4);
    if (rest.length === 9) {
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return `+${num}`;
}

export function formatJidFromPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  return `${cleaned}@s.whatsapp.net`;
}

export function normalizePhone(jidOrPhone: string): string {
  const phone = jidOrPhone.includes('@') ? formatPhoneFromJid(jidOrPhone) : jidOrPhone;
  return phone.replace(/\D/g, '');
}

export function normalizePhoneForMatching(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('55') && cleaned.length > 11) {
    cleaned = cleaned.slice(2);
  }
  if (cleaned.length === 11 && cleaned[2] === '9') {
    cleaned = cleaned.slice(0, 2) + cleaned.slice(3);
  }
  return cleaned;
}

export function getPhoneVariants(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, '');
  const variants: string[] = [cleaned];

  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    const withoutCountry = cleaned.slice(2);
    variants.push(withoutCountry);

    const ddd = cleaned.slice(2, 4);
    const rest = cleaned.slice(4);

    if (rest.length === 9 && rest.startsWith('9')) {
      const without9 = ddd + rest.slice(1);
      variants.push('55' + without9);
      variants.push(without9);
    } else if (rest.length === 8) {
      const with9 = ddd + '9' + rest;
      variants.push('55' + with9);
      variants.push(with9);
    }
  }

  return variants;
}
