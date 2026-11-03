import { supabase } from './supabase'

/**
 * saveSaleAction(action, userId)
 *
 * Writes a single record_sale action object to Supabase.
 * The action comes directly from the edited review card (not the raw parsedSale).
 *
 *   1. Reject empty or "unknown" customer names — caller must supply "Walk-in"
 *      for cash sales, or a real name.
 *   2. Upsert the customer by name (create if new, return existing id).
 *   3. Insert a transaction row.
 *   4. Insert transaction_items rows (one per item).
 *   5. Update customers.balance_owed with the unpaid portion.
 *
 * Returns { ok: true } on success, throws on failure.
 */
export async function saveSaleAction(action, userId) {
  if (!action) throw new Error('No sale action provided')

  const customerName = action.customer?.trim()
  if (!customerName || customerName.toLowerCase() === 'unknown') {
    throw new Error('Customer name is required. Use "Walk-in" for cash sales.')
  }

  const saleTotal = Number(action.total ?? 0)
  const salePaid  = Number(action.paid  ?? 0)

  if (saleTotal <= 0) throw new Error('Sale total must be greater than 0.')
  if (salePaid < 0 || salePaid > saleTotal) {
    throw new Error('Paid amount must be between 0 and the total.')
  }

  // Walk-in sales must never create a debt
  if (customerName.toLowerCase() === 'walk-in' && salePaid < saleTotal) {
    throw new Error('Walk-in (cash) sales must be fully paid.')
  }

  for (const it of action.items ?? []) {
    if (Number(it.qty) <= 0) {
      throw new Error(`Quantity for "${it.product || 'item'}" must be greater than 0.`)
    }
  }

  const unpaid = Math.max(0, saleTotal - salePaid)

  // phone is optional — only write it if the caller supplied a non-empty value
  const customerPhone = action.phone?.trim() || null

  // 1. find or create the customer; read current balance_owed
  const { data: existing, error: findErr } = await supabase
    .from('customers')
    .select('id, balance_owed, phone')
    .eq('user_id', userId)
    .ilike('name', customerName)
    .maybeSingle()

  if (findErr) throw new Error('Customer lookup failed: ' + findErr.message)

  let customerId, currentBalance
  if (existing) {
    customerId     = existing.id
    currentBalance = Number(existing.balance_owed ?? 0)
    // update phone only if a new number was supplied
    if (customerPhone) {
      const { error: phoneErr } = await supabase
        .from('customers')
        .update({ phone: customerPhone })
        .eq('id', customerId)
        .eq('user_id', userId)
      if (phoneErr) throw new Error('Phone update failed: ' + phoneErr.message)
    }
  } else {
    const { data: created, error: createErr } = await supabase
      .from('customers')
      .insert({ user_id: userId, name: customerName, balance_owed: 0, phone: customerPhone })
      .select('id, balance_owed')
      .single()
    if (createErr) throw new Error('Customer create failed: ' + createErr.message)
    customerId     = created.id
    currentBalance = 0
  }

  // 2. insert the transaction
  const { data: txn, error: txnErr } = await supabase
    .from('transactions')
    .insert({
      user_id:     userId,
      customer_id: customerId,
      type:        'sale',
      total:       saleTotal,
      paid:        salePaid,
    })
    .select('id')
    .single()

  if (txnErr) throw new Error('Transaction insert failed: ' + txnErr.message)

  // 3. insert line items
  const items = (action.items ?? []).map((item) => ({
    transaction_id: txn.id,
    product_id:     null,
    product_name:   item.product ?? null,
    unit:           item.unit    ?? null,
    qty:            item.qty     ?? 0,
    unit_price:     null,
  }))

  if (items.length) {
    const { error: itemsErr } = await supabase
      .from('transaction_items')
      .insert(items)
    if (itemsErr) throw new Error('Items insert failed: ' + itemsErr.message)
  }

  // 4. update customers.balance_owed — add the unpaid portion of this sale
  // Must include .eq('user_id', userId) or the RLS `using` clause silently
  // filters out the row and the update applies to zero rows without an error.
  const { error: balErr } = await supabase
    .from('customers')
    .update({ balance_owed: currentBalance + unpaid })
    .eq('id', customerId)
    .eq('user_id', userId)

  if (balErr) throw new Error('Balance update failed: ' + balErr.message)

  return { ok: true, transactionId: txn.id }
}

/**
 * savePayment(parsedSale, userId)
 *
 * Writes one record_payment action to Supabase:
 *   1. Find the customer by name — must already exist; never creates one.
 *   2. Insert a payment transaction row (type='payment', paid=amount).
 *   3. Decrement customers.balance_owed by the payment amount.
 *
 * Throws with a clear message if the customer is not found.
 */
export async function savePayment(parsedSale, userId) {
  const action = parsedSale.actions?.find((a) => a.type === 'record_payment')
  if (!action) throw new Error('No record_payment action in parsed result')

  const customerName = action.customer?.trim()
  if (!customerName) throw new Error('No customer name in payment')

  const amount = Number(action.amount)
  if (!amount || amount <= 0) throw new Error('Payment amount must be greater than zero')

  // 1. customer must already exist — do not create on payment
  const { data: customer, error: findErr } = await supabase
    .from('customers')
    .select('id, balance_owed')
    .eq('user_id', userId)
    .ilike('name', customerName)
    .maybeSingle()

  if (findErr)   throw new Error('Customer lookup failed: ' + findErr.message)
  if (!customer) throw new Error(`Customer "${customerName}" not found. Check the name and try again.`)

  // 2. insert the payment transaction
  const { data: txn, error: txnErr } = await supabase
    .from('transactions')
    .insert({
      user_id:     userId,
      customer_id: customer.id,
      type:        'payment',
      total:       amount,
      paid:        amount,
    })
    .select('id')
    .single()

  if (txnErr) throw new Error('Payment insert failed: ' + txnErr.message)

  // 3. reduce the customer's outstanding balance
  const newBalance = Math.max(0, Number(customer.balance_owed ?? 0) - amount)
  const { error: balErr } = await supabase
    .from('customers')
    .update({ balance_owed: newBalance })
    .eq('id', customer.id)
    .eq('user_id', userId)

  if (balErr) throw new Error('Balance update failed: ' + balErr.message)

  return { ok: true, transactionId: txn.id }
}

/**
 * savePaymentAction(action, userId)
 *
 * Saves a single payment directly from the edited review card.
 * Unlike savePayment(), this accepts a plain action object with a
 * pre-resolved numeric `amount` (caller must resolve "all"/"half" before calling).
 *
 *   1. Find the customer by name — must already exist; never creates one.
 *   2. Insert a payment transaction row.
 *   3. Decrement customers.balance_owed by the payment amount.
 */
export async function savePaymentAction(action, userId) {
  const customerName = action.customer?.trim()
  if (!customerName) throw new Error('No customer name in payment')

  const amount = Number(action.amount)
  if (!amount || amount <= 0) throw new Error('Payment amount must be greater than zero')

  // 1. customer must already exist — do not create on payment
  const { data: customer, error: findErr } = await supabase
    .from('customers')
    .select('id, balance_owed')
    .eq('user_id', userId)
    .ilike('name', customerName)
    .maybeSingle()

  if (findErr)   throw new Error('Customer lookup failed: ' + findErr.message)
  if (!customer) throw new Error(`Customer "${customerName}" not found. Check the name and try again.`)

  // Safety net: never allow saving more than the customer's current balance
  const currentBalance = Number(customer.balance_owed ?? 0)
  if (amount > currentBalance) {
    throw new Error(
      `Payment of N$${amount.toFixed(2)} is more than ${customerName}'s balance of N$${currentBalance.toFixed(2)}.`
    )
  }

  // 2. insert the payment transaction
  const { data: txn, error: txnErr } = await supabase
    .from('transactions')
    .insert({
      user_id:     userId,
      customer_id: customer.id,
      type:        'payment',
      total:       amount,
      paid:        amount,
    })
    .select('id')
    .single()

  if (txnErr) throw new Error('Payment insert failed: ' + txnErr.message)

  // 3. reduce the customer's outstanding balance
  const newBalance = Math.max(0, Number(customer.balance_owed ?? 0) - amount)
  const { error: balErr } = await supabase
    .from('customers')
    .update({ balance_owed: newBalance })
    .eq('id', customer.id)
    .eq('user_id', userId)

  if (balErr) throw new Error('Balance update failed: ' + balErr.message)

  return { ok: true, transactionId: txn.id }
}
