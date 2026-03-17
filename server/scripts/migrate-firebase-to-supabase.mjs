#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { initFirebaseAdmin } from '../lib/firebaseInit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(__dirname, '../../.env') })
loadEnv({ path: path.resolve(__dirname, '../.env') })

const APP_ID = process.env.APP_ID || 'skyputh'
const FIRESTORE_ROOT_DOC = `artifacts/${APP_ID}`
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in env (.env or server/.env).'
  )
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BATCH_SIZE = Number(process.env.MIGRATION_BATCH_SIZE || 250)

function getCollectionPath(documentPath) {
  const parts = documentPath.split('/')
  return parts.slice(0, parts.length - 1).join('/')
}

function getParentDocumentPath(documentPath) {
  const parts = documentPath.split('/')
  if (parts.length < 4) return null
  return parts.slice(0, parts.length - 2).join('/')
}

function parseDate(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString()
  }
  const asDate = new Date(value)
  return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString()
}

function normalizeForJson(value) {
  if (value === null || value === undefined) return value ?? null
  if (Array.isArray(value)) return value.map((item) => normalizeForJson(item))
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeForJson(v)
    }
    return out
  }
  return value
}

async function upsertBatch(table, rows, onConflict) {
  if (!rows.length) return
  const { error } = await supabase.from(table).upsert(rows, { onConflict })
  if (error) throw error
}

async function flushRows(rawRows, usersRows, tariffsRows, paymentsRows) {
  await upsertBatch('vpn_firestore_documents', rawRows, 'document_path')
  await upsertBatch('vpn_users', usersRows, 'uid')
  await upsertBatch('vpn_tariffs', tariffsRows, 'app_id,id')
  await upsertBatch('vpn_payments', paymentsRows, 'app_id,id')
}

function buildTypedRows(docPath, documentId, data) {
  const collectionPath = getCollectionPath(docPath)
  const usersPath = `artifacts/${APP_ID}/public/data/users_v4`
  const tariffsPath = `artifacts/${APP_ID}/public/data/tariffs`
  const paymentsPath = `artifacts/${APP_ID}/public/data/payments`

  const typed = { users: null, tariffs: null, payments: null }

  if (collectionPath === usersPath) {
    typed.users = {
      uid: documentId,
      app_id: APP_ID,
      email: data.email ?? null,
      name: data.name ?? null,
      phone: data.phone ?? null,
      role: data.role ?? null,
      plan: data.plan ?? null,
      uuid: data.uuid ?? null,
      sub_id: data.subId ?? null,
      expires_at: parseDate(data.expiresAt),
      tariff_id: data.tariffId ?? null,
      tariff_name: data.tariffName ?? null,
      photo_url: data.photoURL ?? null,
      language: data.language ?? null,
      referred_by: data.referredBy ?? null,
      raw: data,
      source_created_at: parseDate(data.createdAt),
      source_updated_at: parseDate(data.updatedAt),
      migrated_at: new Date().toISOString(),
    }
  } else if (collectionPath === tariffsPath) {
    typed.tariffs = {
      id: documentId,
      app_id: APP_ID,
      name: data.name ?? null,
      price: Number(data.price ?? 0) || 0,
      duration_days: Number(data.durationDays ?? data.days ?? 0) || null,
      is_active: typeof data.isActive === 'boolean' ? data.isActive : null,
      raw: data,
      source_created_at: parseDate(data.createdAt),
      source_updated_at: parseDate(data.updatedAt),
      migrated_at: new Date().toISOString(),
    }
  } else if (collectionPath === paymentsPath) {
    typed.payments = {
      id: documentId,
      app_id: APP_ID,
      user_id: data.userId ?? null,
      amount: Number(data.amount ?? 0) || 0,
      status: data.status ?? null,
      provider: data.provider ?? data.paymentMethod ?? null,
      tariff_id: data.tariffId ?? null,
      created_at: parseDate(data.createdAt),
      paid_at: parseDate(data.paidAt),
      raw: data,
      source_created_at: parseDate(data.createdAt),
      source_updated_at: parseDate(data.updatedAt),
      migrated_at: new Date().toISOString(),
    }
  }

  return typed
}

async function walkCollection(collectionRef, onDocument) {
  const snapshot = await collectionRef.get()
  for (const docSnap of snapshot.docs) {
    await onDocument(docSnap)
    const subCollections = await docSnap.ref.listCollections()
    for (const subCollection of subCollections) {
      await walkCollection(subCollection, onDocument)
    }
  }
}

async function run() {
  console.log(`Starting migration for APP_ID=${APP_ID}`)
  const { db } = await initFirebaseAdmin()
  if (!db) throw new Error('Firebase Admin SDK is not initialized. Check server/.env Firebase settings.')

  const rootDoc = db.doc(FIRESTORE_ROOT_DOC)
  const subCollections = await rootDoc.listCollections()
  if (!subCollections.length) {
    console.log(`No collections found under ${FIRESTORE_ROOT_DOC}`)
    return
  }

  const rawRows = []
  const usersRows = []
  const tariffsRows = []
  const paymentsRows = []

  let totalDocs = 0

  const maybeFlush = async () => {
    if (rawRows.length < BATCH_SIZE) return
    await flushRows(rawRows.splice(0), usersRows.splice(0), tariffsRows.splice(0), paymentsRows.splice(0))
    console.log(`Migrated ${totalDocs} docs...`)
  }

  for (const collection of subCollections) {
    await walkCollection(collection, async (docSnap) => {
      const docPath = docSnap.ref.path
      const collectionPath = getCollectionPath(docPath)
      const collectionName = collectionPath.split('/').at(-1)
      const data = normalizeForJson(docSnap.data())

      rawRows.push({
        app_id: APP_ID,
        document_path: docPath,
        collection_path: collectionPath,
        collection_name: collectionName,
        document_id: docSnap.id,
        parent_document_path: getParentDocumentPath(docPath),
        data,
        source_created_at: parseDate(data.createdAt),
        source_updated_at: parseDate(data.updatedAt),
        migrated_at: new Date().toISOString(),
      })

      const typed = buildTypedRows(docPath, docSnap.id, data)
      if (typed.users) usersRows.push(typed.users)
      if (typed.tariffs) tariffsRows.push(typed.tariffs)
      if (typed.payments) paymentsRows.push(typed.payments)

      totalDocs += 1
      await maybeFlush()
    })
  }

  await flushRows(rawRows, usersRows, tariffsRows, paymentsRows)
  console.log(`Migration completed. Total documents: ${totalDocs}`)
}

run().catch((error) => {
  console.error('Migration failed:', error.message)
  process.exit(1)
})
