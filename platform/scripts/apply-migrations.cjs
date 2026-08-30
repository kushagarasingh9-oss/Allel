#!/usr/bin/env node
/**
 * apply-migrations.cjs
 * Applies recovery SQL migrations via Supabase Management API
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

// Load env from .env.local
const envFile = path.join(__dirname, '../.env.local')
const env = fs.readFileSync(envFile, 'utf8')
  .split('\n')
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .reduce((acc, l) => {
    const [k, ...v] = l.split('=')
    acc[k.trim()] = v.join('=').trim()
    return acc
  }, {})

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'] // e.g. https://xxxx.supabase.co
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Project ref is the subdomain of supabase.co
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]
console.log('Project ref:', projectRef)

const MIGRATIONS = [
  '../../database/migrations/20260822_recovery_core.sql',
  '../../database/migrations/20260822_recovery_hardening.sql',
  '../../database/migrations/20260822_recovery_queue.sql',
  '../../database/migrations/20260822_recovery_rls_and_rpc.sql',
  '../../database/migrations/20260829_recovery_workflow_integrity.sql',
  '../../database/migrations/20260829_recovery_scenario_runs.sql',
  '../../database/migrations/20260830_recovery_authoritative_integrity.sql',
  '../../database/migrations/20260831_identity_hardening.sql',
  '../../database/migrations/20260831_identity_atomic_rpcs.sql',
  '../../database/migrations/20260901_identity_security_and_integrity.sql',
]

function post(host, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: host,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${token}`,
        'apikey': token,
      }
    }, res => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }) }
        catch { resolve({ status: res.statusCode, body: raw }) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function runSQL(sql, label) {
  console.log(`\nApplying: ${label}`)
  // Use Supabase REST pg endpoint via service role key
  const host = `${projectRef}.supabase.co`
  const res = await post(host, '/rest/v1/rpc/exec_sql', SERVICE_KEY, { sql })
  if (res.status === 200 || res.status === 204) {
    console.log(`  ✅ Applied successfully`)
    return true
  }
  // Fallback: try via query endpoint
  const res2 = await post('api.supabase.com', `/v1/projects/${projectRef}/database/query`, SERVICE_KEY, { query: sql })
  if (res2.status === 201 || res2.status === 200) {
    console.log(`  ✅ Applied via management API`)
    return true
  }
  console.error(`  ❌ Migration failed: status ${res2.status}`)
  console.error(`  Response:`, typeof res2.body === 'string' ? res2.body.slice(0, 300) : JSON.stringify(res2.body).slice(0, 300))
  return false
}

async function main() {
  console.log('\n🗄️  Applying Allel Recovery Migrations\n')
  for (const f of MIGRATIONS) {
    const filePath = path.join(__dirname, f)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Migration file not found: ${filePath}`)
    }
    const sql = fs.readFileSync(filePath, 'utf8')
    const label = path.basename(f)
    const applied = await runSQL(sql, label)
    if (!applied) {
      throw new Error(`Migration failed: ${label}`)
    }
  }
  console.log('\n✅ All recovery migrations applied successfully.\n')
}

main().catch((err) => {
  console.error('\n💥 Migration execution failed:', err.message)
  process.exit(1)
})
