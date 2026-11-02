import { supabase } from './supabase'

/**
 * saveSale(parsedSale, userId)
 *
 * Writes one record_sale action to Supabase:
 *   1. Upsert the customer by name (create if new, return existing id).
 *   2. Insert a transaction row.
 *   3. Insert transaction_items rows (one per item in the sale).
 *
 * Returns { ok: true } on success, throws on failure.
 */
export async function saveSale(parsedSale, userId) {
  const action = parsedSale.actions?.find((a) => a.type === 'record_sale')
  if (!action) throw new Error('No record_sale action in parsed result')

  const customerName = action.customer?.trim() || 'Unknown customer'
  const saleTotal    = Number(action.total ?? 0)
  const salePaid     = Number(action.paid  ?? 0)
  const unpaid       = Math.max(0, saleTotal - salePaid)

  // 1. find or create the customer; read current balance_owed
  const { data: existing, error: findErr } = await supabase
    .from('customers')
    .select('id, balance_owed')
    .eq('user_id', userId)
    .ilike('name', customerName)
    .maybeSingle()

  if (findErr) throw new Error('Customer lookup failed: ' + findErr.message)

  let customerId, currentBalance
  if (existing) {
    customerId     = existing.id
    currentBalance = Number(existing.balance_owed ?? 0)
  } else {
    const { data: created, error: createErr } = await supabase
      .from('customers')
      .insert({ user_id: userId, name: customerName, balance_owed: 0 })
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
      note:        parsedSale.clarifying_question ?? null,
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
