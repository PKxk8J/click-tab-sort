'use strict'

// ソート処理本体

var _export

{
  const {
    i18n,
    notifications,
    tabs
  } = browser
  const {
    KEY_URL,
    KEY_URL_REV,
    KEY_TITLE,
    KEY_TITLE_REV,
    KEY_ID,
    KEY_ID_REV,
    KEY_RAND,
    KEY_SORTING,
    KEY_SUCCESS_MESSAGE,
    KEY_FAILURE_MESSAGE,
    NOTIFICATION_ID,
    debug,
    onError
  } = common

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
  async function _sort (windowId, comparator) {
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
      const {all, moved} = await _sort(windowId, COMPARATOR_GENERATORS[keyType]())
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

  _export = wrapSort
}

const sort = _export
