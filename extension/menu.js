import {
  ALL_MENU_ITEMS,
  KEY_ALL_GROUPS,
  KEY_CONTEXTS,
  KEY_CURRENT_AREA,
  KEY_CURRENT_GROUP_ONLY,
  KEY_MENU_ITEMS,
  KEY_NOTIFICATION,
  KEY_SORT,
  KEY_SORT_BY,
  KEY_TOP_LEVEL_ONLY,
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

function getNoGroupId () {
  return browser.tabGroups?.TAB_GROUP_ID_NONE ?? -1
}

function isGroupedTab (tab) {
  return tab.groupId !== undefined && tab.groupId !== getNoGroupId()
}

function getSingleMenuId (key) {
  return 'single:' + key
}

function getKeyMenuId (key) {
  return 'key:' + key
}

function getScopeMenuId (key, scope) {
  return 'scope:' + key + ':' + scope
}

function parseSingleMenuId (id) {
  const parts = id.split(':')
  if (parts.length !== 2 || parts[0] !== 'single') {
    return
  }

  const [, key] = parts
  if (!ALL_MENU_ITEMS.includes(key)) {
    return
  }
  return { key }
}

function parseScopeMenuId (id) {
  const parts = id.split(':')
  if (parts.length !== 3 || parts[0] !== 'scope') {
    return
  }

  const [, key, scope] = parts
  if (!ALL_MENU_ITEMS.includes(key) ||
      ![KEY_CURRENT_AREA, KEY_ALL_GROUPS].includes(scope)) {
    return
  }
  return { key, scope }
}

function getMenuEntries (menuItems) {
  return ALL_MENU_ITEMS.
    filter((key) => menuItems[key]?.length > 0).
    map((key) => ({ key, scopes: menuItems[key] }))
}

function getScopeTitle (scope, targetTab) {
  if (scope === KEY_ALL_GROUPS) {
    return i18n.getMessage(KEY_ALL_GROUPS)
  }
  if (isGroupedTab(targetTab)) {
    return i18n.getMessage(KEY_CURRENT_GROUP_ONLY)
  }
  return i18n.getMessage(KEY_TOP_LEVEL_ONLY)
}

function getSingleTitle (key, scope, targetTab, hasGroups, flat) {
  const title = flat
    ? i18n.getMessage(KEY_SORT_BY, i18n.getMessage(key))
    : i18n.getMessage(key)
  if (!hasGroups || !scope) {
    return title
  }
  return title + ' (' + getScopeTitle(scope, targetTab) + ')'
}

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

function updateMenuItem (id, properties) {
  return new Promise((resolve, reject) => {
    menus.update(id, properties, () => {
      if (runtime.lastError) {
        reject(runtime.lastError)
      } else {
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
  const entries = getMenuEntries(menuItems)

  await menus.removeAll()
  debug('Clear menu items')

  if (contexts.length <= 0 || entries.length <= 0) {
    return
  }

  const nested = entries.length > 1
  if (nested) {
    await createMenuItem({
      id: KEY_SORT,
      title: i18n.getMessage(KEY_SORT),
      contexts,
    })
  }

  for (const { key, scopes } of entries) {
    const flat = !nested
    await createMenuItem({
      id: getSingleMenuId(key),
      title: flat
        ? i18n.getMessage(KEY_SORT_BY, i18n.getMessage(key))
        : i18n.getMessage(key),
      contexts,
      parentId: nested ? KEY_SORT : undefined,
    })

    if (scopes.length <= 1) {
      continue
    }

    await createMenuItem({
      id: getKeyMenuId(key),
      title: flat
        ? i18n.getMessage(KEY_SORT_BY, i18n.getMessage(key))
        : i18n.getMessage(key),
      contexts,
      parentId: nested ? KEY_SORT : undefined,
      visible: false,
    })
    for (const scope of scopes) {
      await createMenuItem({
        id: getScopeMenuId(key, scope),
        title: i18n.getMessage(scope),
        contexts,
        parentId: getKeyMenuId(key),
        visible: false,
      })
    }
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

function getTargetSegment (tabList, targetTab) {
  const sortedTabs = [...tabList].sort((tab1, tab2) => tab1.index - tab2.index)
  let firstUnpinnedIndex = 0
  for (; firstUnpinnedIndex < sortedTabs.length; firstUnpinnedIndex++) {
    if (!sortedTabs[firstUnpinnedIndex].pinned) {
      break
    }
  }

  if (targetTab?.pinned) {
    return sortedTabs.slice(0, firstUnpinnedIndex)
  }
  return sortedTabs.slice(firstUnpinnedIndex)
}

async function getContextState (tab) {
  const targetTab = tab || await getCurrentTab()
  if (!targetTab) {
    return {}
  }

  const [storedMenuItems, tabList] = await Promise.all([
    getValue(KEY_MENU_ITEMS),
    tabs.query({ windowId: targetTab.windowId }),
  ])
  const menuItems = normalizeMenuItems(storedMenuItems)
  const entries = getMenuEntries(menuItems)
  const segment = getTargetSegment(tabList, targetTab)
  const hasGroups = segment.some(isGroupedTab)

  return { targetTab, menuItems, entries, hasGroups }
}

function resolveSingleScope (scopes, hasGroups) {
  if (!hasGroups && scopes.includes(KEY_CURRENT_AREA)) {
    return KEY_CURRENT_AREA
  }
  return scopes[0]
}

async function handleMenuShown (info, tab) {
  const {
    targetTab,
    entries = [],
    hasGroups = false,
  } = await getContextState(tab)
  if (!targetTab) {
    return
  }

  const nested = entries.length > 1
  const updates = []
  for (const { key, scopes } of entries) {
    const showScoped = hasGroups && scopes.length > 1
    const singleScope = resolveSingleScope(scopes, hasGroups)
    updates.push(updateMenuItem(getSingleMenuId(key), {
      visible: !showScoped,
      title: getSingleTitle(key, singleScope, targetTab, hasGroups, !nested),
    }))

    if (scopes.length <= 1) {
      continue
    }

    updates.push(updateMenuItem(getKeyMenuId(key), {
      visible: showScoped,
    }))
    for (const scope of scopes) {
      updates.push(updateMenuItem(getScopeMenuId(key, scope), {
        visible: showScoped,
        title: getScopeTitle(scope, targetTab),
      }))
    }
  }

  await Promise.all(updates)
  await menus.refresh()
}

async function handleMenuClick (info, tab) {
  const scopedEntry = parseScopeMenuId(info.menuItemId)
  const singleEntry = parseSingleMenuId(info.menuItemId)
  const entry = scopedEntry || singleEntry
  if (!entry) {
    return
  }

  const {
    targetTab,
    menuItems,
    hasGroups = false,
  } = await getContextState(tab)
  if (!targetTab) {
    return
  }

  const scopes = menuItems[entry.key] || []
  const scope = entry.scope || resolveSingleScope(scopes, hasGroups)
  if (!scope) {
    return
  }

  const notification = normalizeNotification(
    await getValue(KEY_NOTIFICATION),
  )
  await run(targetTab.windowId, entry.key, targetTab.pinned,
    notification, scope, targetTab.id)
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

menus.onShown.addListener((info, tab) => {
  return handleMenuShown(info, tab).catch(onError)
})
