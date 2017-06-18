'use strict'

chrome.contextMenus.create({
  id: 'sort',
  title: 'ソート',
  contexts: ['tab']
})

chrome.contextMenus.create({
  id: 'url',
  title: 'URL',
  contexts: ['tab'],
  parentId: 'sort'
})

chrome.contextMenus.create({
  id: 'title',
  title: 'タイトル',
  contexts: ['tab'],
  parentId: 'sort'
})

function onError (error) {
  console.error('Error: ' + error)
}

// タブのパラメータから順番を判定するキーを取り出す関数を受け取り、
// タブをソートする関数をつくる
function makeSorter (keyGetter) {
  return () => {
    const querying = browser.tabs.query({currentWindow: true})
    querying.then((tabs) => {
      // 現在の並び順
      const currentOrder = tabs.slice()
      currentOrder.sort((tab1, tab2) => tab1.index - tab2.index)

      // ソート後の並び順
      const idealOrder = tabs.slice()
      idealOrder.sort((tab1, tab2) => {
        const key1 = keyGetter(tab1)
        const key2 = keyGetter(tab2)
        if (key1 < key2) {
          return -1
        } else if (key1 > key2) {
          return 1
        } else {
          return 0
        }
      })

      // 既にソート済みのタブの ID
      const orderedIds = new Set()
      // index 以下は既にソート済み
      let index = 0
      let currentOrderIndex = 0
      let idealOrderIndex = 0
      while (index < tabs.length) {
        if (currentOrder[currentOrderIndex].id === idealOrder[idealOrderIndex].id) {
          orderedIds.add(idealOrder[idealOrderIndex].id)
          index++
          currentOrderIndex++
          idealOrderIndex++
          continue
        }

        if (orderedIds.has(currentOrder[currentOrderIndex].id)) {
          currentOrderIndex++
          continue
        }

        // コールバックの中で使うので固定する
        const id = idealOrder[idealOrderIndex].id
        const curIndex = index
        const moving = browser.tabs.move(id, {index})
        moving.then(() => console.log('Tab ' + id + ' was moved to ' + curIndex), onError)
        orderedIds.add(id)
        index++
        idealOrderIndex++
      }
    }, onError)
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'url': {
      makeSorter((tab) => tab.url)()
      break
    }
    case 'title': {
      makeSorter((tab) => tab.title)()
      break
    }
  }
})
