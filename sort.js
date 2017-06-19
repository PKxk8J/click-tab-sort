'use strict'

chrome.contextMenus.create({
  id: 'sort',
  title: browser.i18n.getMessage('sort'),
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
  title: browser.i18n.getMessage('title'),
  contexts: ['tab'],
  parentId: 'sort'
})

function onError (error) {
  console.error('Error: ' + error)
}

function rearrange (curOrder, idealOrder) {
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
      const moving = browser.tabs.move(idealHeadId, {index})
      moving.then(() => console.log('Tab ' + idealHeadId + ' was moved to ' + index), onError)
      orderedIds.add(idealHeadId)
      headIndex++
    } else {
      const index = tailIndex
      const moving = browser.tabs.move(idealTailId, {index})
      moving.then(() => console.log('Tab ' + idealTailId + ' was moved to ' + index), onError)
      orderedIds.add(idealTailId)
      tailIndex--
    }
  }
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

      let firstUnpinnedIndex = 0
      for (; firstUnpinnedIndex < curOrder.length; firstUnpinnedIndex++) {
        if (!curOrder[firstUnpinnedIndex].pinned) {
          break
        }
      }

      // ソート後の並び順
      const unpinnedIdealOrder = curOrder.slice(firstUnpinnedIndex)
      unpinnedIdealOrder.sort((tab1, tab2) => {
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
      const idealOrder = curOrder.slice(0, firstUnpinnedIndex).concat(unpinnedIdealOrder)

      rearrange(curOrder, idealOrder)
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
