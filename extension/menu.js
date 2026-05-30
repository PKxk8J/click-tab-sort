import {
  ALL_MENU_ITEMS,
  KEY_CONTEXTS,
  KEY_MENU_ITEMS,
  KEY_NOTIFICATION,
  KEY_SORT,
  KEY_SORT_BY,
  debug,
  getValue,
  normalizeContexts,
  normalizeMenuItems,
  normalizeNotification,
  onError,
} from './common.js'
import {
  run,
} from './sort.js'

const {
  i18n,
  menus,
  runtime,
  storage,
  tabs,
} = browser

let rebuildMenuPromise
let rebuildMenuRequested = false

function createMenuItem (properties) {
  return new Promise((resolve, reject) => {
    menus.create(properties, () => {
      if (runtime.lastError) {
        reject(runtime.lastError)
      } else {
        debug('Added ' + properties.title + ' menu item')
        resolve()
      }
    })
  })
}

async function rebuildMenu () {
  const [storedContexts, storedMenuItems] = await Promise.all([
    getValue(KEY_CONTEXTS),
    getValue(KEY_MENU_ITEMS),
  ])
  const contexts = normalizeContexts(storedContexts)
  const menuItems = normalizeMenuItems(storedMenuItems)

  await menus.removeAll()
  debug('Clear menu items')

  if (contexts.length <= 0 || menuItems.length <= 0) {
    return
  }

  if (menuItems.length === 1) {
    const key = menuItems[0]
    await createMenuItem({
      id: key,
      title: i18n.getMessage(KEY_SORT_BY, i18n.getMessage(key)),
      contexts,
    })
    return
  }

  await createMenuItem({
    id: KEY_SORT,
    title: i18n.getMessage(KEY_SORT),
    contexts,
  })
  for (const key of menuItems) {
    await createMenuItem({
      id: key,
      title: i18n.getMessage(key),
      contexts,
      parentId: KEY_SORT,
    })
  }
}

function queueRebuildMenu () {
  rebuildMenuRequested = true
  if (!rebuildMenuPromise) {
    rebuildMenuPromise = (async () => {
      while (rebuildMenuRequested) {
        rebuildMenuRequested = false
        await rebuildMenu()
      }
    })().finally(() => {
      rebuildMenuPromise = undefined
      if (rebuildMenuRequested) {
        queueRebuildMenu().catch(onError)
      }
    })
  }
  return rebuildMenuPromise
}

async function getCurrentTab () {
  const [tab] = await tabs.query({ active: true, currentWindow: true })
  return tab
}

async function handleMenuClick (info, tab) {
  if (!ALL_MENU_ITEMS.includes(info.menuItemId)) {
    return
  }

  const targetTab = tab || await getCurrentTab()
  if (!targetTab) {
    return
  }

  const notification = normalizeNotification(
    await getValue(KEY_NOTIFICATION),
  )
  await run(targetTab.windowId, info.menuItemId, targetTab.pinned,
    notification)
}

runtime.onInstalled.addListener(() => {
  return queueRebuildMenu().catch(onError)
})

runtime.onStartup.addListener(() => {
  return queueRebuildMenu().catch(onError)
})

storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return
  }
  if (changes[KEY_CONTEXTS] || changes[KEY_MENU_ITEMS]) {
    return queueRebuildMenu().catch(onError)
  }
})

menus.onClicked.addListener((info, tab) => {
  return handleMenuClick(info, tab).catch(onError)
})
