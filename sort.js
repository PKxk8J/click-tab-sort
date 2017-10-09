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
    KEY_ACCESS,
    KEY_ACCESS_REV,
    KEY_RAND,
    KEY_SORTING,
    KEY_SUCCESS_MESSAGE,
    KEY_FAILURE_MESSAGE,
    NOTIFICATION_ID,
    NOTIFICATION_INTERVAL,
    debug,
    onError,
    asleep
  } = common

  // 比較関数の生成関数
  const COMPARATOR_GENERATORS = {
    [KEY_URL]: () => (tab1, tab2) => tab1.url.localeCompare(tab2.url),
    [KEY_URL_REV]: () => (tab1, tab2) => tab2.url.localeCompare(tab1.url),
    [KEY_TITLE]: () => (tab1, tab2) => tab1.title.localeCompare(tab2.title),
    [KEY_TITLE_REV]: () => (tab1, tab2) => tab2.title.localeCompare(tab1.title),
    [KEY_ID]: () => (tab1, tab2) => tab1.id - tab2.id,
    [KEY_ID_REV]: () => (tab1, tab2) => tab2.id - tab1.id,
    [KEY_ACCESS]: () => (tab1, tab2) => tab1.lastAccessed - tab2.lastAccessed,
    [KEY_ACCESS_REV]: () => (tab1, tab2) => tab2.lastAccessed - tab1.lastAccessed,
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
  async function rearrange (curOrder, idealOrder, progress) {
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

      progress.checked++

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

      progress.moved++

      // 既存の並びを利用できるまでに必要な挿入の回数
      const headDiff = idToIdealIndex.get(curHeadId) - headIndex
      const tailDiff = tailIndex - idToIdealIndex.get(curTailId)

      if (headDiff <= tailDiff) {
        const index = headIndex
        await tabs.move(idealHeadId, {index})
        debug('Tab ' + idealHeadId + ' was moved to ' + index)
        orderedIds.add(idealHeadId)
        headIndex++
      } else {
        const index = tailIndex
        await tabs.move(idealTailId, {index})
        debug('Tab ' + idealTailId + ' was moved to ' + index)
        orderedIds.add(idealTailId)
        tailIndex--
      }
    }
  }

  // タブをソートする
  async function run (windowId, comparator, progress) {
    const tabList = await tabs.query({windowId})
    progress.all = tabList.length
    progress.checked = 0
    progress.moved = 0

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

    await rearrange(tabList, idealOrder, progress)
  }

  async function startProgressNotification (progress) {
    while (!progress.end && !progress.error) {
      notify(progress)
      await asleep(NOTIFICATION_INTERVAL)
    }
  }

  // 通知を表示する
  async function notify (progress) {
    let message
    if (progress.error) {
      message = i18n.getMessage(KEY_FAILURE_MESSAGE, progress.error)
    } else if (progress.end) {
      const seconds = (progress.end - progress.start) / 1000
      message = i18n.getMessage(KEY_SUCCESS_MESSAGE, [seconds, progress.all, progress.moved])
    } else if (progress.all) {
      const seconds = (new Date() - progress.start) / 1000
      const percentage = Math.floor(progress.checked * 100 / progress.all)
      message = i18n.getMessage(KEY_SORTING, [seconds, percentage])
    } else {
      message = i18n.getMessage(KEY_SORTING, [0, 0])
    }
    await notifications.create(NOTIFICATION_ID, {
      'type': 'basic',
      'title': NOTIFICATION_ID,
      message
    })
  }

  // 前後処理で挟む
  async function wrappedRun (windowId, keyType, notification) {
    let progress = {}
    try {
      if (notification) {
        startProgressNotification(progress)
        progress.start = new Date()
      }

      await run(windowId, COMPARATOR_GENERATORS[keyType](), progress)
      debug('Finished')

      if (notification) {
        progress.end = new Date()
        await notify(progress)
      }
    } catch (e) {
      onError(e)
      if (notification) {
        progress.error = e
        await notify(progress)
      }
    }
  }

  _export = Object.freeze({
    run: wrappedRun
  })
}

const sort = _export
