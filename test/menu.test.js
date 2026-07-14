import assert from 'node:assert/strict'
import test from 'node:test'

const state = {
  tabs: [],
  storageData: {},
  menuItems: new Map(),
  moves: [],
  refreshCount: 0,
  storageGetWait: undefined,
  tabQueries: [],
}

function createEvent () {
  const listeners = []
  return {
    addListener: (listener) => {
      listeners.push(listener)
    },
    listeners,
  }
}

const events = {
  menusClicked: createEvent(),
  menusShown: createEvent(),
  runtimeInstalled: createEvent(),
  runtimeStartup: createEvent(),
  storageChanged: createEvent(),
}

function cloneTab (tab) {
  return { ...tab }
}

function finishMenuCallback (callback, error) {
  globalThis.browser.runtime.lastError = error
  callback?.()
  globalThis.browser.runtime.lastError = undefined
}

function removeMenuItemAndChildren (id) {
  for (const [childId, item] of [...state.menuItems]) {
    if (item.parentId === id) {
      removeMenuItemAndChildren(childId)
    }
  }
  state.menuItems.delete(id)
}

function resetState ({ menuItems, tabs }) {
  state.tabs = tabs.map((tab) => ({
    active: false,
    groupId: -1,
    index: 0,
    pinned: false,
    splitViewId: -1,
    title: 'Tab ' + tab.id,
    url: 'https://example.com/' + tab.id,
    windowId: 1,
    ...tab,
  }))
  state.storageData = {
    contexts: ['tab'],
    menuItems,
    notification: false,
    useGroupNameAsGroupTitle: false,
  }
  state.menuItems.clear()
  state.moves = []
  state.refreshCount = 0
  state.storageGetWait = undefined
  state.tabQueries = []
}

globalThis.browser = {
  i18n: {
    getMessage: (key, substitutions) => {
      if (key === 'debug') {
        return 'release'
      }
      if (Array.isArray(substitutions)) {
        return key + ':' + substitutions.join(',')
      }
      if (substitutions !== undefined) {
        return key + ':' + substitutions
      }
      return key
    },
  },
  menus: {
    create: (properties, callback) => {
      if (state.menuItems.has(properties.id)) {
        finishMenuCallback(callback, new Error('Duplicate menu id'))
        return
      }
      state.menuItems.set(properties.id, { ...properties })
      finishMenuCallback(callback)
    },
    update: (id, properties, callback) => {
      const item = state.menuItems.get(id)
      if (!item) {
        finishMenuCallback(callback, new Error('Unknown menu id'))
        return
      }
      state.menuItems.set(id, { ...item, ...properties })
      finishMenuCallback(callback)
    },
    remove: (id, callback) => {
      if (!state.menuItems.has(id)) {
        finishMenuCallback(callback, new Error('Unknown menu id'))
        return
      }
      removeMenuItemAndChildren(id)
      finishMenuCallback(callback)
    },
    removeAll: async () => {
      state.menuItems.clear()
    },
    refresh: async () => {
      state.refreshCount += 1
    },
    onClicked: events.menusClicked,
    onShown: events.menusShown,
  },
  notifications: {
    create: async () => {},
  },
  permissions: {
    contains: async () => true,
  },
  runtime: {
    lastError: undefined,
    onInstalled: events.runtimeInstalled,
    onStartup: events.runtimeStartup,
  },
  storage: {
    sync: {
      get: async (key) => {
        await state.storageGetWait?.()
        if (typeof key === 'string') {
          return { [key]: state.storageData[key] }
        }
        return { ...state.storageData }
      },
    },
    onChanged: events.storageChanged,
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1,
  },
  tabs: {
    query: async (query = {}) => {
      state.tabQueries.push({ ...query })
      let result = state.tabs
      if (query.windowId !== undefined) {
        result = result.filter((tab) => tab.windowId === query.windowId)
      }
      if (query.currentWindow) {
        result = result.filter((tab) => tab.windowId === 1)
      }
      if (query.active !== undefined) {
        result = result.filter((tab) => tab.active === query.active)
      }
      return result.map(cloneTab)
    },
    move: async (ids, properties) => {
      state.moves.push({ ids, properties })
      return []
    },
    ungroup: async () => {},
  },
}

resetState({
  menuItems: { url: ['currentArea', 'allGroups'] },
  tabs: [
    { id: 1, active: true },
  ],
})
await import('../extension/menu.js?menu-test')
await new Promise((resolve) => globalThis.setTimeout(resolve, 0))

async function rebuildMenu () {
  await events.runtimeStartup.listeners[0]()
}

async function showMenu (tabId) {
  const tab = state.tabs.find((entry) => entry.id === tabId)
  await events.menusShown.listeners[0]({}, cloneTab(tab))
}

async function clickMenu (menuItemId, tabId) {
  const tab = state.tabs.find((entry) => entry.id === tabId)
  await events.menusClicked.listeners[0]({ menuItemId }, cloneTab(tab))
}

function getChildIds (parentId) {
  return [...state.menuItems.entries()].
    filter(([, item]) => item.parentId === parentId).
    filter(([, item]) => item.visible !== false).
    map(([id]) => id)
}

function getAllChildIds (parentId) {
  return [...state.menuItems.entries()].
    filter(([, item]) => item.parentId === parentId).
    map(([id]) => id)
}

test('ロード時にメニューを復元する', async () => {
  assert.ok(state.menuItems.has('sort'))
  assert.notEqual(state.menuItems.get('sort').visible, false)
  assert.equal(state.menuItems.get('sort:action').visible, false)
  assert.deepEqual(getAllChildIds('sort'), [
    'scope:url:currentArea',
    'scope:url:topLevelOnly',
    'scope:url:allGroups',
  ])
})

test('表示処理は進行中のメニュー復元完了を待つ', async () => {
  let releaseStorage
  const storageReady = new Promise((resolve) => {
    releaseStorage = resolve
  })
  resetState({
    menuItems: { title: ['currentArea'] },
    tabs: [
      { id: 1, windowId: 1, index: 0, active: true },
      { id: 2, windowId: 1, index: 1 },
    ],
  })
  state.storageGetWait = async () => storageReady

  const rebuildPromise = rebuildMenu()
  const showPromise = showMenu(1)
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0))

  assert.equal(state.refreshCount, 0)

  releaseStorage()
  await Promise.all([rebuildPromise, showPromise])

  assert.equal(state.menuItems.get('sort').visible, false)
  assert.equal(state.menuItems.get('sort:action').visible, true)
  assert.equal(state.menuItems.get('sort:action').title,
    'sort: title: topLevelScope')
  assert.equal(state.refreshCount, 1)
})

test('表示前に必要な子メニュー候補を作成する', async () => {
  resetState({
    menuItems: { url: ['currentArea', 'allGroups'] },
    tabs: [
      { id: 1, windowId: 1, index: 0, active: true },
      { id: 2, windowId: 1, index: 1, groupId: 10 },
    ],
  })
  await rebuildMenu()

  assert.notEqual(state.menuItems.get('sort').visible, false)
  assert.equal(state.menuItems.get('sort:action').visible, false)
  assert.deepEqual(getAllChildIds('sort'), [
    'scope:url:currentArea',
    'scope:url:topLevelOnly',
    'scope:url:allGroups',
  ])
  assert.deepEqual(getChildIds('sort'), [])
})

test('トップレベル以外の階層がない場合は単一の実行候補をルートに統合する', async () => {
  resetState({
    menuItems: { url: ['currentArea', 'allGroups'] },
    tabs: [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: false,
        url: 'https://example.com/b',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        active: true,
        url: 'https://example.com/a',
      },
    ],
  })
  await rebuildMenu()
  await showMenu(2)

  assert.equal(state.menuItems.get('sort').visible, false)
  assert.equal(state.menuItems.get('sort:action').visible, true)
  assert.equal(state.menuItems.get('sort:action').title,
    'sort: url: topLevelScope')
  assert.deepEqual(getChildIds('sort'), [])
  assert.equal(state.refreshCount, 1)

  state.tabQueries = []
  await clickMenu('sort:action', 2)

  assert.deepEqual(state.moves, [
    { ids: 2, properties: { index: 0 } },
  ])
  assert.deepEqual(state.tabQueries, [
    { windowId: 1 },
    { windowId: 1 },
  ])
})

test('トップレベルタブではクリックした階層内だけの設定をルートに統合する', async () => {
  resetState({
    menuItems: { url: ['currentArea'] },
    tabs: [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: false,
        url: 'https://example.com/b',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        active: true,
        url: 'https://example.com/a',
      },
    ],
  })
  await rebuildMenu()
  await showMenu(2)

  assert.equal(state.menuItems.get('sort').visible, false)
  assert.equal(state.menuItems.get('sort:action').visible, true)
  assert.equal(state.menuItems.get('sort:action').title,
    'sort: url: topLevelScope')
  assert.deepEqual(getChildIds('sort'), [])

  await clickMenu('sort:action', 2)

  assert.deepEqual(state.moves, [
    { ids: 2, properties: { index: 0 } },
  ])
})

test('トップレベル以外の階層がない場合も設定で選んだ最初の文言を使う', async () => {
  resetState({
    menuItems: { url: ['allGroups'] },
    tabs: [
      { id: 1, windowId: 1, index: 0, active: true },
      { id: 2, windowId: 1, index: 1 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.equal(state.menuItems.get('sort').visible, false)
  assert.equal(state.menuItems.get('sort:action').visible, true)
  assert.equal(state.menuItems.get('sort:action').title,
    'sort: url: allGroupsMenu')
  assert.deepEqual(getChildIds('sort'), [])
})

test('トップレベルタブでグループがある場合はトップレベルと全階層を表示する', async () => {
  resetState({
    menuItems: { url: ['currentArea', 'allGroups'] },
    tabs: [
      { id: 1, windowId: 1, index: 0, active: true },
      { id: 2, windowId: 1, index: 1, groupId: 10 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.notEqual(state.menuItems.get('sort').visible, false)
  assert.equal(state.menuItems.get('sort:action').visible, false)
  assert.equal(state.menuItems.get('sort').title, 'sort: url')
  assert.deepEqual(getChildIds('sort'), [
    'scope:url:currentArea',
    'scope:url:allGroups',
  ])
  assert.equal(
    state.menuItems.get('scope:url:currentArea').title,
    'topLevelScope',
  )
  assert.equal(
    state.menuItems.get('scope:url:allGroups').title,
    'allGroupsMenu',
  )
})

test('グループ内タブではグループ内・トップレベル・全階層を表示する', async () => {
  resetState({
    menuItems: { url: ['currentArea', 'allGroups'] },
    tabs: [
      { id: 1, windowId: 1, index: 0, active: true, groupId: 10 },
      { id: 2, windowId: 1, index: 1 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.deepEqual(getChildIds('sort'), [
    'scope:url:currentArea',
    'scope:url:topLevelOnly',
    'scope:url:allGroups',
  ])
  assert.equal(
    state.menuItems.get('scope:url:currentArea').title,
    'groupScope',
  )
  assert.equal(
    state.menuItems.get('scope:url:topLevelOnly').title,
    'topLevelScope',
  )
  assert.equal(
    state.menuItems.get('scope:url:allGroups').title,
    'allGroupsMenu',
  )
})

test('ピン留めタブではピン留め内・トップレベル・全階層を表示する', async () => {
  resetState({
    menuItems: { url: ['currentArea', 'allGroups'] },
    tabs: [
      { id: 1, windowId: 1, index: 0, active: true, pinned: true },
      { id: 2, windowId: 1, index: 1 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.equal(state.menuItems.get('sort').title, 'sort: url')
  assert.deepEqual(getChildIds('sort'), [
    'scope:url:currentArea',
    'scope:url:topLevelOnly',
    'scope:url:allGroups',
  ])
  assert.equal(
    state.menuItems.get('scope:url:currentArea').title,
    'pinnedScope',
  )
  assert.equal(
    state.menuItems.get('scope:url:topLevelOnly').title,
    'topLevelScope',
  )
  assert.equal(
    state.menuItems.get('scope:url:allGroups').title,
    'allGroupsMenu',
  )
})

test('トップレベルタブでもピン留め階層がある場合は全階層を表示する', async () => {
  resetState({
    menuItems: { url: ['currentArea', 'allGroups'] },
    tabs: [
      { id: 1, windowId: 1, index: 0, active: true },
      { id: 2, windowId: 1, index: 1, pinned: true },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.equal(state.menuItems.get('sort').title, 'sort: url')
  assert.deepEqual(getChildIds('sort'), [
    'scope:url:currentArea',
    'scope:url:allGroups',
  ])
})

test('複数項目で各項目の階層が1つだけの場合は項目名に階層名を統合する', async () => {
  resetState({
    menuItems: {
      url: ['currentArea'],
      title: ['currentArea'],
    },
    tabs: [
      { id: 1, windowId: 1, index: 0, active: true },
      { id: 2, windowId: 1, index: 1 },
    ],
  })
  await rebuildMenu()
  await showMenu(1)

  assert.equal(state.menuItems.get('sort').title, 'sort')
  assert.deepEqual(getChildIds('sort'), [
    'flatScope:url:currentArea',
    'flatScope:title:currentArea',
  ])
  assert.equal(
    state.menuItems.get('flatScope:url:currentArea').title,
    'url: topLevelScope',
  )
  assert.equal(
    state.menuItems.get('flatScope:title:currentArea').title,
    'title: topLevelScope',
  )
})
