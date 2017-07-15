'use strict'

const { contextMenus, i18n, notifications, runtime, storage, tabs } = browser
const storageArea = storage.sync

const KEY_DEBUG = 'debug'

const KEY_URL = 'url'
const KEY_URL_REV = 'urlReverse'
const KEY_TITLE = 'title'
const KEY_TITLE_REV = 'titleReverse'
const KEY_RAND = 'random'
const KEY_NOTIFICATION = 'notification'

const KEY_NAME = 'name'
const KEY_SORT = 'sort'
const KEY_SORT_BY = 'sortBy'
const KEY_SORTING = 'sorting'

const KEY_SUCCESS_MESSAGE = 'successMessage'
const KEY_FAILURE_MESSAGE = 'failureMessage'

const NOTIFICATION_ID = i18n.getMessage(KEY_NAME)
let notification = false

const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')
function debug (message) {
  if (DEBUG) {
    console.log(message)
  }
}

function onError (error) {
  console.error(error)
}

// bool が undefined でなく false のときだけ false になるように
function falseIffFalse (bool) {
  if (typeof bool === 'undefined') {
    return true
  }
  return bool
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

// 右クリックメニューの変更
async function changeMenu (result) {
  const menuKeys = []

  if (falseIffFalse(result[KEY_URL])) {
    menuKeys.push(KEY_URL)
  }
  if (result[KEY_URL_REV]) {
    menuKeys.push(KEY_URL_REV)
  }
  if (falseIffFalse(result[KEY_TITLE])) {
    menuKeys.push(KEY_TITLE)
  }
  if (result[KEY_TITLE_REV]) {
    menuKeys.push(KEY_TITLE_REV)
  }
  if (result[KEY_RAND]) {
    menuKeys.push(KEY_RAND)
  }

  // 一旦、全削除してから追加する
  await contextMenus.removeAll()
  debug('Clear menu items')

  switch (menuKeys.length) {
    case 0: {
      break
    }
    case 1: {
      // 1 つだけのときはフラットメニュー
      const key = menuKeys[0]
      addMenuItem(key, i18n.getMessage(KEY_SORT_BY, i18n.getMessage(key)))
      break
    }
    default: {
      addMenuItem(KEY_SORT, i18n.getMessage(KEY_SORT))
      menuKeys.forEach((key) => addMenuItem(key, i18n.getMessage(key), KEY_SORT))
    }
  }
}

// 設定を反映させる
async function applySetting (result) {
  debug('Apply ' + JSON.stringify(result))
  notification = result[KEY_NOTIFICATION]
  await changeMenu(result)
}

// リアルタイムで設定を反映させる
storage.onChanged.addListener((changes, area) => (async function () {
  const result = {}
  Object.keys(changes).forEach((key) => { result[key] = changes[key].newValue })
  await applySetting(result)
})().catch(onError))

// 初期化
;(async function () {
  const result = await storageArea.get()
  await applySetting(result)
})().catch(onError)

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
async function sort (comparator) {
  const tabList = await tabs.query({currentWindow: true})

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
async function wrapSort (comparator) {
  if (notification) {
    await notify(i18n.getMessage(KEY_SORTING))
  }

  const start = new Date()
  const {all, moved} = await sort(comparator)
  const seconds = (new Date() - start) / 1000
  const message = i18n.getMessage(KEY_SUCCESS_MESSAGE, [seconds, all, moved])

  debug(message)
  if (notification) {
    await notify(message)
  }
}

// 右クリックメニューからの入力を処理
contextMenus.onClicked.addListener((info, tab) => (async function () {
  switch (info.menuItemId) {
    case KEY_URL: {
      await wrapSort((tab1, tab2) => tab1.url.localeCompare(tab2.url))
      break
    }
    case KEY_URL_REV: {
      await wrapSort((tab1, tab2) => -tab1.url.localeCompare(tab2.url))
      break
    }
    case KEY_TITLE: {
      await wrapSort((tab1, tab2) => tab1.title.localeCompare(tab2.title))
      break
    }
    case KEY_TITLE_REV: {
      await wrapSort((tab1, tab2) => -tab1.title.localeCompare(tab2.title))
      break
    }
    case KEY_RAND: {
      const random = []
      await wrapSort((tab1, tab2) => {
        const index = Math.max(tab1.index, tab2.index)
        while (random.length <= index) {
          random.push(Math.random())
        }
        return random[tab1.index] - random[tab2.index]
      })
      break
    }
  }
})().catch((e) => {
  onError(e)
  if (notification) {
    notify(i18n.getMessage(KEY_FAILURE_MESSAGE, e)).catch(onError)
  }
}))
