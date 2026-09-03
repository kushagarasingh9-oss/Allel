import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const {
  discoverMigrations,
  migrationVersion,
  sqlLiteral,
}: {
  discoverMigrations: () => string[]
  migrationVersion: (filePath: string) => string
  sqlLiteral: (value: string) => string
} = require('../../scripts/apply-migrations.cjs')

describe('migration runner', () => {
  it('uses the complete filename as the migration identity', () => {
    assert.equal(
      migrationVersion('/tmp/20260822_recovery_core.sql'),
      '20260822_recovery_core'
    )
    assert.notEqual(
      migrationVersion('/tmp/20260822_recovery_core.sql'),
      migrationVersion('/tmp/20260822_recovery_queue.sql')
    )
  })

  it('preserves dependency-safe ordering without duplicate identities', () => {
    const migrations = discoverMigrations()
    const versions = migrations.map(migrationVersion)

    assert.equal(migrations.length, 12)
    assert.equal(new Set(versions).size, versions.length)
    assert.ok(
      versions.indexOf('20260831_identity_hardening') <
        versions.indexOf('20260831_identity_atomic_rpcs'),
      'identity tables must exist before dependent RPCs are created'
    )
    assert.ok(
      migrations.every(filePath => path.extname(filePath) === '.sql'),
      'only SQL migrations should be discovered'
    )
  })

  it('escapes SQL string literals', () => {
    assert.equal(sqlLiteral("O'Reilly"), "'O''Reilly'")
  })
})
