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

const NOTIFICATION_ID = i18n.getMessage(KEY_NAME)
let notification = false

const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')
function debug (message) {
  if (DEBUG) {
    console.log(message)
  }
}

function onError (error) {
  console.error('Error: ' + error)
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
function changeMenu (result) {
  const flags = [
    { key: KEY_URL, on: falseIffFalse(result[KEY_URL]) },
    { key: KEY_URL_REV, on: result[KEY_URL_REV] },
    { key: KEY_TITLE, on: falseIffFalse(result[KEY_TITLE]) },
    { key: KEY_TITLE_REV, on: result[KEY_TITLE_REV] },
    { key: KEY_RAND, on: result[KEY_RAND] }
  ]

  // 一旦、全削除してから追加する
  const removing = contextMenus.removeAll()
  removing.then(() => {
    debug('Clear menu items')

    let count = 0
    let sample
    for (let flag of flags) {
      if (flag.on) {
        count++
        sample = flag
      }
    }

    switch (count) {
      case 0: {
        break
      }
      case 1: {
        // 1 つだけのときはフラットメニュー
        addMenuItem(sample.key, i18n.getMessage(KEY_SORT_BY, i18n.getMessage(sample.key)))
        break
      }
      default: {
        addMenuItem(KEY_SORT, i18n.getMessage(KEY_SORT))
        for (let flag of flags) {
          if (flag.on) {
            addMenuItem(flag.key, i18n.getMessage(flag.key), KEY_SORT)
          }
        }
      }
    }
  }, onError)
}

// 設定を反映させる
function applySetting (result) {
  notification = result[KEY_NOTIFICATION]
  changeMenu(result)
}

// リアルタイムで設定を反映させる
const getting = storageArea.get()
getting.then(applySetting, onError)
storage.onChanged.addListener((changes, area) => {
  const result = {}
  Object.keys(changes).forEach((key) => { result[key] = changes[key].newValue })
  applySetting(result)
})

// 並べ替える
function rearrange (curOrder, idealOrder, callback) {
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

  let nMoves = 0

  function onRearrangeError (error) {
    onError(error)
    const success = false
    callback(success, idealOrder.length, nMoves)
  }

  function step () {
    if (headIndex > tailIndex) {
      const success = true
      callback(success, idealOrder.length, nMoves)
      return
    }

    const curHeadId = curOrder[curHeadIndex].id
    if (orderedIds.has(curHeadId)) {
      curHeadIndex++
      step()
      return
    }

    const curTailId = curOrder[curTailIndex].id
    if (orderedIds.has(curTailId)) {
      curTailIndex--
      step()
      return
    }

    const idealHeadId = idealOrder[headIndex].id
    if (curHeadId === idealHeadId) {
      orderedIds.add(idealHeadId)
      headIndex++
      curHeadIndex++
      step()
      return
    }

    const idealTailId = idealOrder[tailIndex].id
    if (curTailId === idealTailId) {
      orderedIds.add(idealTailId)
      tailIndex--
      curTailIndex--
      step()
      return
    }

    // 既存の並びを利用できるまでに必要な挿入の回数
    const headDiff = idToIdealIndex.get(curHeadId) - headIndex
    const tailDiff = tailIndex - idToIdealIndex.get(curTailId)

    if (headDiff <= tailDiff) {
      const index = headIndex
      const moving = tabs.move(idealHeadId, {index})
      moving.then(() => {
        debug('Tab ' + idealHeadId + ' was moved to ' + index)
        orderedIds.add(idealHeadId)
        headIndex++
        nMoves++
        step()
      }, onRearrangeError)
    } else {
      const index = tailIndex
      const moving = tabs.move(idealTailId, {index})
      moving.then(() => {
        debug('Tab ' + idealTailId + ' was moved to ' + index)
        orderedIds.add(idealTailId)
        tailIndex--
        nMoves++
        step()
      }, onRearrangeError)
    }
  }

  step()
}

// タブのパラメータから順番を判定するキーを取り出す関数を受け取り、
// タブをソートする関数をつくる
function makeSorter (comparator) {
  return (callback) => {
    const querying = tabs.query({currentWindow: true})
    querying.then((tabList) => {
      // 現在の並び順
      const curOrder = tabList.slice()
      curOrder.sort((tab1, tab2) => tab1.index - tab2.index)

      let firstUnpinnedIndex = 0
      for (; firstUnpinnedIndex < curOrder.length; firstUnpinnedIndex++) {
        if (!curOrder[firstUnpinnedIndex].pinned) {
          break
        }
      }

      // ソート後の並び順
      const unpinnedIdealOrder = curOrder.slice(firstUnpinnedIndex)
      unpinnedIdealOrder.sort(comparator)
      const idealOrder = curOrder.slice(0, firstUnpinnedIndex).concat(unpinnedIdealOrder)

      rearrange(curOrder, idealOrder, callback)
      // // 以下のコードはタブが多いと固まる場合がある
      // const idealIds = idealOrder.map((tab) => tab.id)
      // const moving = tabs.move(idealIds, {index: 0})
      // moving.then(() => {
      //   const success = true
      //   callback(success, idealOrder.length, -1)
      // }, (error) => {
      //   onError(error)
      //   const success = false
      //   callback(success, idealOrder.length, -1)
      // })
    }, (error) => {
      onError(error)
      const success = false
      callback(success, -1, -1)
    })
  }
}

function getResultMessage (success, seconds, nTabs, nMoveTabs) {
  const key = (success ? 'successMessage' : 'failureMessage')
  return i18n.getMessage(key, [seconds, nTabs, nMoveTabs])
}

function sort (comparator) {
  const start = new Date()

  if (!notification) {
    makeSorter(comparator)((success, nTabs, nMoveTabs) => {
      const seconds = (new Date() - start) / 1000
      const message = getResultMessage(success, seconds, nTabs, nMoveTabs)
      debug(message)
    })
    return
  }

  const creatingStart = notifications.create(NOTIFICATION_ID, {
    'type': 'basic',
    'title': NOTIFICATION_ID,
    message: i18n.getMessage(KEY_SORTING)
  })
  creatingStart.then(() => {
    makeSorter(comparator)((success, nTabs, nMoveTabs) => {
      const seconds = (new Date() - start) / 1000
      const message = getResultMessage(success, seconds, nTabs, nMoveTabs)
      debug(message)
      const creatingEnd = notifications.create(NOTIFICATION_ID, {
        'type': 'basic',
        'title': NOTIFICATION_ID,
        message
      })
      creatingEnd.then(() => debug('End'), onError)
    })
  }, onError)
}

contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case KEY_URL: {
      sort((tab1, tab2) => tab1.url.localeCompare(tab2.url))
      break
    }
    case KEY_URL_REV: {
      sort((tab1, tab2) => -tab1.url.localeCompare(tab2.url))
      break
    }
    case KEY_TITLE: {
      sort((tab1, tab2) => tab1.title.localeCompare(tab2.title))
      break
    }
    case KEY_TITLE_REV: {
      sort((tab1, tab2) => -tab1.title.localeCompare(tab2.title))
      break
    }
    case KEY_RAND: {
      const random = []
      sort((tab1, tab2) => {
        const index = Math.max(tab1.index, tab2.index)
        while (random.length <= index) {
          random.push(Math.random())
        }
        return random[tab1.index] - random[tab2.index]
      })
      break
    }
  }
})
