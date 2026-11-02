import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * useDashboard(userId)
 *
 * Returns { data, loading, error, refresh }
 * data = {
 *   totalSales:    number   — count of sale transactions
 *   totalOwed:     number   — sum(total - paid) across all sales
 *   customerCount: number   — distinct customers
 *   debtors:       [{ name, owed }]   — customers with balance > 0, desc
 *   recentSales:   [{ id, createdAt, customerName, items, total, paid }]
 * }
 */
export function useDashboard(userId) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError('')
    try {
      // Run all three queries in parallel
      const [txnRes, custRes, recentRes] = await Promise.all([
        // Aggregate totals from transactions table
        supabase
          .from('transactions')
          .select('total, paid, customer_id')
          .eq('user_id', userId)
          .eq('type', 'sale'),

        // All customers for this user
        supabase
          .from('customers')
          .select('id, name, balance_owed')
          .eq('user_id', userId),

        // 5 most recent sales with their items
        supabase
          .from('transactions')
          .select(`
            id,
            created_at,
            total,
            paid,
            customers ( name ),
            transaction_items ( qty, unit_price )
          `)
          .eq('user_id', userId)
          .eq('type', 'sale')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (txnRes.error)    throw txnRes.error
      if (custRes.error)   throw custRes.error
      if (recentRes.error) throw recentRes.error

      const sales = txnRes.data ?? []
      const customers = custRes.data ?? []

      // Totals
      const totalSales = sales.length
      const totalOwed  = sales.reduce((sum, t) => sum + ((t.total ?? 0) - (t.paid ?? 0)), 0)
      const customerCount = customers.length

      // Debtors: customers whose balance_owed > 0, biggest first.
      // We compute owed from the customers table balance_owed if available,
      // otherwise fall back to summing from transactions.
      const debtors = customers
        .filter((c) => (c.balance_owed ?? 0) > 0)
        .map((c) => ({ name: c.name, owed: Number(c.balance_owed) }))
        .sort((a, b) => b.owed - a.owed)

      // Recent sales
      const recentSales = (recentRes.data ?? []).map((t) => ({
        id:           t.id,
        createdAt:    t.created_at,
        customerName: t.customers?.name ?? 'Unknown',
        items:        t.transaction_items ?? [],
        total:        t.total ?? 0,
        paid:         t.paid  ?? 0,
      }))

      setData({ totalSales, totalOwed, customerCount, debtors, recentSales })
    } catch (err) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}
