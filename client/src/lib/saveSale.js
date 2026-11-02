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

  // 1. find or create the customer
  let customerId = null
  const { data: existing, error: findErr } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', customerName)
    .maybeSingle()

  if (findErr) throw new Error('Customer lookup failed: ' + findErr.message)

  if (existing) {
    customerId = existing.id
  } else {
    const { data: created, error: createErr } = await supabase
      .from('customers')
      .insert({ user_id: userId, name: customerName })
      .select('id')
      .single()
    if (createErr) throw new Error('Customer create failed: ' + createErr.message)
    customerId = created.id
  }

  // 2. insert the transaction
  const { data: txn, error: txnErr } = await supabase
    .from('transactions')
    .insert({
      user_id:     userId,
      customer_id: customerId,
      type:        'sale',
      total:       action.total  ?? 0,
      paid:        action.paid   ?? 0,
      note:        parsedSale.clarifying_question ?? null,
    })
    .select('id')
    .single()

  if (txnErr) throw new Error('Transaction insert failed: ' + txnErr.message)

  // 3. insert line items — save the free-text name and unit from the parse
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

  return { ok: true, transactionId: txn.id }
}
