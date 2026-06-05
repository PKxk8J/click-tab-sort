import {
  ALL_MENU_ITEMS,
  KEY_ALL_GROUPS_MENU,
  KEY_CONTEXTS,
  KEY_CURRENT_AREA,
  KEY_GROUP_SCOPE,
  KEY_MENU_ITEMS,
  KEY_NOTIFICATION,
  KEY_PINNED_SCOPE,
  KEY_SORT,
  KEY_TOP_LEVEL_ONLY,
  KEY_TOP_LEVEL_SCOPE,
  KEY_USE_GROUP_NAME_AS_GROUP_TITLE,
  debug,
  getValue,
  isGroupedTab,
  normalizeContexts,
  normalizeMenuItems,
  normalizeNotification,
  normalizeUseGroupNameAsGroupTitle,
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

const KEY_SORT_ACTION = KEY_SORT + ':action'

let rebuildMenuPromise
let rebuildMenuRequested = false
let currentContexts = []
let currentEntries = []
let currentMenuActions = new Map()
let currentMenuItemIds = []

function getLeafMenuId (key, scope) {
  return 'scope:' + key + ':' + scope
}

function getFlatLeafMenuId (key, scope) {
  return 'flatScope:' + key + ':' + scope
}

function getKeyMenuId (key) {
  return 'key:' + key
}

function joinMenuTitle (...titles) {
  return titles.filter(Boolean).join(': ')
}

function getCurrentHierarchyMenuTitle (targetTab) {
  if (targetTab.pinned) {
    return i18n.getMessage(KEY_PINNED_SCOPE)
  }

  if (isGroupedTab(targetTab)) {
    return i18n.getMessage(KEY_GROUP_SCOPE)
  }

  return i18n.getMessage(KEY_TOP_LEVEL_SCOPE)
}

function getScopeMenuTitle (scope, targetTab) {
  if (scope === KEY_CURRENT_AREA) {
    return getCurrentHierarchyMenuTitle(targetTab)
  }

  if (scope === KEY_TOP_LEVEL_ONLY) {
    return i18n.getMessage(KEY_TOP_LEVEL_SCOPE)
  }

  return i18n.getMessage(KEY_ALL_GROUPS_MENU)
}

function getSortKeyTitle (key) {
  return joinMenuTitle(i18n.getMessage(KEY_SORT), i18n.getMessage(key))
}

function getSortKeyScopeTitle (key, scope, targetTab) {
  return joinMenuTitle(
    i18n.getMessage(KEY_SORT),
    i18n.getMessage(key),
    getScopeMenuTitle(scope, targetTab),
  )
}

function getKeyScopeTitle (key, scope, targetTab) {
  return joinMenuTitle(i18n.getMessage(key), getScopeMenuTitle(scope,
    targetTab))
}

function getMenuEntries (menuItems) {
  return ALL_MENU_ITEMS.
    filter((key) => menuItems[key]?.length > 0).
    map((key) => ({ key, scopes: menuItems[key] }))
}

function getActionScopesForConfiguredScope (scope, targetTab) {
  if (scope !== KEY_CURRENT_AREA) {
    return [scope]
  }

  if (targetTab.pinned || isGroupedTab(targetTab)) {
    return [KEY_CURRENT_AREA, KEY_TOP_LEVEL_ONLY]
  }

  return [KEY_CURRENT_AREA]
}

function getEffectiveScopes (scopes, targetTab, hasNonTopLevelHierarchy) {
  if (!hasNonTopLevelHierarchy) {
    return scopes.slice(0, 1)
  }

  return scopes.flatMap((scope) => getActionScopesForConfiguredScope(scope,
    targetTab))
}

function getEffectiveEntries (entries, targetTab, hasNonTopLevelHierarchy) {
  return entries.map(({ key, scopes }) => ({
    key,
    scopes: getEffectiveScopes(scopes, targetTab, hasNonTopLevelHierarchy),
  }))
}

function addScope (scopes, scope) {
  if (!scopes.includes(scope)) {
    scopes.push(scope)
  }
}

function getPotentialScopes (scopes) {
  const potentialScopes = []
  for (const scope of scopes) {
    addScope(potentialScopes, scope)
    if (scope === KEY_CURRENT_AREA) {
      addScope(potentialScopes, KEY_TOP_LEVEL_ONLY)
    }
  }
  return potentialScopes
}

function getPotentialEntries (entries) {
  return entries.map(({ key, scopes }) => ({
    key,
    scopes: getPotentialScopes(scopes),
  }))
}

function createLeafMenuRenderItem (key, scope, title, parentId) {
  return {
    action: { key, scope },
    id: getLeafMenuId(key, scope),
    parentId,
    title,
  }
}

function createKeyLeafMenuRenderItem (key, scope, targetTab) {
  return {
    action: { key, scope },
    id: getFlatLeafMenuId(key, scope),
    parentId: KEY_SORT,
    title: getKeyScopeTitle(key, scope, targetTab),
  }
}

function createMenuRenderPlan (visibleEntries, targetTab,
  hasNonTopLevelHierarchy) {
  const effectiveEntries = getEffectiveEntries(visibleEntries, targetTab,
    hasNonTopLevelHierarchy)
  const actions = new Map()
  const items = []
  const root = {
    title: i18n.getMessage(KEY_SORT),
    visible: effectiveEntries.length > 0,
  }

  if (effectiveEntries.length === 1) {
    const [{ key, scopes }] = effectiveEntries
    if (scopes.length === 1) {
      const scope = scopes[0]
      root.title = getSortKeyScopeTitle(key, scope, targetTab)
      actions.set(KEY_SORT, { key, scope })
      return { actions, items, root }
    }

    root.title = getSortKeyTitle(key)
    for (const scope of scopes) {
      items.push(createLeafMenuRenderItem(
        key,
        scope,
        getScopeMenuTitle(scope, targetTab),
        KEY_SORT,
      ))
    }
    return { actions, items, root }
  }

  for (const { key, scopes } of effectiveEntries) {
    if (scopes.length === 1) {
      items.push(createKeyLeafMenuRenderItem(key, scopes[0], targetTab))
      continue
    }

    const parentId = getKeyMenuId(key)
    items.push({
      id: parentId,
      parentId: KEY_SORT,
      title: i18n.getMessage(key),
    })
    for (const scope of scopes) {
      items.push(createLeafMenuRenderItem(
        key,
        scope,
        getScopeMenuTitle(scope, targetTab),
        parentId,
      ))
    }
  }

  return { actions, items, root }
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

async function createManagedMenuItem (properties) {
  await createMenuItem(properties)
  currentMenuItemIds.push(properties.id)
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

function hasNonTopLevelHierarchy (tabList) {
  return tabList.some((tab) => tab.pinned || isGroupedTab(tab))
}

async function createStaticMenuItems (entries, contexts) {
  const potentialEntries = getPotentialEntries(entries)
  if (potentialEntries.length === 1) {
    const [{ key, scopes }] = potentialEntries
    if (scopes.length <= 1) {
      return
    }

    for (const scope of scopes) {
      await createManagedMenuItem({
        id: getLeafMenuId(key, scope),
        title: getScopeMenuTitle(scope, {}),
        contexts,
        parentId: KEY_SORT,
        visible: false,
      })
    }
    return
  }

  for (const { key, scopes } of potentialEntries) {
    const keyMenuId = getKeyMenuId(key)
    await createManagedMenuItem({
      id: keyMenuId,
      title: i18n.getMessage(key),
      contexts,
      parentId: KEY_SORT,
      visible: false,
    })

    for (const scope of scopes) {
      await createManagedMenuItem({
        id: getFlatLeafMenuId(key, scope),
        title: getKeyScopeTitle(key, scope, {}),
        contexts,
        parentId: KEY_SORT,
        visible: false,
      })
    }

    if (scopes.length <= 1) {
      continue
    }

    for (const scope of scopes) {
      await createManagedMenuItem({
        id: getLeafMenuId(key, scope),
        title: getScopeMenuTitle(scope, {}),
        contexts,
        parentId: keyMenuId,
        visible: false,
      })
    }
  }
}

async function rebuildMenu () {
  const [storedContexts, storedMenuItems] = await Promise.all([
    getValue(KEY_CONTEXTS),
    getValue(KEY_MENU_ITEMS),
  ])
  const contexts = normalizeContexts(storedContexts)
  const menuItems = normalizeMenuItems(storedMenuItems)
  const entries = getMenuEntries(menuItems)

  currentContexts = contexts
  currentEntries = entries
  currentMenuActions = new Map()
  currentMenuItemIds = []

  await menus.removeAll()
  debug('Clear menu items')

  if (contexts.length <= 0 || entries.length <= 0) {
    return
  }

  await createMenuItem({
    id: KEY_SORT,
    title: i18n.getMessage(KEY_SORT),
    contexts,
  })
  await createMenuItem({
    id: KEY_SORT_ACTION,
    title: i18n.getMessage(KEY_SORT),
    contexts,
    visible: false,
  })
  await createStaticMenuItems(entries, contexts)
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

async function waitForMenuRebuild () {
  if (rebuildMenuPromise) {
    await rebuildMenuPromise
  }
}

async function getCurrentTab () {
  const [tab] = await tabs.query({ active: true, currentWindow: true })
  return tab
}

async function getContextState (tab) {
  const targetTab = tab || await getCurrentTab()
  if (!targetTab) {
    return {}
  }

  const tabList = await tabs.query({ windowId: targetTab.windowId })

  return {
    targetTab,
    hasNonTopLevelHierarchy: hasNonTopLevelHierarchy(tabList),
  }
}

async function renderCurrentMenuItems (visibleEntries, targetTab,
  hasNonTopLevelHierarchy) {
  const renderPlan = createMenuRenderPlan(visibleEntries, targetTab,
    hasNonTopLevelHierarchy)
  const rootAction = renderPlan.actions.get(KEY_SORT)
  const rootIsAction = renderPlan.items.length === 0 && Boolean(rootAction)

  for (const id of currentMenuItemIds) {
    await updateMenuItem(id, { visible: false }).catch(onError)
  }
  currentMenuActions = new Map(renderPlan.actions)
  currentMenuActions.delete(KEY_SORT)
  if (rootIsAction) {
    currentMenuActions.set(KEY_SORT_ACTION, rootAction)
  }
  if (rootIsAction) {
    await updateMenuItem(KEY_SORT_ACTION, {
      visible: renderPlan.root.visible,
      title: renderPlan.root.title,
    })
    await updateMenuItem(KEY_SORT, {
      visible: false,
      title: renderPlan.root.title,
    })
  } else {
    await updateMenuItem(KEY_SORT, {
      visible: renderPlan.root.visible,
      title: renderPlan.root.title,
    })
    await updateMenuItem(KEY_SORT_ACTION, {
      visible: false,
      title: renderPlan.root.title,
    })
  }

  for (const item of renderPlan.items) {
    await updateMenuItem(item.id, {
      visible: true,
      title: item.title,
    })
    if (item.action) {
      currentMenuActions.set(item.id, item.action)
    }
  }
}

async function handleMenuShown (info, tab) {
  await waitForMenuRebuild()
  const {
    targetTab,
    hasNonTopLevelHierarchy = false,
  } = await getContextState(tab)
  if (!targetTab || currentContexts.length <= 0 || currentEntries.length <= 0) {
    return
  }

  await renderCurrentMenuItems(currentEntries, targetTab,
    hasNonTopLevelHierarchy)
  await menus.refresh()
}

async function handleMenuClick (info, tab) {
  await waitForMenuRebuild()
  const entry = currentMenuActions.get(info.menuItemId)
  if (!entry) {
    return
  }

  const {
    targetTab,
  } = await getContextState(tab)
  if (!targetTab) {
    return
  }

  const [storedNotification, storedUseGroupNameAsGroupTitle] =
    await Promise.all([
      getValue(KEY_NOTIFICATION),
      getValue(KEY_USE_GROUP_NAME_AS_GROUP_TITLE),
    ])
  const notification = normalizeNotification(storedNotification)
  const useGroupNameAsGroupTitle = normalizeUseGroupNameAsGroupTitle(
    storedUseGroupNameAsGroupTitle,
  )
  await run(targetTab.windowId, entry.key, targetTab.pinned,
    notification, entry.scope, targetTab.id, useGroupNameAsGroupTitle)
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

queueRebuildMenu().catch(onError)
