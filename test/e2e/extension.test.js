import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import process from 'node:process'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { URL, fileURLToPath } from 'node:url'
import { Builder, By, until } from 'selenium-webdriver'
import firefox from 'selenium-webdriver/firefox.js'
import { download } from 'geckodriver'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const EXTENSION_DIR = resolve(ROOT_DIR, 'extension')
const WAIT_MS = 15_000

let driver
let extensionBaseUrl
let fixtureServer
let fixtureBaseUrl

function escapeHtml (value) {
  return String(value).
    replaceAll('&', '&amp;').
    replaceAll('<', '&lt;').
    replaceAll('>', '&gt;').
    replaceAll('"', '&quot;')
}

async function createFixtureServer () {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname !== '/title') {
      response.writeHead(404).end()
      return
    }

    const title = url.searchParams.get('title') || ''
    const suffix = url.searchParams.get('suffix') || ''
    const token = url.searchParams.get('token') || ''
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    })
    response.end(
      '<!doctype html><meta charset="utf-8"><title>' +
      escapeHtml(title) +
      '</title><body>' +
      escapeHtml(token + '-' + suffix) +
      '</body>',
    )
  })

  await new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('listening', handleListening)
      reject(error)
    }
    const handleListening = () => {
      server.off('error', handleError)
      resolve()
    }
    server.once('error', handleError)
    server.once('listening', handleListening)
    server.listen(0, '127.0.0.1')
  })
  const address = server.address()
  return {
    baseUrl: 'http://127.0.0.1:' + address.port + '/',
    server,
  }
}

async function closeFixtureServer () {
  if (!fixtureServer) {
    return
  }
  await new Promise((resolve, reject) => {
    fixtureServer.close((error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
  fixtureServer = undefined
}

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
        Boolean(document.getElementById('useGroupNameAsGroupTitle')) &&
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
    throw new Error([result.message, result.stack].filter(Boolean).join('\n'))
  }
  return result.value
}

async function runSortFixture (scenarioScript, ...args) {
  return await runExtensionScript(`
    const { run } = await import(browser.runtime.getURL('sort.js'))
    const token = 'click-tab-sort-e2e-' + Date.now() + '-' + Math.random()
    const windowIds = []

    const makeUrl = suffix => 'about:blank#' + token + '-' + suffix
    const tabId = tab => typeof tab === 'number' ? tab : tab.id
    const pickTabState = tab => ({
      id: tab.id,
      url: tab.url,
      index: tab.index,
      pinned: tab.pinned,
      groupId: tab.groupId,
      splitViewId: tab.splitViewId,
    })

    const makeTitleUrl = (baseUrl, suffix, title) => {
      const url = new URL('title', baseUrl)
      url.searchParams.set('token', token)
      url.searchParams.set('suffix', suffix)
      url.searchParams.set('title', title)
      return url.href
    }

    async function createWindowTabsFromUrls (urls) {
      const testWindow = await browser.windows.create({
        focused: true,
        url: urls[0],
      })
      windowIds.push(testWindow.id)

      const initialTabs = testWindow.tabs ||
        await browser.tabs.query({ windowId: testWindow.id })
      const tabs = [
        [...initialTabs].sort((tab1, tab2) => tab1.index - tab2.index)[0],
      ]
      for (const url of urls.slice(1)) {
        tabs.push(await browser.tabs.create({
          active: false,
          windowId: testWindow.id,
          url,
        }))
      }

      const tabIds = tabs.map(tab => tab.id)
      const settledTabs = await waitUntil(async () => {
        const currentTabs = []
        for (const id of tabIds) {
          const tab = await browser.tabs.get(id).catch(() => null)
          if (!tab) {
            return
          }
          currentTabs.push(tab)
        }
        return currentTabs.every((tab, index) => tab.url === urls[index]) &&
          currentTabs
      }, 10000)
      if (!settledTabs) {
        throw new Error('created tab URLs did not settle')
      }

      return {
        windowId: testWindow.id,
        tabs: settledTabs,
        tabIds,
        urls,
      }
    }

    async function createWindowTabs (suffixes) {
      return await createWindowTabsFromUrls(suffixes.map(makeUrl))
    }

    async function waitForTitles (tabIds, titles) {
      const titledTabs = await waitUntil(async () => {
        const currentTabs = []
        for (const id of tabIds) {
          const tab = await browser.tabs.get(id).catch(() => null)
          if (!tab) {
            return
          }
          currentTabs.push(tab)
        }
        return currentTabs.every((tab, index) => tab.title === titles[index]) &&
          currentTabs
      }, 10000)
      if (!titledTabs) {
        const currentTabs = []
        for (const id of tabIds) {
          currentTabs.push(await browser.tabs.get(id).catch(error => ({
            error: error?.message || String(error),
            id,
          })))
        }
        throw new Error(
          'expected tab titles ' + titles.join(', ') +
          ', got ' + currentTabs.map(tab => tab.title).join(', '),
        )
      }
      return titledTabs
    }

    async function updateTabs (tabs, properties) {
      const ids = tabs.map(tabId)
      for (const id of ids) {
        await browser.tabs.update(id, properties)
      }

      const updatedTabs = await waitUntil(async () => {
        const currentTabs = []
        for (const id of ids) {
          const tab = await browser.tabs.get(id).catch(() => null)
          if (!tab) {
            return
          }
          currentTabs.push(tab)
        }
        if (properties.pinned !== undefined &&
            !currentTabs.every(tab => tab.pinned === properties.pinned)) {
          return
        }
        return currentTabs
      }, 10000)
      if (!updatedTabs) {
        throw new Error('tab updates did not settle')
      }
      return updatedTabs
    }

    async function groupTabs (tabs) {
      if (typeof browser.tabs.group !== 'function') {
        throw new Error('browser.tabs.group is not available')
      }

      const ids = tabs.map(tabId)
      const sourceTab = await browser.tabs.get(ids[0])
      const groupId = await browser.tabs.group({
        createProperties: {
          windowId: sourceTab.windowId,
        },
        tabIds: ids,
      })
      if (typeof browser.tabGroups?.update === 'function') {
        await browser.tabGroups.update(groupId, { collapsed: false }).
          catch(() => {})
      }
      const groupedTabs = await waitUntil(async () => {
        const currentTabs = []
        for (const id of ids) {
          const tab = await browser.tabs.get(id).catch(() => null)
          if (!tab) {
            return
          }
          currentTabs.push(tab)
        }
        return currentTabs.every(tab => tab.groupId === groupId) &&
          currentTabs
      }, 10000)
      if (!groupedTabs) {
        throw new Error('tab group creation did not settle')
      }
      return { groupId, tabs: groupedTabs }
    }

    async function getOrderedTabs (windowId, tabIds) {
      const tabIdSet = new Set(tabIds)
      const tabs = await browser.tabs.query({ windowId })
      return tabs.
        filter(tab => tabIdSet.has(tab.id)).
        sort((tab1, tab2) => tab1.index - tab2.index)
    }

    async function waitForUrlOrder (windowId, tabIds, expectedUrls) {
      const orderedTabs = await waitUntil(async () => {
        const tabs = await getOrderedTabs(windowId, tabIds)
        if (tabs.length !== tabIds.length) {
          return
        }

        const orderedUrls = tabs.map(tab => tab.url)
        return orderedUrls.join('\\n') === expectedUrls.join('\\n') && tabs
      }, 10000)
      if (!orderedTabs) {
        const actual = await getOrderedTabs(windowId, tabIds)
        const direct = []
        for (const id of tabIds) {
          direct.push(await browser.tabs.get(id).catch(error => ({
            error: error?.message || String(error),
            id,
          })))
        }
        throw new Error(
          'expected tab order ' + expectedUrls.join(', ') +
          ', got ' + actual.map(tab => tab.url).join(', ') +
          ', direct ' + JSON.stringify(direct.map(pickTabState)),
        )
      }
      return orderedTabs.map(pickTabState)
    }

    async function waitForOrder (windowId, tabIds, suffixes) {
      return await waitForUrlOrder(windowId, tabIds, suffixes.map(makeUrl))
    }

    try {
      ${scenarioScript}
    } finally {
      for (const windowId of windowIds.reverse()) {
        await browser.windows.remove(windowId).catch(() => {})
      }
    }
  `, ...args)
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
    const fixture = await createFixtureServer()
    fixtureServer = fixture.server
    fixtureBaseUrl = fixture.baseUrl

    driver = await createDriver()
    const addonId = await driver.installAddon(EXTENSION_DIR, true)
    extensionBaseUrl = await getExtensionBaseUrl(addonId)
    assert.ok(extensionBaseUrl, '拡張機能の moz-extension URL を取得できません')
  })

  after(async () => {
    try {
      if (driver) {
        await driver.quit()
      }
    } finally {
      await closeFixtureServer()
    }
  })

  test('options page saves settings and restores them after reload', async () => {
    await openFreshOptionsPage()

    assert.equal(await isChecked('tab'), true)
    assert.equal(await isChecked('all'), false)
    assert.equal(await isChecked('menuItems_url_currentArea'), false)
    assert.equal(await isChecked('menuItems_url_allGroups'), true)
    assert.equal(await isChecked('menuItems_title_currentArea'), false)
    assert.equal(await isChecked('menuItems_title_allGroups'), true)
    assert.equal(await isChecked('menuItems_reverse_currentArea'), false)
    assert.equal(await isChecked('useGroupNameAsGroupTitle'), false)
    assert.equal(await isChecked('notification'), false)

    await setCheckboxValue('all', true)
    await setCheckboxValue('menuItems_url_allGroups', true)
    await setCheckboxValue('menuItems_title_allGroups', false)
    await setCheckboxValue('menuItems_reverse_currentArea', true)
    await setCheckboxValue('useGroupNameAsGroupTitle', true)

    await waitForStorageData((data) => {
      return data.contexts?.includes('tab') &&
        data.contexts?.includes('all') &&
        !data.menuItems?.url?.includes('currentArea') &&
        data.menuItems?.url?.includes('allGroups') &&
        !data.menuItems?.title?.includes('currentArea') &&
        !data.menuItems?.title?.includes('allGroups') &&
        data.menuItems?.reverse?.includes('currentArea') &&
        data.useGroupNameAsGroupTitle === true &&
        data.notification === false
    }, 'options page settings were not saved')

    await driver.navigate().refresh()
    await waitForOptionsPage()

    assert.equal(await isChecked('tab'), true)
    assert.equal(await isChecked('all'), true)
    assert.equal(await isChecked('menuItems_url_currentArea'), false)
    assert.equal(await isChecked('menuItems_url_allGroups'), true)
    assert.equal(await isChecked('menuItems_title_currentArea'), false)
    assert.equal(await isChecked('menuItems_title_allGroups'), false)
    assert.equal(await isChecked('menuItems_reverse_currentArea'), true)
    assert.equal(await isChecked('useGroupNameAsGroupTitle'), true)
    assert.equal(await isChecked('notification'), false)
  })

  test('run sorts tabs by URL in Firefox', async () => {
    await openFreshOptionsPage()

    const result = await runSortFixture(`
      const { windowId, tabs, tabIds } = await createWindowTabs(['c', 'a', 'b'])

      await run(windowId, 'url', false, false, 'currentArea', tabs[0].id)
      const ordered = await waitForOrder(windowId, tabIds, ['a', 'b', 'c'])

      return {
        expectedUrls: ['a', 'b', 'c'].map(makeUrl),
        orderedUrls: ordered.map(tab => tab.url),
      }
    `)

    assert.deepEqual(result.orderedUrls, result.expectedUrls)
  })

  test('run sorts tabs by title in Firefox', async () => {
    await openFreshOptionsPage()

    const result = await runSortFixture(`
      const specs = [
        { suffix: 'c', title: 'Charlie' },
        { suffix: 'a', title: 'Alpha' },
        { suffix: 'b', title: 'Bravo' },
      ]
      const titleBaseUrl = args[0]
      const urls = specs.map(({ suffix, title }) => {
        return makeTitleUrl(titleBaseUrl, suffix, title)
      })
      const { windowId, tabs, tabIds } = await createWindowTabsFromUrls(urls)
      await waitForTitles(tabIds, specs.map(({ title }) => title))

      await run(windowId, 'title', false, false, 'currentArea', tabs[0].id)
      const expectedUrls = [urls[1], urls[2], urls[0]]
      const ordered = await waitForUrlOrder(windowId, tabIds, expectedUrls)

      return {
        expectedUrls,
        orderedUrls: ordered.map(tab => tab.url),
      }
    `, fixtureBaseUrl)

    assert.deepEqual(result.orderedUrls, result.expectedUrls)
  })

  test('run reverses current tab order in Firefox', async () => {
    await openFreshOptionsPage()

    const result = await runSortFixture(`
      const { windowId, tabs, tabIds } = await createWindowTabs(['a', 'b', 'c'])

      await run(windowId, 'reverse', false, false, 'currentArea', tabs[0].id)
      const ordered = await waitForOrder(windowId, tabIds, ['c', 'b', 'a'])

      return {
        expectedUrls: ['c', 'b', 'a'].map(makeUrl),
        orderedUrls: ordered.map(tab => tab.url),
      }
    `)

    assert.deepEqual(result.orderedUrls, result.expectedUrls)
  })

  test('run sorts only the pinned or unpinned segment in Firefox', async () => {
    await openFreshOptionsPage()

    const result = await runSortFixture(`
      const { windowId, tabs, tabIds } = await createWindowTabs([
        'z-pinned',
        'a-pinned',
        'c-normal',
        'b-normal',
      ])
      await updateTabs([tabs[0], tabs[1]], { pinned: true })

      await run(windowId, 'url', false, false, 'currentArea', tabs[2].id)
      const afterNormalSort = await waitForOrder(windowId, tabIds, [
        'z-pinned',
        'a-pinned',
        'b-normal',
        'c-normal',
      ])

      await run(windowId, 'url', true, false, 'currentArea', tabs[0].id)
      const afterPinnedSort = await waitForOrder(windowId, tabIds, [
        'a-pinned',
        'z-pinned',
        'b-normal',
        'c-normal',
      ])

      return { afterNormalSort, afterPinnedSort }
    `)

    assert.deepEqual(result.afterNormalSort.map((tab) => tab.pinned), [
      true,
      true,
      false,
      false,
    ])
    assert.deepEqual(result.afterPinnedSort.map((tab) => tab.pinned), [
      true,
      true,
      false,
      false,
    ])
  })

  test('run sorts only the clicked group for currentArea in Firefox', async () => {
    await openFreshOptionsPage()

    const result = await runSortFixture(`
      const { windowId, tabs, tabIds } = await createWindowTabs([
        'z-top',
        'c-group',
        'a-group',
        'b-top',
      ])
      const { groupId } = await groupTabs([tabs[1], tabs[2]])

      await run(windowId, 'url', false, false, 'currentArea', tabs[1].id)
      const ordered = await waitForOrder(windowId, tabIds, [
        'z-top',
        'a-group',
        'c-group',
        'b-top',
      ])

      return { groupId, ordered }
    `)

    assert.equal(result.ordered[1].groupId, result.groupId)
    assert.equal(result.ordered[2].groupId, result.groupId)
    assert.notEqual(result.ordered[0].groupId, result.groupId)
    assert.notEqual(result.ordered[3].groupId, result.groupId)
  })

  test('run sorts top-level units without changing group internals in Firefox',
    async () => {
      await openFreshOptionsPage()

      const result = await runSortFixture(`
        const { windowId, tabs, tabIds } = await createWindowTabs([
          'c-top',
          'b-group',
          'a-group',
          'aa-top',
        ])
        const { groupId } = await groupTabs([tabs[1], tabs[2]])

        await run(windowId, 'url', false, false, 'currentArea', tabs[0].id)
        const ordered = await waitForOrder(windowId, tabIds, [
          'aa-top',
          'b-group',
          'a-group',
          'c-top',
        ])

        return { groupId, ordered }
      `)

      assert.equal(result.ordered[1].groupId, result.groupId)
      assert.equal(result.ordered[2].groupId, result.groupId)
      assert.notEqual(result.ordered[0].groupId, result.groupId)
      assert.notEqual(result.ordered[3].groupId, result.groupId)
    })

  test('run sorts all groups and top-level units for allGroups in Firefox',
    async () => {
      await openFreshOptionsPage()

      const result = await runSortFixture(`
        const { windowId, tabs, tabIds } = await createWindowTabs([
          'z-top',
          'c-g1',
          'b-g1',
          'd-top',
          'e-g2',
          'a-g2',
        ])
        const firstGroup = await groupTabs([tabs[1], tabs[2]])
        const secondGroup = await groupTabs([tabs[4], tabs[5]])

        await run(windowId, 'url', false, false, 'allGroups', tabs[0].id)
        const ordered = await waitForOrder(windowId, tabIds, [
          'a-g2',
          'e-g2',
          'b-g1',
          'c-g1',
          'd-top',
          'z-top',
        ])

        return {
          firstGroupId: firstGroup.groupId,
          secondGroupId: secondGroup.groupId,
          ordered,
        }
      `)

      assert.equal(result.ordered[0].groupId, result.secondGroupId)
      assert.equal(result.ordered[1].groupId, result.secondGroupId)
      assert.equal(result.ordered[2].groupId, result.firstGroupId)
      assert.equal(result.ordered[3].groupId, result.firstGroupId)
      assert.notEqual(result.ordered[4].groupId, result.firstGroupId)
      assert.notEqual(result.ordered[4].groupId, result.secondGroupId)
      assert.notEqual(result.ordered[5].groupId, result.firstGroupId)
      assert.notEqual(result.ordered[5].groupId, result.secondGroupId)
    })
})
