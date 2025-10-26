import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert'

import pairs from 'balanced-pairs'
import { getQuickJS } from 'quickjs-emscripten'

const markdownFile = './index.md'
const mdContents = String(fs.readFileSync(markdownFile))
const { blocks } = pairs(mdContents, { open: '```', close: '```' })

const run = async function (code, log, verify) {
  let last // what we'll return to Node
  const pending = [] // await if verify() returns a promise

  try {
    const QuickJS = await getQuickJS()
    const vm = QuickJS.newContext()

    const verifyHandle = vm.newFunction('verify', (...argv) => {
      // Convert VM handles -> plain JS for host
      const args = argv.map(h => vm.dump(h))

      // Call host verify
      const maybe = verify ? verify(...args) : args[0]

      // If verify is async, capture its resolved value
      if (maybe && typeof maybe.then === 'function') {
        pending.push(
          maybe.then(v => { last = v })
               .catch(e => { last = undefined; console.error(e) })
        )
      } else {
        last = maybe
      }

      // If you ALSO want the guest to receive a value:
      // - echo first argument back into the VM (or build a new handle)
      return argv[0] ?? vm.undefined
    })

    vm.setProp(vm.global, 'verify', verifyHandle)
    verifyHandle.dispose()

    // Run the guest code
    const result = vm.evalCode(code)
    if (result.error) throw new Error(vm.dump(result.error))
    result.value.dispose()

    // Drain any microtasks (Promise .then inside VM)
    vm.runtime.executePendingJobs?.()

    // Wait for host verify() if it was async
    if (pending.length) await Promise.all(pending)

    vm.dispose()
    return last
  } catch (e) {
    console.error(e)
    return undefined
  }
}

const decorate = code => code
const log = (...parts) => console.log(parts)

// Your verify returns a value; we’ll capture and return it from run()
const verify = async function (result) {
  console.log({ result }, 345)
  return result
}

blocks.forEach(async ({ body }) => {
  const codeStart = body.indexOf('\n')
  const lang = body.slice(0, codeStart)
  const code = body.slice(codeStart + 1)

  const test = decorate(code)
  const result = await run(test, log, verify)
  console.log({ result }) // <- now prints 123 and 4 (not undefined)
})
