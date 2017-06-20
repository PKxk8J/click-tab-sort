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

  function step () {
    if (headIndex > tailIndex) {
      callback()
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
      const moving = browser.tabs.move(idealHeadId, {index})
      moving.then(() => {
        console.log('Tab ' + idealHeadId + ' was moved to ' + index)
        orderedIds.add(idealHeadId)
        headIndex++
        step()
      }, onError)
    } else {
      const index = tailIndex
      const moving = browser.tabs.move(idealTailId, {index})
      moving.then(() => {
        console.log('Tab ' + idealTailId + ' was moved to ' + index)
        orderedIds.add(idealTailId)
        tailIndex--
        step()
      }, onError)
    }
  }

  step()
}

// タブのパラメータから順番を判定するキーを取り出す関数を受け取り、
// タブをソートする関数をつくる
function makeSorter (comparator) {
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
      unpinnedIdealOrder.sort(comparator)
      const idealOrder = curOrder.slice(0, firstUnpinnedIndex).concat(unpinnedIdealOrder)

      const start = new Date()
      rearrange(curOrder, idealOrder, () => console.log('Rearrange took ' + (new Date() - start) / 1000 + ' seconds'))
      // 以下のコードは時々固まる
      // const idealIds = idealOrder.map((tab) => tab.id)
      // const moving = browser.tabs.move(idealIds, {index: 0})
      // const start = new Date()
      // moving.then(() => console.log('Rearrange took ' + (new Date() - start) / 1000 + ' seconds'), onError)
    }, onError)
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'url': {
      makeSorter((tab1, tab2) => tab1.url.localeCompare(tab2.url))()
      break
    }
    case 'title': {
      makeSorter((tab1, tab2) => tab1.title.localeCompare(tab2.title))()
      break
    }
  }
})
