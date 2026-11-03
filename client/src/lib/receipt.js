/**
 * receipt.js  Shared receipt builder helpers.
 *
 * No React, no side effects. Pure functions that return strings and URL objects.
 */
import { normalisePhone, isValidPhone } from './phone.js'

function fmtAmt(n) {
  return Number(n).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-NA', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

/**
 * buildSaleReceiptText({ shopName, date, customerName, items, total, paid, balance })
 *
 * items = [{ qty, unit, product }]  (already formatted strings are also accepted as plain strings)
 * balance = customer's current balance AFTER this sale was saved.
 */
export function buildSaleReceiptText({ shopName, date, customerName, items, total, paid, balance }) {
  const shop = shopName?.trim() || 'Nawa'
  const lines = [
    `Receipt from ${shop}`,
    `Date: ${fmtDate(date)}`,
    `Customer: ${customerName}`,
    'Items:',
  ]
  for (const it of items ?? []) {
    if (typeof it === 'string') {
      lines.push(`  ${it}`)
    } else {
      const qty  = Number(it.qty ?? 0)
      const unit = it.unit
        ? ` ${qty <= 1
            ? (it.unit.endsWith('s') ? it.unit.slice(0, -1) : it.unit)
            : (!it.unit.endsWith('s') ? it.unit + 's' : it.unit)}`
        : ''
      lines.push(`  ${qty}${unit} ${it.product_name ?? it.product ?? 'item'}`)
    }
  }
  lines.push(`Total: N$${fmtAmt(total)}`)
  lines.push(`Paid: N$${fmtAmt(paid)}`)
  lines.push(`Balance owed: N$${fmtAmt(balance)}`)
  lines.push('Thank you!')
  return lines.join('\n')
}

/**
 * buildPaymentReceiptText({ shopName, date, customerName, amount, balance })
 *
 * balance = customer's current balance AFTER this payment was saved.
 */
export function buildPaymentReceiptText({ shopName, date, customerName, amount, balance }) {
  const shop = shopName?.trim() || 'Nawa'
  const balanceLine = Number(balance) <= 0
    ? 'Fully paid. Thank you!'
    : `Balance owed: N$${fmtAmt(balance)}`
  return [
    `Receipt from ${shop}`,
    `Date: ${fmtDate(date)}`,
    `Customer: ${customerName}`,
    `Payment received: N$${fmtAmt(amount)}`,
    balanceLine,
    'Thank you!',
  ].join('\n')
}

/**
 * buildReceiptUrls(phone, receiptText)
 *
 * Returns { wa, sms } href strings using the normalised phone number,
 * or null if the phone is not valid.
 */
export function buildReceiptUrls(phone, receiptText) {
  if (!phone) return null
  const kind = isValidPhone(phone)
  if (kind === 'empty' || kind === 'invalid') return null
  const norm = normalisePhone(phone)
  if (!norm) return null
  const waNumber = norm.startsWith('+') ? norm.slice(1) : norm
  const encoded  = encodeURIComponent(receiptText)
  return {
    wa:  `https://wa.me/${waNumber}?text=${encoded}`,
    sms: `sms:${norm}?body=${encoded}`,
  }
}
