import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

const state = {
  currentWindowId: 1,
  tabs: [],
  moved: [],
  groupMoved: [],
  notifications: [],
  notificationAllowed: true,
  notificationError: undefined,
}

function cloneTab (tab) {
  return { ...tab }
}

function resetTabs (tabs) {
  state.tabs = tabs.map(cloneTab)
  state.moved = []
  state.groupMoved = []
  state.notifications = []
  state.notificationAllowed = true
  state.notificationError = undefined
}

function getWindowTabs (windowId) {
  return state.tabs.
    filter((tab) => tab.windowId === windowId).
    sort((tab1, tab2) => tab1.index - tab2.index)
}

function getTabIds (windowId = 1) {
  return getWindowTabs(windowId).map((tab) => tab.id)
}

function moveTabIds (ids, index) {
  const idList = Array.isArray(ids) ? ids : [ids]
  const tab = state.tabs.find((item) => item.id === idList[0])
  const idSet = new Set(idList)
  const windowTabs = getWindowTabs(tab.windowId)
  const movingTabs = windowTabs.filter((item) => idSet.has(item.id))
  const keepTabs = windowTabs.filter((item) => !idSet.has(item.id))
  const targetIndex = Math.max(0, Math.min(index, keepTabs.length))
  keepTabs.splice(targetIndex, 0, ...movingTabs)
  keepTabs.forEach((item, itemIndex) => {
    item.index = itemIndex
  })
  state.moved.push({ ids: idList, index })
}

function moveGroup (groupId, index) {
  const groupTab = state.tabs.find((tab) => tab.groupId === groupId)
  const ids = getWindowTabs(groupTab.windowId).
    filter((tab) => tab.groupId === groupId).
    map((tab) => tab.id)
  moveTabIds(ids, index)
  state.groupMoved.push({ groupId, index })
}

function withDefaults (tab) {
  return {
    groupId: -1,
    splitViewId: -1,
    cookieStoreId: 'firefox-default',
    ...tab,
  }
}

function resetTabsWithDefaults (tabs) {
  resetTabs(tabs.map(withDefaults))
}

globalThis.browser = {
  i18n: {
    getMessage: (key, substitutions) => {
      if (key === 'debug') {
        return 'release'
      }
      if (key === 'name') {
        return 'ClickTabSort'
      }
      if (Array.isArray(substitutions)) {
        return key + ':' + substitutions.join(',')
      }
      return key
    },
  },
  notifications: {
    create: async (id, options) => {
      if (state.notificationError) {
        throw state.notificationError
      }
      state.notifications.push({ id, options })
      return 'notification'
    },
  },
  permissions: {
    contains: async () => state.notificationAllowed,
  },
  storage: {
    sync: {},
  },
  tabGroups: {
    TAB_GROUP_ID_NONE: -1,
    move: async (groupId, properties) => {
      moveGroup(groupId, properties.index)
      return { id: groupId }
    },
  },
  tabs: {
    SPLIT_VIEW_ID_NONE: -1,
    query: async (query) => {
      let result = state.tabs
      if (query.windowId !== undefined) {
        result = result.filter((tab) => tab.windowId === query.windowId)
      }
      if (query.currentWindow) {
        result = result.filter((tab) => tab.windowId === state.currentWindowId)
      }
      if (query.active !== undefined) {
        result = result.filter((tab) => tab.active === query.active)
      }
      return result.map(cloneTab)
    },
    move: async (id, properties) => {
      moveTabIds(id, properties.index)
      const idList = Array.isArray(id) ? id : [id]
      return idList.map((tabId) => cloneTab(
        state.tabs.find((tab) => tab.id === tabId),
      ))
    },
  },
}

const {
  run,
} = await import('../extension/sort.js')
const {
  normalizeContexts,
  normalizeMenuItems,
  normalizeNotification,
} = await import('../extension/common.js')

test('対応しているメニューコンテキストだけを残してコンテキストを正規化する', () => {
  assert.deepEqual(normalizeContexts(undefined), ['tab'])
  assert.deepEqual(normalizeContexts(['all', 'unknown', 'tab']), ['tab', 'all'])
  assert.deepEqual(normalizeContexts('tab'), [])
})

test('対応しているメニュー項目だけを残してメニュー項目を正規化する', () => {
  assert.deepEqual(normalizeMenuItems(undefined), {
    url: ['currentArea'],
    title: ['currentArea'],
  })
  assert.deepEqual(normalizeMenuItems(['title', 'unknown', 'url']), {
    url: ['currentArea'],
    title: ['currentArea'],
  })
  assert.deepEqual(normalizeMenuItems({
    title: ['allGroups', 'unknown', 'currentArea'],
  }), {
    title: ['currentArea', 'allGroups'],
  })
  assert.deepEqual(normalizeMenuItems('url'), {})
})

test('通知設定を真偽値に正規化する', () => {
  assert.equal(normalizeNotification(undefined), false)
  assert.equal(normalizeNotification(true), true)
  assert.equal(normalizeNotification('true'), false)
})

test('固定タブ以外から実行した場合は固定タブを残して通常タブだけをソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: true, url: 'https://z.example/', title: 'Z', lastAccessed: 30 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])

  await run(1, 'url', false, false)

  assert.deepEqual(getTabIds(), [1, 3, 2])
})

test('固定タブから実行した場合は固定タブだけをソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: true, url: 'https://z.example/', title: 'Z', lastAccessed: 30 },
    { id: 2, windowId: 1, index: 1, pinned: true, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
  ])

  await run(1, 'url', true, false)

  assert.deepEqual(getTabIds(), [2, 1, 3])
})

test('今の逆順では通常タブの現在順だけを反転する', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: true, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://c.example/', title: 'C', lastAccessed: 30 },
    { id: 4, windowId: 1, index: 3, pinned: false, url: 'https://d.example/', title: 'D', lastAccessed: 40 },
  ])

  await run(1, 'reverse', false, false)

  assert.deepEqual(getTabIds(), [1, 4, 3, 2])
})

test('通知が有効で権限がある場合は完了通知を送る', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])

  await run(1, 'title', false, true)

  assert.deepEqual(getTabIds(), [2, 1])
  assert.equal(state.notifications.length, 1)
  assert.equal(state.notifications[0].id, 'ClickTabSort')
  assert.equal(state.notifications[0].options.type, 'basic')
  assert.equal(state.notifications[0].options.title, 'ClickTabSort')
  assert.equal(state.notifications[0].options.message.includes('successMessage'), true)
})

test('通知権限がない場合は通知せずにソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])
  state.notificationAllowed = false

  await run(1, 'title', false, true)

  assert.deepEqual(getTabIds(), [2, 1])
  assert.equal(state.notifications.length, 0)
})

test('通知作成に失敗してもソートは完了する', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])
  state.notificationError = new Error('Notification unavailable')

  const errorMock = mock.method(globalThis.console, 'error', () => {})
  try {
    await run(1, 'title', false, true)
  } finally {
    errorMock.mock.restore()
  }

  assert.deepEqual(getTabIds(), [2, 1])
})

test('通知 API が後から有効になっても通知を送る', async () => {
  const notificationsApi = globalThis.browser.notifications
  globalThis.browser.notifications = undefined
  const {
    run: lazyRun,
  } = await import('../extension/sort.js?lazy-notification')
  globalThis.browser.notifications = notificationsApi

  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])

  await lazyRun(1, 'title', false, true)

  assert.deepEqual(getTabIds(), [2, 1])
  assert.equal(state.notifications.length, 1)
})

test('クリック先の範囲ではグループ内タブから実行した場合にそのグループ内だけをソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://z.example/', title: 'Z', lastAccessed: 40 },
    { id: 2, windowId: 1, index: 1, pinned: false, groupId: 10, url: 'https://c.example/', title: 'C', lastAccessed: 30 },
    { id: 3, windowId: 1, index: 2, pinned: false, groupId: 10, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
    { id: 4, windowId: 1, index: 3, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
  ])

  await run(1, 'url', false, false, 'currentArea', 2)

  assert.deepEqual(getTabIds(), [1, 3, 2, 4])
  assert.deepEqual(state.groupMoved, [])
})

test('クリック先の範囲ではトップレベルから実行した場合にグループをブロックとしてトップレベルをソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://c.example/', title: 'C', lastAccessed: 40 },
    { id: 2, windowId: 1, index: 1, pinned: false, groupId: 10, url: 'https://b.example/', title: 'B', lastAccessed: 30 },
    { id: 3, windowId: 1, index: 2, pinned: false, groupId: 10, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
    { id: 4, windowId: 1, index: 3, pinned: false, url: 'https://aa.example/', title: 'AA', lastAccessed: 20 },
  ])

  await run(1, 'url', false, false, 'currentArea', 1)

  assert.deepEqual(getTabIds(), [4, 2, 3, 1])
  assert.deepEqual(state.groupMoved, [{ groupId: 10, index: 1 }])
})

test('トップレベルと全グループでは各グループ内とトップレベルをどちらもソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://z.example/', title: 'Z', lastAccessed: 60 },
    { id: 2, windowId: 1, index: 1, pinned: false, groupId: 10, url: 'https://c.example/', title: 'C', lastAccessed: 50 },
    { id: 3, windowId: 1, index: 2, pinned: false, groupId: 10, url: 'https://b.example/', title: 'B', lastAccessed: 40 },
    { id: 4, windowId: 1, index: 3, pinned: false, url: 'https://d.example/', title: 'D', lastAccessed: 30 },
    { id: 5, windowId: 1, index: 4, pinned: false, groupId: 20, url: 'https://e.example/', title: 'E', lastAccessed: 20 },
    { id: 6, windowId: 1, index: 5, pinned: false, groupId: 20, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])

  await run(1, 'url', false, false, 'allGroups', 1)

  assert.deepEqual(getTabIds(), [6, 5, 3, 2, 4, 1])
})

test('分割ビューは内部順を保ったブロックとしてグループ内でソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, groupId: 10, splitViewId: 7, url: 'https://c.example/', title: 'C', lastAccessed: 30 },
    { id: 2, windowId: 1, index: 1, pinned: false, groupId: 10, splitViewId: 7, url: 'https://z.example/', title: 'Z', lastAccessed: 40 },
    { id: 3, windowId: 1, index: 2, pinned: false, groupId: 10, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])

  await run(1, 'url', false, false, 'currentArea', 1)

  assert.deepEqual(getTabIds(), [3, 1, 2])
})

test('分割ビューは内部順を保ったブロックとしてトップレベルでソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, splitViewId: 7, url: 'https://c.example/', title: 'C', lastAccessed: 30 },
    { id: 2, windowId: 1, index: 1, pinned: false, splitViewId: 7, url: 'https://z.example/', title: 'Z', lastAccessed: 40 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])

  await run(1, 'url', false, false, 'currentArea', 3)

  assert.deepEqual(getTabIds(), [3, 1, 2])
})

test('コンテナ違いのタブも同じソート範囲では通常通りソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, cookieStoreId: 'firefox-container-1', url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 2, windowId: 1, index: 1, pinned: false, cookieStoreId: 'firefox-default', url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])

  await run(1, 'url', false, false, 'currentArea', 1)

  assert.deepEqual(getTabIds(), [2, 1])
})

test('未対応のソートキーではタブを移動しない', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])

  const errorMock = mock.method(globalThis.console, 'error', () => {})
  try {
    await run(1, 'unknown', false, false)
  } finally {
    errorMock.mock.restore()
  }

  assert.deepEqual(getTabIds(), [1, 2])
  assert.deepEqual(state.moved, [])
})
