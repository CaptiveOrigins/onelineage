/** Entry point Chrome starts (through the launcher the install script writes). See relay.ts. */
import { defaultStateDir } from '../state'
import { runRelay } from './relay'
import { socketPath } from './socket'

runRelay({
  argv: process.argv.slice(2),
  stdin: process.stdin,
  write: (b) => process.stdout.write(b),
  socketPath: socketPath(process.env['ONELINEAGE_STATE_DIR'] || defaultStateDir()),
  exit: (code) => process.exit(code),
})
