import process from 'node:process'
import { Builder } from 'selenium-webdriver'
import firefox from 'selenium-webdriver/firefox.js'
import { download } from 'geckodriver'

export async function createFirefoxDriver ({
  headless = false,
  preferences = {},
} = {}) {
  const geckoDriverPath = process.env.GECKODRIVER_PATH || await download()
  const options = new firefox.Options()

  for (const [name, value] of Object.entries(preferences)) {
    options.setPreference(name, value)
  }
  if (headless) {
    options.addArguments('-headless')
  }
  if (process.env.FIREFOX_BINARY) {
    options.setBinary(process.env.FIREFOX_BINARY)
  }

  return new Builder().
    forBrowser('firefox').
    setFirefoxOptions(options).
    setFirefoxService(
      new firefox.ServiceBuilder(geckoDriverPath).
        addArguments('--allow-system-access'),
    ).
    build()
}

export async function getExtensionBaseUrl (driver, addonId) {
  await driver.setContext(firefox.Context.CHROME)
  try {
    return await driver.executeScript(`
      const policy = WebExtensionPolicy.getByID(arguments[0])
      return policy?.getURL('') || null
    `, addonId)
  } finally {
    await driver.setContext(firefox.Context.CONTENT)
  }
}

export async function runExtensionScript (
  driver,
  script,
  args = [],
  { waitTimeout = 5000 } = {},
) {
  const result = await driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1]
    const waitTimeout = arguments[0]
    const args = Array.from(arguments).slice(1, -1)

    async function run () {
      const wait = msec => new Promise(resolve => setTimeout(resolve, msec))
      async function waitUntil (predicate, timeout = waitTimeout) {
        const startedAt = Date.now()
        while (Date.now() - startedAt < timeout) {
          const value = await predicate()
          if (value) {
            return value
          }
          await wait(100)
        }
        return await predicate()
      }

      ${script}
    }

    run().then(
      value => done({ ok: true, value }),
      error => done({
        ok: false,
        message: error?.message || String(error),
        stack: error?.stack || '',
      }),
    )
  `, waitTimeout, ...args)

  if (!result.ok) {
    throw new Error([result.message, result.stack].filter(Boolean).join('\n'))
  }
  return result.value
}
