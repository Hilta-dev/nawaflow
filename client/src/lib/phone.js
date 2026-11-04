/**
 * phone.js  —  Shared Namibian phone number helpers
 *
 * Accepted input forms (all produce +264812345678 for mobile):
 *   081 234 5678, 0812345678, +264 81 234 5678,
 *   264812345678, 00264812345678
 *
 * Valid mobile: after stripping the country prefix the local part
 *   has exactly 9 digits and starts with 8.
 * Landline:     same length and format but starts with 6.
 * International: + followed by 8 to 15 digits (non-Namibian).
 * Anything else is invalid.
 */

/** Strip noise, resolve prefix to a bare local string and a country code. */
function parse(raw) {
  if (!raw) return null
  // Remove spaces, dashes, brackets, dots
  const s = raw.replace(/[\s\-().]/g, '')
  if (!s) return null

  let cc, local
  if      (s.startsWith('+264'))  { cc = '264'; local = s.slice(4) }
  else if (s.startsWith('00264')) { cc = '264'; local = s.slice(5) }
  else if (s.startsWith('264'))   { cc = '264'; local = s.slice(3) }
  else if (s.startsWith('0'))     { cc = '264'; local = s.slice(1) }
  else if (s.startsWith('+'))     { cc = 'intl'; local = s.slice(1) }
  else                            { cc = '264'; local = s }

  return { cc, local, stripped: s }
}

/**
 * isValidPhone(input)
 * Returns one of: 'mobile' | 'landline' | 'international' | 'invalid' | 'empty'
 */
export function isValidPhone(input) {
  if (!input?.trim()) return 'empty'
  const p = parse(input)
  if (!p) return 'empty'

  if (p.cc === '264') {
    if (!/^\d+$/.test(p.local)) return 'invalid'
    if (p.local.startsWith('8') && p.local.length === 9) return 'mobile'
    if (p.local.startsWith('6') && p.local.length >= 7 && p.local.length <= 9) return 'landline'
    return 'invalid'
  }

  if (p.cc === 'intl') {
    // international: 8..15 total digits after the +
    if (/^\d{8,15}$/.test(p.local)) return 'international'
    return 'invalid'
  }

  return 'invalid'
}

/**
 * normalisePhone(input)
 * Returns the number in E.164 form (+264812345678) for storage, or '' if invalid/empty.
 */
export function normalisePhone(input) {
  if (!input?.trim()) return ''
  const kind = isValidPhone(input)
  if (kind === 'empty' || kind === 'invalid') return ''

  const p = parse(input)
  if (!p) return ''

  if (p.cc === 'intl') {
    // already has leading +, just return cleaned
    return '+' + p.local.replace(/\D/g, '')
  }

  // Namibian mobile or landline
  return '+264' + p.local
}

/**
 * formatPhone(input)
 * Returns a human-readable form for display.
 *   +264812345678  →  +264 81 234 5678
 *   +26461123456   →  +264 61 123 456
 *   international  →  +<digits> (unchanged, spaced every 3 after country)
 * If the number is invalid or empty, returns the raw input unchanged.
 */
export function formatPhone(input) {
  if (!input?.trim()) return input ?? ''
  const norm = normalisePhone(input)
  if (!norm) return input

  if (norm.startsWith('+264')) {
    const local = norm.slice(4)  // e.g. 812345678 or 61123456
    if (local.length === 9) {
      // mobile: 81 234 5678
      return `+264 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`
    }
    if (local.length === 8) {
      // landline: 61 123 456
      return `+264 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`
    }
    if (local.length === 7) {
      // landline short: 6 123 456
      return `+264 ${local.slice(0, 1)} ${local.slice(1, 4)} ${local.slice(4)}`
    }
  }
  // fallback: no special formatting
  return norm
}

/**
 * findPhoneOwner(normalisedPhone, customers, exceptCustomerId)
 *
 * Returns the first customer in `customers` whose stored phone normalises to
 * the same E.164 string as `normalisedPhone`, ignoring the customer whose id
 * equals `exceptCustomerId` (the one being edited). Returns null if not found.
 * Pass '' or null for exceptCustomerId when there is no customer to exclude.
 */
export function findPhoneOwner(normalisedPhone, customers, exceptCustomerId) {
  if (!normalisedPhone) return null
  return customers.find((c) => {
    if (exceptCustomerId && c.id === exceptCustomerId) return false
    const cn = normalisePhone(c.phone ?? '')
    return cn && cn === normalisedPhone
  }) ?? null
}

/**
 * buildContactUrls(storedPhone, customerName, amountOwed, shopName)
 *
 * Returns { wa, sms, tel } href strings, or null if no valid number.
 */
export function buildContactUrls(storedPhone, customerName, amountOwed, shopName) {
  const norm = normalisePhone(storedPhone) || storedPhone
  if (!norm) return null

  const fmtAmt = Number(amountOwed).toLocaleString('en-NA', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
  const shop = shopName?.trim() || 'Nawa'
  const msg  = `Hi ${customerName}, a friendly reminder that you owe N$${fmtAmt} to ${shop}. Thank you!`

  // WhatsApp wants the number without the leading +
  const waNumber = norm.startsWith('+') ? norm.slice(1) : norm

  return {
    wa:  `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`,
    sms: `sms:${norm}?body=${encodeURIComponent(msg)}`,
    tel: `tel:${norm}`,
  }
}
