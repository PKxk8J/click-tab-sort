'use strict'

const { contextMenus, i18n, notifications, storage, tabs } = browser
const storageArea = storage.sync

const NOTIFICATION_ID = i18n.getMessage('name')

const LABEL_SORT = i18n.getMessage('sort')
const LABEL_URL = i18n.getMessage('url')
const LABEL_TITLE = i18n.getMessage('title')
const LABEL_SORTING = i18n.getMessage('sorting')

let notificationOn = false

function onError (error) {
  console.error('Error: ' + error)
}

function addMenuItem (id, title, parentId) {
  contextMenus.create({
    id,
    title,
    contexts: ['tab'],
    parentId
  }, () => console.log('Added ' + title + ' menu item'))
}

function changeMenu (result) {
  const { url: urlOn = true, title: titleOn = true } = result

  // 一旦、全削除してから追加する
  const removing = contextMenus.removeAll()
  removing.then(() => {
    console.log('Clear menu items')

    if (urlOn && titleOn) {
      addMenuItem('sort', LABEL_SORT)
      addMenuItem('url', LABEL_URL, 'sort')
      addMenuItem('title', LABEL_TITLE, 'sort')
    } else if (urlOn) {
      addMenuItem('url', i18n.getMessage('sortBy', LABEL_URL))
    } else if (titleOn) {
      addMenuItem('title', i18n.getMessage('sortBy', LABEL_TITLE))
    }
  }, onError)
}

// 設定を反映させる
function applySetting (result) {
  notificationOn = result.notification
  changeMenu(result)
}

// リアルタイムで設定を反映させる
const getting = storageArea.get()
getting.then(applySetting, onError)
storage.onChanged.addListener((changes, area) => {
  const result = {
    url: changes.url.newValue,
    title: changes.title.newValue,
    notification: changes.notification.newValue
  }
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
        console.log('Tab ' + idealHeadId + ' was moved to ' + index)
        orderedIds.add(idealHeadId)
        headIndex++
        nMoves++
        step()
      }, onRearrangeError)
    } else {
      const index = tailIndex
      const moving = tabs.move(idealTailId, {index})
      moving.then(() => {
        console.log('Tab ' + idealTailId + ' was moved to ' + index)
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

  if (!notificationOn) {
    makeSorter(comparator)((success, nTabs, nMoveTabs) => {
      const seconds = (new Date() - start) / 1000
      const message = getResultMessage(success, seconds, nTabs, nMoveTabs)
      console.log(message)
    })
    return
  }

  const creatingStart = notifications.create(NOTIFICATION_ID, {
    'type': 'basic',
    'title': NOTIFICATION_ID,
    message: LABEL_SORTING
  })
  creatingStart.then(() => {
    makeSorter(comparator)((success, nTabs, nMoveTabs) => {
      const seconds = (new Date() - start) / 1000
      const message = getResultMessage(success, seconds, nTabs, nMoveTabs)
      console.log(message)
      const creatingEnd = notifications.create(NOTIFICATION_ID, {
        'type': 'basic',
        'title': NOTIFICATION_ID,
        message
      })
      creatingEnd.then(() => console.log('End'), onError)
    })
  }, onError)
}

contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'url': {
      sort((tab1, tab2) => tab1.url.localeCompare(tab2.url))
      break
    }
    case 'title': {
      sort((tab1, tab2) => tab1.title.localeCompare(tab2.title))
      break
    }
  }
})
