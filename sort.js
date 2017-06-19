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
      const curOrder = tabs.slice()
      curOrder.sort((tab1, tab2) => tab1.index - tab2.index)

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

      const idToIdealIndex = new Map()
      for (let i = 0; i < idealOrder.length; i++) {
        idToIdealIndex.set(idealOrder[i].id, i)
      }

      // 既にソート済みのタブの ID
      const orderedIds = new Set()
      // まだソートできていない部分の先頭。headIndex より前は既にソート済み
      let headIndex = 0
      let curHeadIndex = 0
      let idealHeadIndex = 0
      // まだソートできていない部分の末尾。tailIndex より後ろは既にソート済み
      let tailIndex = idealOrder.length - 1
      let curTailIndex = curOrder.length - 1
      let idealTailIndex = idealOrder.length - 1
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

        const idealHeadId = idealOrder[idealHeadIndex].id
        if (curHeadId === idealHeadId) {
          orderedIds.add(idealHeadId)
          headIndex++
          curHeadIndex++
          idealHeadIndex++
          continue
        }

        const idealTailId = idealOrder[idealTailIndex].id
        if (curTailId === idealTailId) {
          orderedIds.add(idealTailId)
          tailIndex--
          curTailIndex--
          idealTailIndex--
          continue
        }

        // 既存の並びを利用できるまでに必要な挿入の回数
        const headDiff = idToIdealIndex.get(curHeadId) - headIndex
        const tailDiff = tailIndex - idToIdealIndex.get(curTailId)

        if (headDiff <= tailDiff) {
          const moveIndex = headIndex
          const moving = browser.tabs.move(idealHeadId, {index: moveIndex})
          moving.then(() => console.log('Tab ' + idealHeadId + ' was moved to ' + moveIndex), onError)
          orderedIds.add(idealHeadId)
          headIndex++
          idealHeadIndex++
        } else {
          const moveIndex = tailIndex
          const moving = browser.tabs.move(idealTailId, {index: moveIndex})
          moving.then(() => console.log('Tab ' + idealTailId + ' was moved to ' + moveIndex), onError)
          orderedIds.add(idealTailId)
          tailIndex--
          idealTailIndex--
        }
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
