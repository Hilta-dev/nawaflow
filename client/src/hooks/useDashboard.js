import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Source of truth: customers.balance_owed
 *   - saveSale increments it by (total - paid)
 *   - savePayment decrements it by the payment amount
 * Everything in the dashboard reads from that column, not from summing transactions.
 *
 * Returns { data, loading, error, refresh }
 * data = {
 *   totalSales:      number   — count of type='sale' transactions
 *   totalOwed:       number   — sum of customers.balance_owed
 *   customerCount:   number   — number of customers
 *   debtors:         [{ name, owed }]  — balance_owed > 0, desc
 *   recentSales:     [{ id, createdAt, customerName, items, total, paid }]
 *   recentPayments:  [{ id, createdAt, customerName, amount }]
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
      const [salesCountRes, custRes, recentSalesRes, recentPaysRes] = await Promise.all([

        // Count of sale transactions only
        supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('type', 'sale'),

        // All customers — balance_owed is the maintained running total
        supabase
          .from('customers')
          .select('id, name, balance_owed')
          .eq('user_id', userId),

        // 5 most recent sales with items
        supabase
          .from('transactions')
          .select(`
            id,
            created_at,
            total,
            paid,
            customers ( name ),
            transaction_items ( qty, unit_price, product_name, unit )
          `)
          .eq('user_id', userId)
          .eq('type', 'sale')
          .order('created_at', { ascending: false })
          .limit(5),

        // 5 most recent payments
        supabase
          .from('transactions')
          .select('id, created_at, total, customers ( name )')
          .eq('user_id', userId)
          .eq('type', 'payment')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (salesCountRes.error) throw salesCountRes.error
      if (custRes.error)       throw custRes.error
      if (recentSalesRes.error) throw recentSalesRes.error
      if (recentPaysRes.error)  throw recentPaysRes.error

      const customers = custRes.data ?? []

      // Totals — all from customers.balance_owed, not from transactions arithmetic
      const totalSales    = salesCountRes.count ?? 0
      const totalOwed     = customers.reduce((sum, c) => sum + Number(c.balance_owed ?? 0), 0)
      const customerCount = customers.length

      // Debtors: balance_owed > 0, biggest first
      const debtors = customers
        .filter((c) => Number(c.balance_owed ?? 0) > 0)
        .map((c) => ({ name: c.name, owed: Number(c.balance_owed) }))
        .sort((a, b) => b.owed - a.owed)

      const recentSales = (recentSalesRes.data ?? []).map((t) => ({
        id:           t.id,
        createdAt:    t.created_at,
        customerName: t.customers?.name ?? 'Unknown',
        items:        t.transaction_items ?? [],
        total:        t.total ?? 0,
        paid:         t.paid  ?? 0,
      }))

      const recentPayments = (recentPaysRes.data ?? []).map((t) => ({
        id:           t.id,
        createdAt:    t.created_at,
        customerName: t.customers?.name ?? 'Unknown',
        amount:       t.total ?? 0,
      }))

      setData({ totalSales, totalOwed, customerCount, debtors, recentSales, recentPayments })
    } catch (err) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}
