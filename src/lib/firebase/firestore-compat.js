/**
 * Firestore-compatible API layer backed by Supabase.
 * Provides the same function signatures (doc, collection, getDocs, etc.)
 * so that large files (App.jsx, VPNServiceApp.jsx, dashboardService, adminService)
 * can work without rewriting every call site.
 *
 * Data is stored in vpn_firestore_documents (generic JSONB store) and
 * vpn_users / vpn_tariffs / vpn_payments (typed tables).
 */
import { supabase } from '../supabase/client.js'

const TABLE = 'vpn_firestore_documents'

function extractAppId(path) {
  const parts = path.split('/')
  if (parts[0] === 'artifacts' && parts.length >= 2) return parts[1]
  return null
}

function extractCollectionName(path) {
  const parts = path.split('/')
  return parts[parts.length - 1]
}

export const CACHE_SIZE_UNLIMITED = -1

class DocRef {
  constructor(path) {
    this.path = path
    const parts = path.split('/')
    this.id = parts[parts.length - 1]
    this.parent = { path: parts.slice(0, -1).join('/') }
  }
}

class CollectionRef {
  constructor(path) {
    this.path = path
    const parts = path.split('/')
    this.id = parts[parts.length - 1]
  }
}

class DocSnapshot {
  constructor(id, data, exists) {
    this._id = id
    this._data = data
    this._exists = exists
    this.id = id
    this.ref = { path: '', id }
  }
  exists() { return this._exists }
  data() { return this._data }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs
    this.empty = docs.length === 0
    this.size = docs.length
  }
  forEach(cb) { this.docs.forEach(cb) }
}

export function doc(dbOrRef, ...pathSegments) {
  if (dbOrRef instanceof CollectionRef) {
    const docId = pathSegments[0] || crypto.randomUUID()
    return new DocRef(`${dbOrRef.path}/${docId}`)
  }
  const fullPath = pathSegments.join('/')
  return new DocRef(fullPath)
}

export function collection(dbOrRef, ...pathSegments) {
  if (dbOrRef instanceof DocRef) {
    return new CollectionRef(`${dbOrRef.path}/${pathSegments.join('/')}`)
  }
  return new CollectionRef(pathSegments.join('/'))
}

export async function getDoc(docRef) {
  if (!supabase) return new DocSnapshot(docRef.id, null, false)

  const isSettings = docRef.path.endsWith('/public/settings')
  if (isSettings) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('document_path', docRef.path)
      .maybeSingle()
    if (error || !data) return new DocSnapshot(docRef.id, null, false)
    return new DocSnapshot(data.document_id, data.data, true)
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('document_path', docRef.path)
    .maybeSingle()

  if (error || !data) return new DocSnapshot(docRef.id, null, false)
  return new DocSnapshot(data.document_id, data.data, true)
}

export async function getDocs(queryOrRef) {
  if (!supabase) return new QuerySnapshot([])

  const collPath = queryOrRef._collectionPath || (queryOrRef instanceof CollectionRef ? queryOrRef.path : queryOrRef.path)
  const appId = extractAppId(collPath)
  const collectionName = extractCollectionName(collPath)

  let q = supabase
    .from(TABLE)
    .select('*')
    .eq('collection_path', collPath)

  if (appId) q = q.eq('app_id', appId)

  if (queryOrRef._filters) {
    for (const f of queryOrRef._filters) {
      if (f.op === '==' && f.field !== '__collection__') {
        q = q.contains('data', { [f.field]: f.value })
      } else if (f.op === 'in') {
        q = q.or(f.value.map((v) => `data->>${f.field}.eq.${v}`).join(','))
      }
    }
  }

  if (queryOrRef._orderField) {
    q = q.order('source_created_at', { ascending: queryOrRef._orderDir === 'asc' })
  }

  if (queryOrRef._limitCount) {
    q = q.limit(queryOrRef._limitCount)
  }

  const { data, error } = await q
  if (error) throw error

  const docs = (data || []).map((row) => {
    const snap = new DocSnapshot(row.document_id, row.data, true)
    snap.ref = new DocRef(row.document_path)
    return snap
  })

  return new QuerySnapshot(docs)
}

export async function setDoc(docRef, data, options = {}) {
  if (!supabase) throw new Error('Supabase not configured')

  const collectionPath = docRef.parent.path
  const appId = extractAppId(docRef.path)
  const collectionName = extractCollectionName(collectionPath)
  const now = new Date().toISOString()

  if (options.merge) {
    const { data: existing } = await supabase
      .from(TABLE)
      .select('data')
      .eq('document_path', docRef.path)
      .maybeSingle()

    const merged = existing ? { ...existing.data, ...data } : data

    const { error } = await supabase.from(TABLE).upsert({
      app_id: appId,
      document_path: docRef.path,
      collection_path: collectionPath,
      collection_name: collectionName,
      document_id: docRef.id,
      data: merged,
      source_updated_at: now,
    }, { onConflict: 'document_path' })

    if (error) throw error
  } else {
    const { error } = await supabase.from(TABLE).upsert({
      app_id: appId,
      document_path: docRef.path,
      collection_path: collectionPath,
      collection_name: collectionName,
      document_id: docRef.id,
      data,
      source_created_at: data.createdAt || now,
      source_updated_at: data.updatedAt || now,
    }, { onConflict: 'document_path' })

    if (error) throw error
  }
}

export async function updateDoc(docRef, data) {
  if (!supabase) throw new Error('Supabase not configured')

  const { data: existing, error: fetchErr } = await supabase
    .from(TABLE)
    .select('data')
    .eq('document_path', docRef.path)
    .maybeSingle()

  if (fetchErr) throw fetchErr
  if (!existing) throw new Error(`Document not found: ${docRef.path}`)

  const merged = { ...existing.data, ...data }
  const { error } = await supabase
    .from(TABLE)
    .update({ data: merged, source_updated_at: new Date().toISOString() })
    .eq('document_path', docRef.path)

  if (error) throw error
}

export async function deleteDoc(docRef) {
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('document_path', docRef.path)

  if (error) throw error
}

export async function addDoc(collectionRef, data) {
  const docId = crypto.randomUUID()
  const docRef = new DocRef(`${collectionRef.path}/${docId}`)
  await setDoc(docRef, data)
  docRef.id = docId
  return docRef
}

class QueryObj {
  constructor(collectionPath, filters, orderField, orderDir, limitCount) {
    this._collectionPath = collectionPath
    this._filters = filters || []
    this._orderField = orderField
    this._orderDir = orderDir || 'asc'
    this._limitCount = limitCount
  }
}

export function query(collectionRef, ...constraints) {
  let filters = []
  let orderField = null
  let orderDir = 'asc'
  let limitCount = null

  for (const c of constraints) {
    if (c._type === 'where') filters.push(c)
    else if (c._type === 'orderBy') { orderField = c.field; orderDir = c.dir }
    else if (c._type === 'limit') limitCount = c.count
    else if (c._type === 'startAfter') { /* cursor pagination not needed for compat layer */ }
  }

  return new QueryObj(collectionRef.path, filters, orderField, orderDir, limitCount)
}

export function where(field, op, value) {
  return { _type: 'where', field, op, value }
}

export function orderBy(field, dir = 'asc') {
  return { _type: 'orderBy', field, dir }
}

export function limit(count) {
  return { _type: 'limit', count }
}

export function startAfter() {
  return { _type: 'startAfter' }
}

export function serverTimestamp() {
  return new Date().toISOString()
}

export function onSnapshot(refOrQuery, onNext, onError) {
  let cancelled = false
  const poll = async () => {
    if (cancelled) return
    try {
      if (refOrQuery instanceof DocRef) {
        const snap = await getDoc(refOrQuery)
        if (!cancelled) onNext(snap)
      } else {
        const snap = await getDocs(refOrQuery)
        if (!cancelled) onNext(snap)
      }
    } catch (err) {
      if (!cancelled && onError) onError(err)
    }
  }
  poll()
  const interval = setInterval(poll, 10000)
  return () => { cancelled = true; clearInterval(interval) }
}

export function getFirestore() {
  return supabase
}

export function writeBatch() {
  const ops = []
  return {
    set(docRef, data) { ops.push({ type: 'set', docRef, data }) },
    update(docRef, data) { ops.push({ type: 'update', docRef, data }) },
    delete(docRef) { ops.push({ type: 'delete', docRef }) },
    async commit() {
      for (const op of ops) {
        if (op.type === 'set') await setDoc(op.docRef, op.data)
        else if (op.type === 'update') await updateDoc(op.docRef, op.data)
        else if (op.type === 'delete') await deleteDoc(op.docRef)
      }
    },
  }
}
