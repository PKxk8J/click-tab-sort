'use strict'

const { contextMenus, i18n, notifications, runtime, storage, tabs } = browser
const storageArea = storage.sync

const KEY_DEBUG = 'debug'

const KEY_URL = 'url'
const KEY_URL_REV = 'urlReverse'
const KEY_TITLE = 'title'
const KEY_TITLE_REV = 'titleReverse'
const KEY_ID = 'id'
const KEY_ID_REV = 'idReverse'
const KEY_RAND = 'random'

const KEY_MENU_ITEM = 'menuItem'
const KEY_NOTIFICATION = 'notification'

const KEY_SORT = 'sort'
const KEY_SORT_BY = 'sortBy'

const KEY_NAME = 'name'
const KEY_SORTING = 'sorting'
const KEY_SUCCESS_MESSAGE = 'successMessage'
const KEY_FAILURE_MESSAGE = 'failureMessage'

const DEFAULT_MENU_ITEM = [KEY_URL, KEY_TITLE]
const DEFAULT_NOTIFICATION = false

const NOTIFICATION_ID = i18n.getMessage(KEY_NAME)

const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')
function debug (message) {
  if (DEBUG) {
    console.log(message)
  }
}

function onError (error) {
  console.error(error)
}

// 設定値を取得する
async function getValue (key, defaultValue) {
  const {
    [key]: value = defaultValue
  } = await storageArea.get(key)
  return value
}

// 右クリックメニューに項目を追加する
function addMenuItem (id, title, parentId) {
  contextMenus.create({
    id,
    title,
    contexts: ['tab'],
    parentId
  }, () => {
    if (runtime.lastError) {
      onError(runtime.lastError)
    } else {
      debug('Added ' + title + ' menu item')
    }
  })
}

// 比較関数の生成関数
const COMPARATOR_GENERATORS = {
  [KEY_URL]: () => (tab1, tab2) => tab1.url.localeCompare(tab2.url),
  [KEY_URL_REV]: () => (tab1, tab2) => tab2.url.localeCompare(tab1.url),
  [KEY_TITLE]: () => (tab1, tab2) => tab1.title.localeCompare(tab2.title),
  [KEY_TITLE_REV]: () => (tab1, tab2) => tab2.title.localeCompare(tab1.title),
  [KEY_ID]: () => (tab1, tab2) => tab1.id - tab2.id,
  [KEY_ID_REV]: () => (tab1, tab2) => tab2.id - tab1.id,
  [KEY_RAND]: () => {
    const random = []
    return (tab1, tab2) => {
      const index = Math.max(tab1.index, tab2.index)
      while (random.length <= index) {
        random.push(Math.random())
      }
      return random[tab1.index] - random[tab2.index]
    }
  }
}

// 右クリックメニューの変更
async function changeMenu (menuItem) {
  // 一旦、全削除してから追加する
  await contextMenus.removeAll()
  debug('Clear menu items')

  switch (menuItem.length) {
    case 0: {
      break
    }
    case 1: {
      // 1 つだけのときはフラットメニュー
      const key = menuItem[0]
      addMenuItem(key, i18n.getMessage(KEY_SORT_BY, i18n.getMessage(key)))
      break
    }
    default: {
      addMenuItem(KEY_SORT, i18n.getMessage(KEY_SORT))
      menuItem.forEach((key) => addMenuItem(key, i18n.getMessage(key), KEY_SORT))
    }
  }
}

// 並べ替える
async function rearrange (curOrder, idealOrder) {
  const idToIdealIndex = new Map()
  for (let i = 0; i < idealOrder.length; i++) {
    idToIdealIndex.set(idealOrder[i].id, i)
  }

  // 既にソート済みのタブの ID
  const orderedIds = new Set()
  // まだソートできていない部分の先頭。headIndex より前は既にソート済み
  let headIndex = 0
  let curHeadIndex = 0
  // まだソートできていない部分の末尾。tailIndex より後ろは既にソート済み
  let tailIndex = idealOrder.length - 1
  let curTailIndex = curOrder.length - 1

  let nMoved = 0

  while (headIndex <= tailIndex) {
    const curHeadId = curOrder[curHeadIndex].id
    if (orderedIds.has(curHeadId)) {
      curHeadIndex++
      continue
    }

    const curTailId = curOrder[curTailIndex].id
    if (orderedIds.has(curTailId)) {
      curTailIndex--
      continue
    }

    const idealHeadId = idealOrder[headIndex].id
    if (curHeadId === idealHeadId) {
      orderedIds.add(idealHeadId)
      headIndex++
      curHeadIndex++
      continue
    }

    const idealTailId = idealOrder[tailIndex].id
    if (curTailId === idealTailId) {
      orderedIds.add(idealTailId)
      tailIndex--
      curTailIndex--
      continue
    }

    // 既存の並びを利用できるまでに必要な挿入の回数
    const headDiff = idToIdealIndex.get(curHeadId) - headIndex
    const tailDiff = tailIndex - idToIdealIndex.get(curTailId)

    if (headDiff <= tailDiff) {
      const index = headIndex
      await tabs.move(idealHeadId, {index})
      debug('Tab ' + idealHeadId + ' was moved to ' + index)
      orderedIds.add(idealHeadId)
      headIndex++
      nMoved++
    } else {
      const index = tailIndex
      await tabs.move(idealTailId, {index})
      debug('Tab ' + idealTailId + ' was moved to ' + index)
      orderedIds.add(idealTailId)
      tailIndex--
      nMoved++
    }
  }

  return nMoved
}

// タブをソートする
async function sort (windowId, comparator) {
  const tabList = await tabs.query({windowId})

  // 現在の並び順
  tabList.sort((tab1, tab2) => tab1.index - tab2.index)

  let firstUnpinnedIndex = 0
  for (; firstUnpinnedIndex < tabList.length; firstUnpinnedIndex++) {
    if (!tabList[firstUnpinnedIndex].pinned) {
      break
    }
  }

  // ソート後の並び順
  const unpinnedIdealOrder = tabList.slice(firstUnpinnedIndex)
  unpinnedIdealOrder.sort(comparator)
  const idealOrder = tabList.slice(0, firstUnpinnedIndex).concat(unpinnedIdealOrder)

  const nMoved = await rearrange(tabList, idealOrder)
  return {
    all: tabList.length,
    moved: nMoved
  }
}

// 通知を表示する
async function notify (message) {
  await notifications.create(NOTIFICATION_ID, {
    'type': 'basic',
    'title': NOTIFICATION_ID,
    message: message
  })
}

// 前後処理で挟む
async function wrapSort (windowId, keyType, notification) {
  try {
    if (notification) {
      await notify(i18n.getMessage(KEY_SORTING))
    }

    const start = new Date()
    const {all, moved} = await sort(windowId, COMPARATOR_GENERATORS[keyType]())
    const seconds = (new Date() - start) / 1000
    const message = i18n.getMessage(KEY_SUCCESS_MESSAGE, [seconds, all, moved])

    debug(message)
    if (notification) {
      await notify(message)
    }
  } catch (e) {
    onError(e)
    if (notification) {
      await notify(i18n.getMessage(KEY_FAILURE_MESSAGE, e))
    }
  }
}

// 初期化
(async function () {
  // リアルタイムで設定を反映させる
  storage.onChanged.addListener((changes, area) => (async function () {
    const menuItem = changes[KEY_MENU_ITEM]
    if (menuItem && menuItem.newValue) {
      await changeMenu(menuItem.newValue)
    }
  })().catch(onError))

  // 右クリックメニューから実行
  contextMenus.onClicked.addListener((info, tab) => (async function () {
    switch (info.menuItemId) {
      case KEY_URL:
      case KEY_URL_REV:
      case KEY_TITLE:
      case KEY_TITLE_REV:
      case KEY_ID:
      case KEY_ID_REV:
      case KEY_RAND: {
        const notification = await getValue(KEY_NOTIFICATION, DEFAULT_NOTIFICATION)
        await wrapSort(tab.windowId, info.menuItemId, notification)
        break
      }
    }
  })().catch(onError))

  // メッセージから実行
  runtime.onMessageExternal.addListener((message, sender, sendResponse) => (async function () {
    debug('Message ' + JSON.stringify(message) + ' was received')
    switch (message.type) {
      case KEY_SORT: {
        const {
          keyType,
          windowId,
          notification
        } = message
        await wrapSort(windowId, keyType, notification)
      }
    }
  })().catch(onError))

  const menuItem = await getValue(KEY_MENU_ITEM, DEFAULT_MENU_ITEM)
  await changeMenu(menuItem)
})().catch(onError)
