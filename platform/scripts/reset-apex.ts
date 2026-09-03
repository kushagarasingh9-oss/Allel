import { createServiceClient } from '../src/foundation/database/service'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function resetApex() {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('recovery_cases')
    .update({
      status: 'open',
      sent_at: null,
      monitoring_started_at: null,
      approved_at: null,
      awaiting_approval_at: null,
    })
    .eq('customer_account_id', 'db2c8bb0-2286-4f40-97f4-7483aacbd655')
    .select()

  if (error) {
    console.error('❌ Failed to reset Apex MultiRail:', error.message)
    process.exit(1)
  }

  console.log('✅ Apex MultiRail successfully reset to [open] state!')
  console.log('You can now open chat, ask "How is Apex MultiRail doing?", and click the [ ✈️ Send ] button for your demo recording.')
}

resetApex()
