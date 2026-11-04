import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function fmt(n) {
  return Number(n).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── stock level chip ──────────────────────────────────────────────────────────

function StockChip({ qty, lowLevel }) {
  const q = Number(qty ?? 0)
  const l = Number(lowLevel ?? 0)
  if (q <= 0)      return <span style={chipRed}>Out of stock</span>
  if (q <= l)      return <span style={chipAmber}>Low stock</span>
  return               <span style={chipGreen}>In stock</span>
}

// ── add / edit product form ───────────────────────────────────────────────────

function ProductForm({ userId, existing, allNames, onSaved, onCancel }) {
  const isEdit = !!existing

  const [name,        setName]        = useState(existing?.name         ?? '')
  const [unit,        setUnit]        = useState(existing?.unit         ?? 'item')
  const [price,       setPrice]       = useState(existing?.price        != null ? String(existing.price)      : '')
  const [costPrice,   setCostPrice]   = useState(existing?.cost_price   != null ? String(existing.cost_price) : '')
  const [stockQty,    setStockQty]    = useState(existing?.stock_qty    != null ? String(existing.stock_qty)  : '0')
  const [lowLevel,    setLowLevel]    = useState(existing?.low_stock_level != null ? String(existing.low_stock_level) : '0')
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState('')

  function validate() {
    if (!name.trim()) return 'Product name is required.'
    // duplicate check (case-insensitive), excluding the product being edited
    const lower = name.trim().toLowerCase()
    const dup = allNames.some((n) =>
      n.toLowerCase() === lower && n.toLowerCase() !== (existing?.name ?? '').toLowerCase()
    )
    if (dup) return `You already have a product called "${name.trim()}".`
    if (price !== '' && (isNaN(Number(price)) || Number(price) < 0))
      return 'Selling price must be 0 or more.'
    if (costPrice !== '' && (isNaN(Number(costPrice)) || Number(costPrice) < 0))
      return 'Cost price must be 0 or more.'
    if (isNaN(Number(stockQty)) || Number(stockQty) < 0)
      return 'Starting quantity must be 0 or more.'
    if (isNaN(Number(lowLevel)) || Number(lowLevel) < 0)
      return 'Low stock level must be 0 or more.'
    return ''
  }

  async function save() {
    const vErr = validate()
    if (vErr) { setErr(vErr); return }
    setSaving(true)
    setErr('')
    const payload = {
      name:            name.trim(),
      unit:            unit.trim() || 'item',
      price:           price !== '' ? Number(price) : null,
      cost_price:      costPrice !== '' ? Number(costPrice) : null,
      stock_qty:       Number(stockQty),
      low_stock_level: Number(lowLevel),
    }
    let error
    if (isEdit) {
      ;({ error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', existing.id)
        .eq('user_id', userId))
    } else {
      ;({ error } = await supabase
        .from('products')
        .insert({ ...payload, user_id: userId }))
    }
    setSaving(false)
    if (error) { setErr('Could not save: ' + error.message); return }
    onSaved()
  }

  return (
    <div style={formCard}>
      <strong style={sectionHead}>{isEdit ? 'Edit product' : 'Add product'}</strong>

      <label style={labelStyle}>Product name</label>
      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setErr('') }}
        placeholder="e.g. Sugar"
        style={{ ...fieldStyle, borderColor: !name.trim() && err ? '#fca5a5' : '#d1d5db' }}
      />

      <label style={labelStyle}>Unit</label>
      <input
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        placeholder="e.g. bag, kg, bottle"
        style={fieldStyle}
      />

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Selling price (N$)</label>
          <input type="number" min="0" step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            style={fieldStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Cost price (N$, optional)</label>
          <input type="number" min="0" step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="0.00"
            style={fieldStyle}
          />
        </div>
      </div>

      {!isEdit && (
        <>
          <label style={labelStyle}>Starting quantity</label>
          <input type="number" min="0" step="any"
            value={stockQty}
            onChange={(e) => setStockQty(e.target.value)}
            style={fieldStyle}
          />
        </>
      )}

      <label style={labelStyle}>Low stock alert level</label>
      <input type="number" min="0" step="any"
        value={lowLevel}
        onChange={(e) => setLowLevel(e.target.value)}
        style={fieldStyle}
      />

      {err && <p style={errStyle}>{err}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={save} disabled={saving}
          style={{ ...btnStyle('#16a34a'), flex: 1 }}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add product'}
        </button>
        <button onClick={onCancel}
          style={{ ...btnStyle('#6b7280'), flex: 1 }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── add stock form (inline on the card) ──────────────────────────────────────

function AddStockForm({ product, userId, onSaved, onCancel }) {
  const [qty,    setQty]    = useState('')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  async function save() {
    const n = Number(qty)
    if (!qty.trim() || isNaN(n) || n <= 0) {
      setErr('Please enter a positive quantity.')
      return
    }
    setSaving(true)
    setErr('')
    const newQty = Number(product.stock_qty ?? 0) + n
    const { error } = await supabase
      .from('products')
      .update({ stock_qty: newQty })
      .eq('id', product.id)
      .eq('user_id', userId)
    setSaving(false)
    if (error) { setErr('Could not save: ' + error.message); return }
    onSaved()
  }

  return (
    <div style={{ marginTop: 8, background: '#f0fdf4', borderRadius: 8,
                  border: '1px solid #bbf7d0', padding: '10px 12px' }}>
      <label style={labelStyle}>Quantity to add</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" min="0" step="any"
          value={qty}
          onChange={(e) => { setQty(e.target.value); setErr('') }}
          placeholder="e.g. 10"
          style={{ ...fieldStyle, flex: 1 }}
          autoFocus
        />
        <button onClick={save} disabled={saving}
          style={{ ...btnStyle('#16a34a'), minWidth: 80 }}>
          {saving ? '…' : 'Add'}
        </button>
        <button onClick={onCancel}
          style={{ ...btnStyle('#6b7280'), minWidth: 60 }}>
          Cancel
        </button>
      </div>
      {err && <p style={{ ...errStyle, marginTop: 4 }}>{err}</p>}
    </div>
  )
}

// ── product card ──────────────────────────────────────────────────────────────

function ProductCard({ product, userId, allNames, onRefresh }) {
  const [mode, setMode] = useState('view') // 'view' | 'edit' | 'addstock'

  if (mode === 'edit') {
    return (
      <ProductForm
        userId={userId}
        existing={product}
        allNames={allNames}
        onSaved={() => { setMode('view'); onRefresh() }}
        onCancel={() => setMode('view')}
      />
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <strong style={{ fontSize: 15 }}>{product.name}</strong>
          <span style={{ marginLeft: 8 }}>
            <StockChip qty={product.stock_qty} lowLevel={product.low_stock_level} />
          </span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>
          {Number(product.stock_qty ?? 0).toLocaleString('en-NA')} {product.unit}
        </span>
      </div>

      <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
        {product.price != null && (
          <span>Selling: <strong>N${fmt(product.price)}</strong></span>
        )}
        {product.cost_price != null && (
          <span style={{ marginLeft: 12 }}>Cost: <strong>N${fmt(product.cost_price)}</strong></span>
        )}
        {product.low_stock_level > 0 && (
          <span style={{ marginLeft: 12, color: '#6b7280' }}>
            Alert at {Number(product.low_stock_level).toLocaleString('en-NA')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setMode('edit')}   style={ghostBtn}>Edit</button>
        <button onClick={() => setMode('addstock')} style={ghostBtn}>Add stock</button>
      </div>

      {mode === 'addstock' && (
        <AddStockForm
          product={product}
          userId={userId}
          onSaved={() => { setMode('view'); onRefresh() }}
          onCancel={() => setMode('view')}
        />
      )}
    </div>
  )
}

// ── main Stock page ───────────────────────────────────────────────────────────

export default function Stock({ userId }) {
  const [products,    setProducts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadErr,     setLoadErr]     = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setLoadErr('')
    const { data, error } = await supabase
      .from('products')
      .select('id, name, unit, price, cost_price, stock_qty, low_stock_level')
      .eq('user_id', userId)
      .order('name', { ascending: true })
    setLoading(false)
    if (error) { setLoadErr(error.message); return }
    setProducts(data ?? [])
  }, [userId])

  useEffect(() => { load() }, [load])

  const allNames = products.map((p) => p.name)

  return (
    <div style={{ padding: '16px 16px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Stock</h3>
        <button onClick={load} style={ghostBtn}>↺ Refresh</button>
      </div>

      {/* add product button / form */}
      {showAddForm ? (
        <ProductForm
          userId={userId}
          existing={null}
          allNames={allNames}
          onSaved={() => { setShowAddForm(false); load() }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          style={{ ...btnStyle('#16a34a'), width: '100%', marginBottom: 16 }}
        >
          + Add product
        </button>
      )}

      {loading && <p style={{ color: '#6b7280', padding: '24px 0', textAlign: 'center' }}>Loading…</p>}
      {loadErr  && <p style={{ color: '#dc2626', fontSize: 13 }}>Error: {loadErr}</p>}

      {!loading && !loadErr && products.length === 0 && (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '32px 0' }}>
          No products yet. Tap Add product to get started.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {products.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            userId={userId}
            allNames={allNames}
            onRefresh={load}
          />
        ))}
      </div>
    </div>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const sectionHead = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
}
const cardStyle = {
  background: '#ffffff', border: '1px solid #e5e7eb',
  borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '12px 14px',
}
const formCard = {
  background: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: 12, padding: '14px', marginBottom: 12,
}
const fieldStyle = {
  display: 'block', width: '100%', padding: '8px 10px', fontSize: 14,
  border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box',
  minHeight: 44, marginBottom: 8,
}
const labelStyle = {
  display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 2,
}
const errStyle = {
  fontSize: 12, color: '#dc2626', background: '#fef2f2',
  border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 10px', margin: '4px 0 0',
}
const btnStyle = (bg) => ({
  background: bg, color: '#fff', border: 'none',
  borderRadius: 8, padding: '10px 16px', fontSize: 14,
  cursor: 'pointer', minHeight: 44, fontWeight: 500,
})
const ghostBtn = {
  background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
  padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#374151',
  minHeight: 44,
}
const chipGreen = {
  display: 'inline-block', padding: '1px 7px', borderRadius: 10, fontSize: 11,
  background: '#dcfce7', color: '#166534', fontWeight: 600,
}
const chipAmber = {
  display: 'inline-block', padding: '1px 7px', borderRadius: 10, fontSize: 11,
  background: '#fef9c3', color: '#854d0e', fontWeight: 600,
}
const chipRed = {
  display: 'inline-block', padding: '1px 7px', borderRadius: 10, fontSize: 11,
  background: '#fee2e2', color: '#991b1b', fontWeight: 600,
}
