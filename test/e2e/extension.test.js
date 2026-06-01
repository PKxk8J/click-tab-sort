import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import process from 'node:process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Builder, By, until } from 'selenium-webdriver'
import firefox from 'selenium-webdriver/firefox.js'
import { download } from 'geckodriver'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EXTENSION_DIR = resolve(ROOT_DIR, 'extension')
const WAIT_MS = 15_000

let driver
let extensionBaseUrl

async function createDriver () {
  const geckoDriverPath = process.env.GECKODRIVER_PATH || await download()
  const options = new firefox.Options()
  options.addArguments('-remote-allow-system-access')
  if (process.env.E2E_HEADLESS !== '0') {
    options.addArguments('-headless')
  }
  if (process.env.FIREFOX_BINARY) {
    options.setBinary(process.env.FIREFOX_BINARY)
  }

  return new Builder().
    forBrowser('firefox').
    setFirefoxOptions(options).
    setFirefoxService(new firefox.ServiceBuilder(geckoDriverPath)).
    build()
}

async function getExtensionBaseUrl (addonId) {
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

async function openExtensionPage (path) {
  await driver.get(extensionBaseUrl + path)
}

async function openFreshOptionsPage () {
  await openExtensionPage('options.html')
  await waitForOptionsPage()
  await runExtensionScript('await browser.storage.sync.clear()')
  await driver.navigate().refresh()
  await waitForOptionsPage()
}

async function waitForOptionsPage () {
  await driver.wait(until.elementLocated(By.id('tab')), WAIT_MS)
  await driver.wait(async () => {
    return await driver.executeScript(`
      return document.getElementById('label_name')?.textContent === 'ClickTabSort' &&
        Boolean(document.getElementById('menuItems_url_currentArea')) &&
        Boolean(document.getElementById('menuItems_url_allGroups')) &&
        Boolean(document.getElementById('menuItems_reverse_currentArea')) &&
        Boolean(document.getElementById('notification'))
    `)
  }, WAIT_MS)
}

async function runExtensionScript (script, ...args) {
  const result = await driver.executeAsyncScript(`
    const done = arguments[arguments.length - 1]
    const args = Array.from(arguments).slice(0, -1)

    async function run () {
      const wait = msec => new Promise(resolve => setTimeout(resolve, msec))
      async function waitUntil (predicate, timeout = 5000) {
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
  `, ...args)

  if (!result.ok) {
    throw new Error(result.stack || result.message)
  }
  return result.value
}

async function getStorageData () {
  return await runExtensionScript('return await browser.storage.sync.get()')
}

async function waitForStorageData (predicate, description) {
  let latest
  await driver.wait(async () => {
    latest = await getStorageData()
    return predicate(latest)
  }, WAIT_MS, description)
  return latest
}

async function setCheckboxValue (id, checked) {
  const input = await driver.findElement(By.id(id))
  await driver.executeScript(`
    if (arguments[0].checked === arguments[1]) {
      return
    }
    arguments[0].checked = arguments[1]
    arguments[0].dispatchEvent(new Event('change', { bubbles: true }))
  `, input, checked)
}

async function isChecked (id) {
  return await (await driver.findElement(By.id(id))).isSelected()
}

describe('Firefox extension E2E', () => {
  before(async () => {
    driver = await createDriver()
    const addonId = await driver.installAddon(EXTENSION_DIR, true)
    extensionBaseUrl = await getExtensionBaseUrl(addonId)
    assert.ok(extensionBaseUrl, '拡張機能の moz-extension URL を取得できません')
  })

  after(async () => {
    if (driver) {
      await driver.quit()
    }
  })

  test('options page saves settings and restores them after reload', async () => {
    await openFreshOptionsPage()

    assert.equal(await isChecked('tab'), true)
    assert.equal(await isChecked('all'), false)
    assert.equal(await isChecked('menuItems_url_currentArea'), true)
    assert.equal(await isChecked('menuItems_url_allGroups'), false)
    assert.equal(await isChecked('menuItems_title_currentArea'), true)
    assert.equal(await isChecked('menuItems_title_allGroups'), false)
    assert.equal(await isChecked('menuItems_reverse_currentArea'), false)
    assert.equal(await isChecked('notification'), false)

    await setCheckboxValue('all', true)
    await setCheckboxValue('menuItems_url_allGroups', true)
    await setCheckboxValue('menuItems_title_currentArea', false)
    await setCheckboxValue('menuItems_reverse_currentArea', true)

    await waitForStorageData((data) => {
      return data.contexts?.includes('tab') &&
        data.contexts?.includes('all') &&
        data.menuItems?.url?.includes('currentArea') &&
        data.menuItems?.url?.includes('allGroups') &&
        !data.menuItems?.title?.includes('currentArea') &&
        data.menuItems?.reverse?.includes('currentArea') &&
        data.notification === false
    }, 'options page settings were not saved')

    await driver.navigate().refresh()
    await waitForOptionsPage()

    assert.equal(await isChecked('tab'), true)
    assert.equal(await isChecked('all'), true)
    assert.equal(await isChecked('menuItems_url_currentArea'), true)
    assert.equal(await isChecked('menuItems_url_allGroups'), true)
    assert.equal(await isChecked('menuItems_title_currentArea'), false)
    assert.equal(await isChecked('menuItems_title_allGroups'), false)
    assert.equal(await isChecked('menuItems_reverse_currentArea'), true)
    assert.equal(await isChecked('notification'), false)
  })

  test('run sorts tabs by URL in Firefox', async () => {
    await openFreshOptionsPage()

    const result = await runExtensionScript(`
      const { run } = await import(browser.runtime.getURL('sort.js'))
      const token = 'click-tab-sort-e2e-' + Date.now() + '-' + Math.random()
      const tabUrls = [
        'about:blank#' + token + '-c',
        'about:blank#' + token + '-a',
        'about:blank#' + token + '-b',
      ]
      const expectedUrls = [...tabUrls].sort((url1, url2) =>
        url1.localeCompare(url2))
      const createdTabs = []

      try {
        for (const url of tabUrls) {
          createdTabs.push(await browser.tabs.create({
            active: false,
            url,
          }))
        }

        const sourceWindowId = createdTabs[0].windowId
        const createdTabIds = new Set(createdTabs.map(tab => tab.id))
        const ready = await waitUntil(async () => {
          const tabs = []
          for (const tab of createdTabs) {
            tabs.push(await browser.tabs.get(tab.id).catch(() => null))
          }
          return tabs.every((tab, index) => tab?.url === tabUrls[index])
        })
        if (!ready) {
          throw new Error('created tab URLs did not settle')
        }

        await run(sourceWindowId, 'url', false, false, 'currentArea',
          createdTabs[0].id)

        const sorted = await waitUntil(async () => {
          const tabs = await browser.tabs.query({
            windowId: sourceWindowId,
          })
          const ordered = tabs.
            filter(tab => createdTabIds.has(tab.id)).
            sort((tab1, tab2) => tab1.index - tab2.index)
          if (ordered.length !== createdTabs.length) {
            return
          }

          const orderedUrls = ordered.map(tab => tab.url)
          if (orderedUrls.join('\\n') === expectedUrls.join('\\n')) {
            return ordered
          }
        })
        if (!sorted) {
          throw new Error('created tabs were not sorted by URL')
        }

        return {
          expectedUrls,
          orderedUrls: sorted.map(tab => tab.url),
        }
      } finally {
        for (const tab of createdTabs) {
          await browser.tabs.remove(tab.id).catch(() => {})
        }
      }
    `)

    assert.deepEqual(result.orderedUrls, result.expectedUrls)
  })
})
