import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

const state = {
  currentWindowId: 1,
  tabs: [],
  groups: [],
  moved: [],
  groupMoved: [],
  notifications: [],
  notificationAllowed: true,
  notificationError: undefined,
  uiLanguage: 'en-US',
  forceGroupOnTabMove: undefined,
  ungrouped: [],
  queryCount: 0,
}

function cloneTab (tab) {
  return { ...tab }
}

function resetTabs (tabs) {
  state.tabs = tabs.map(cloneTab)
  state.groups = []
  state.moved = []
  state.groupMoved = []
  state.notifications = []
  state.notificationAllowed = true
  state.notificationError = undefined
  state.uiLanguage = 'en-US'
  state.forceGroupOnTabMove = undefined
  state.ungrouped = []
  state.queryCount = 0
}

function getWindowTabs (windowId) {
  return state.tabs.
    filter((tab) => tab.windowId === windowId).
    sort((tab1, tab2) => tab1.index - tab2.index)
}

function getTabIds (windowId = 1) {
  return getWindowTabs(windowId).map((tab) => tab.id)
}

function getTitles (windowId = 1) {
  return getWindowTabs(windowId).map((tab) => tab.title)
}

function getMemberships () {
  return [...state.tabs].
    sort((tab1, tab2) => tab1.id - tab2.id).
    map((tab) => ({
      id: tab.id,
      groupId: tab.groupId,
      splitViewId: tab.splitViewId,
      cookieStoreId: tab.cookieStoreId,
    }))
}

function moveTabIds (ids, index, simulateGroupAttachment = false) {
  const idList = Array.isArray(ids) ? ids : [ids]
  const tab = state.tabs.find((item) => item.id === idList[0])
  const topLevelIds = new Set(idList.filter((id) => {
    const target = state.tabs.find((item) => item.id === id)
    return target?.groupId === -1
  }))
  const idSet = new Set(idList)
  const windowTabs = getWindowTabs(tab.windowId)
  const movingTabs = windowTabs.filter((item) => idSet.has(item.id))
  const keepTabs = windowTabs.filter((item) => !idSet.has(item.id))
  const targetIndex = Math.max(0, Math.min(index, keepTabs.length))
  keepTabs.splice(targetIndex, 0, ...movingTabs)
  keepTabs.forEach((item, itemIndex) => {
    item.index = itemIndex
  })

  if (simulateGroupAttachment && state.forceGroupOnTabMove !== undefined) {
    state.tabs.forEach((item) => {
      if (topLevelIds.has(item.id)) {
        item.groupId = state.forceGroupOnTabMove
      }
    })
  }

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

function resetTitleTabs (titles) {
  resetTabsWithDefaults(titles.map((title, index) => ({
    id: index + 1,
    windowId: 1,
    index,
    pinned: false,
    url: 'https://title-' + index + '.example/',
    title,
    lastAccessed: titles.length - index,
  })))
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
    getUILanguage: () => state.uiLanguage,
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
    query: async (query) => {
      let result = state.groups
      if (query.windowId !== undefined) {
        result = result.filter((group) => group.windowId === query.windowId)
      }
      return result.map((group) => ({ ...group }))
    },
    move: async (groupId, properties) => {
      moveGroup(groupId, properties.index)
      return { id: groupId }
    },
  },
  tabs: {
    SPLIT_VIEW_ID_NONE: -1,
    query: async (query) => {
      state.queryCount++
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
      moveTabIds(id, properties.index, true)
      const idList = Array.isArray(id) ? id : [id]
      return idList.map((tabId) => cloneTab(
        state.tabs.find((tab) => tab.id === tabId),
      ))
    },
    ungroup: async (ids) => {
      const idList = Array.isArray(ids) ? ids : [ids]
      state.ungrouped.push(...idList)
      state.tabs.forEach((tab) => {
        if (idList.includes(tab.id)) {
          tab.groupId = -1
        }
      })
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
  normalizeUseGroupNameAsGroupTitle,
} = await import('../extension/common.js')

test('対応しているメニューコンテキストだけを残してコンテキストを正規化する', () => {
  assert.deepEqual(normalizeContexts(undefined), ['tab'])
  assert.deepEqual(normalizeContexts(['all', 'unknown', 'tab']), ['tab', 'all'])
  assert.deepEqual(normalizeContexts('tab'), [])
})

test('対応しているメニュー項目だけを残してメニュー項目を正規化する', () => {
  assert.deepEqual(normalizeMenuItems(undefined), {
    url: ['allGroups'],
    title: ['allGroups'],
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

test('グループ名をタイトルとして使う設定を真偽値に正規化する', () => {
  assert.equal(normalizeUseGroupNameAsGroupTitle(undefined), false)
  assert.equal(normalizeUseGroupNameAsGroupTitle(true), true)
  assert.equal(normalizeUseGroupNameAsGroupTitle('true'), false)
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

test('タイトルは文字種カテゴリ順でソートする', async () => {
  const expected = [
    '!項目',
    '！項目',
    '#項目',
    '＃項目',
    '-項目',
    '－項目',
    '_項目',
    '＿項目',
    '01項目',
    '０１項目',
    '10項目',
    '１０項目',
    '1項目',
    '１項目',
    '2項目',
    '２項目',
    'A項目',
    'a項目',
    'Ａ項目',
    'ａ項目',
    'B項目',
    'Ｂ項目',
    'Z項目',
    'Ｚ項目',
    'ぁ項目',
    'ァ項目',
    'ｧ項目',
    'あ項目',
    'ア項目',
    'ｱ項目',
    'い項目',
    'イ項目',
    'ｲ項目',
    'か項目',
    'カ項目',
    'ｶ項目',
    'が項目',
    'ガ項目',
    'ｶﾞ項目',
    'は項目',
    'ハ項目',
    'ﾊ項目',
    'ば項目',
    'バ項目',
    'ﾊﾞ項目',
    'ぱ項目',
    'パ項目',
    'ﾊﾟ項目',
    'ん項目',
    'ン項目',
    'ﾝ項目',
    '漢字項目',
  ]
  resetTitleTabs([...expected].reverse())
  state.uiLanguage = 'ja-JP'

  await run(1, 'title', false, false)

  assert.deepEqual(getTitles(), expected)
})

test('タイトルは数字も一文字ずつソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://10.example/', title: 'Page 10', lastAccessed: 30 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://2.example/', title: 'Page 2', lastAccessed: 20 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://1.example/', title: 'Page 1', lastAccessed: 10 },
  ])

  await run(1, 'title', false, false)

  assert.deepEqual(getTabIds(), [3, 1, 2])
})

test('タイトルは全角半角の数字と先頭ゼロも一文字ずつソートする', async () => {
  const expected = [
    '001',
    '００１',
    '01',
    '０１',
    '1',
    '１',
    '10',
    '１０',
    '2',
    '２',
  ]
  resetTitleTabs([...expected].reverse())

  await run(1, 'title', false, false)

  assert.deepEqual(getTitles(), expected)
})

test('タイトルは全角半角の英字を同じ文字の近くにソートする', async () => {
  const expected = [
    'A',
    'a',
    'Ａ',
    'ａ',
    'B',
    'b',
    'Ｂ',
    'ｂ',
    'Z',
    'z',
    'Ｚ',
    'ｚ',
  ]
  resetTitleTabs([...expected].reverse())

  await run(1, 'title', false, false)

  assert.deepEqual(getTitles(), expected)
})

test('タイトルは平仮名、片仮名、半角片仮名の順でソートする', async () => {
  const expected = [
    'ぁ',
    'ァ',
    'ｧ',
    'あ',
    'ア',
    'ｱ',
    'か',
    'カ',
    'ｶ',
    'が',
    'ガ',
    'ｶﾞ',
    'は',
    'ハ',
    'ﾊ',
    'ば',
    'バ',
    'ﾊﾞ',
    'ぱ',
    'パ',
    'ﾊﾟ',
    'ん',
    'ン',
    'ﾝ',
  ]
  resetTitleTabs([...expected].reverse())

  await run(1, 'title', false, false)

  assert.deepEqual(getTitles(), expected)
})

test('タイトルは漢字かな交じりと英数字の複合も一文字ずつソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://10.example/', title: '漢字10B', lastAccessed: 50 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://2b.example/', title: '漢字2B', lastAccessed: 40 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://2a.example/', title: '漢字2A', lastAccessed: 30 },
    { id: 4, windowId: 1, index: 3, pinned: false, url: 'https://kana1.example/', title: 'かな1', lastAccessed: 20 },
    { id: 5, windowId: 1, index: 4, pinned: false, url: 'https://kana2.example/', title: 'カナ2', lastAccessed: 10 },
  ])
  state.uiLanguage = 'ja-JP'

  await run(1, 'title', false, false)

  assert.deepEqual(getTabIds(), [4, 5, 1, 3, 2])
})

test('タイトルは複合した英数字の先頭ゼロも一文字ずつソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://001-2.example/', title: 'Project 001-2', lastAccessed: 40 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://1-10.example/', title: 'Project 1-10', lastAccessed: 30 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://1-2.example/', title: 'Project 1-2', lastAccessed: 20 },
    { id: 4, windowId: 1, index: 3, pinned: false, url: 'https://01-2.example/', title: 'Project 01-2', lastAccessed: 10 },
  ])

  await run(1, 'title', false, false)

  assert.deepEqual(getTabIds(), [1, 4, 2, 3])
})

test('タイトルは UI 言語に合わせてソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://a.example/', title: 'äta', lastAccessed: 30 },
    { id: 2, windowId: 1, index: 1, pinned: false, url: 'https://z.example/', title: 'zoo', lastAccessed: 20 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://b.example/', title: 'apple', lastAccessed: 10 },
  ])
  state.uiLanguage = 'sv'

  await run(1, 'title', false, false)

  assert.deepEqual(getTabIds(), [3, 2, 1])
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
  assert.equal(state.queryCount, 1)
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

test('設定OFFではグループ内の先頭タブをグループのタイトル代表値として使う', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 40 },
    { id: 2, windowId: 1, index: 1, pinned: false, groupId: 10, url: 'https://z.example/', title: 'Z', lastAccessed: 30 },
    { id: 3, windowId: 1, index: 2, pinned: false, groupId: 10, url: 'https://y.example/', title: 'Y', lastAccessed: 20 },
    { id: 4, windowId: 1, index: 3, pinned: false, url: 'https://c.example/', title: 'C', lastAccessed: 10 },
  ])
  state.groups = [{ id: 10, windowId: 1, title: '' }]

  await run(1, 'title', false, false, 'currentArea', 1, false)

  assert.deepEqual(getTabIds(), [1, 4, 2, 3])
})

test('設定ONでは無名グループを空文字列のタイトルとしてトップレベルでソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 40 },
    { id: 2, windowId: 1, index: 1, pinned: false, groupId: 10, url: 'https://z.example/', title: 'Z', lastAccessed: 30 },
    { id: 3, windowId: 1, index: 2, pinned: false, groupId: 10, url: 'https://y.example/', title: 'Y', lastAccessed: 20 },
    { id: 4, windowId: 1, index: 3, pinned: false, url: 'https://c.example/', title: 'C', lastAccessed: 10 },
  ])
  state.groups = [{ id: 10, windowId: 1, title: '' }]

  await run(1, 'title', false, false, 'currentArea', 1, true)

  assert.deepEqual(getTabIds(), [2, 3, 1, 4])
})

test('トップレベル指定ではグループ内タブから実行してもトップレベルだけをソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: true, url: 'https://z.example/', title: 'Z', lastAccessed: 60 },
    { id: 2, windowId: 1, index: 1, pinned: true, url: 'https://a.example/', title: 'A', lastAccessed: 50 },
    { id: 3, windowId: 1, index: 2, pinned: false, groupId: 10, url: 'https://d.example/', title: 'D', lastAccessed: 40 },
    { id: 4, windowId: 1, index: 3, pinned: false, groupId: 10, url: 'https://a.example/', title: 'A', lastAccessed: 30 },
    { id: 5, windowId: 1, index: 4, pinned: false, url: 'https://c.example/', title: 'C', lastAccessed: 20 },
    { id: 6, windowId: 1, index: 5, pinned: false, url: 'https://b.example/', title: 'B', lastAccessed: 10 },
  ])

  await run(1, 'url', false, false, 'topLevelOnly', 3)

  assert.deepEqual(getTabIds(), [1, 2, 6, 5, 3, 4])
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
  assert.equal(state.queryCount, 3)
})

test('トップレベルと全グループではピン留めされたタブ内もソートする', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: true, url: 'https://z.example/', title: 'Z', lastAccessed: 60 },
    { id: 2, windowId: 1, index: 1, pinned: true, url: 'https://a.example/', title: 'A', lastAccessed: 50 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://z.example/', title: 'Z', lastAccessed: 40 },
    { id: 4, windowId: 1, index: 3, pinned: false, groupId: 10, url: 'https://c.example/', title: 'C', lastAccessed: 30 },
    { id: 5, windowId: 1, index: 4, pinned: false, groupId: 10, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 6, windowId: 1, index: 5, pinned: false, url: 'https://d.example/', title: 'D', lastAccessed: 10 },
  ])

  await run(1, 'url', false, false, 'allGroups', 3)

  assert.deepEqual(getTabIds(), [2, 1, 5, 4, 6, 3])
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

test('全グループソート後もグループ・分割ビュー・コンテナの所属を保つ', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, cookieStoreId: 'firefox-container-1', url: 'https://h.example/', title: 'H', lastAccessed: 90 },
    { id: 2, windowId: 1, index: 1, pinned: false, groupId: 10, splitViewId: 7, url: 'https://e.example/', title: 'E', lastAccessed: 80 },
    { id: 3, windowId: 1, index: 2, pinned: false, groupId: 10, splitViewId: 7, url: 'https://z.example/', title: 'Z', lastAccessed: 70 },
    { id: 4, windowId: 1, index: 3, pinned: false, groupId: 10, cookieStoreId: 'firefox-container-2', url: 'https://a.example/', title: 'A', lastAccessed: 60 },
    { id: 5, windowId: 1, index: 4, pinned: false, splitViewId: 8, url: 'https://c.example/', title: 'C', lastAccessed: 50 },
    { id: 6, windowId: 1, index: 5, pinned: false, splitViewId: 8, url: 'https://y.example/', title: 'Y', lastAccessed: 40 },
    { id: 7, windowId: 1, index: 6, pinned: false, groupId: 20, url: 'https://b.example/', title: 'B', lastAccessed: 30 },
    { id: 8, windowId: 1, index: 7, pinned: false, groupId: 20, url: 'https://d.example/', title: 'D', lastAccessed: 20 },
    { id: 9, windowId: 1, index: 8, pinned: false, url: 'https://f.example/', title: 'F', lastAccessed: 10 },
  ])
  const memberships = getMemberships()

  await run(1, 'url', false, false, 'allGroups', 1)

  assert.deepEqual(getTabIds(), [4, 2, 3, 7, 8, 5, 6, 9, 1])
  assert.deepEqual(getMemberships(), memberships)
})

test('トップレベル分割ビューがグループへ吸着しても所属不変条件を保つ', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, url: 'https://c.example/', title: 'C', lastAccessed: 50 },
    { id: 2, windowId: 1, index: 1, pinned: false, groupId: 10, splitViewId: 7, url: 'https://b.example/', title: 'B', lastAccessed: 40 },
    { id: 3, windowId: 1, index: 2, pinned: false, groupId: 10, splitViewId: 7, url: 'https://z.example/', title: 'Z', lastAccessed: 30 },
    { id: 4, windowId: 1, index: 3, pinned: false, splitViewId: 8, url: 'https://a.example/', title: 'A', lastAccessed: 20 },
    { id: 5, windowId: 1, index: 4, pinned: false, splitViewId: 8, url: 'https://y.example/', title: 'Y', lastAccessed: 10 },
  ])
  const memberships = getMemberships()
  state.forceGroupOnTabMove = 10

  await run(1, 'url', false, false, 'currentArea', 1)

  assert.deepEqual(getTabIds(), [4, 5, 2, 3, 1])
  assert.deepEqual(getMemberships(), memberships)
  assert.deepEqual(state.ungrouped, [4, 5])
  assert.equal(state.queryCount, 2)
})

test('トップレベルソート中にタブがグループへ吸着した場合はトップレベルへ戻す', async () => {
  resetTabsWithDefaults([
    { id: 1, windowId: 1, index: 0, pinned: false, groupId: 10, splitViewId: 7, url: 'https://b.example/', title: 'B', lastAccessed: 20 },
    { id: 2, windowId: 1, index: 1, pinned: false, groupId: 10, splitViewId: 7, url: 'https://z.example/', title: 'Z', lastAccessed: 30 },
    { id: 3, windowId: 1, index: 2, pinned: false, url: 'https://a.example/', title: 'A', lastAccessed: 10 },
  ])
  state.forceGroupOnTabMove = 10

  await run(1, 'url', false, false, 'currentArea', 3)

  assert.deepEqual(getTabIds(), [3, 1, 2])
  assert.equal(state.tabs.find((tab) => tab.id === 3).groupId, -1)
  assert.deepEqual(state.ungrouped, [3])
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
