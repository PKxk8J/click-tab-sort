import {
  ALL_MENU_ITEMS,
  KEY_ACCESS,
  KEY_ACCESS_REV,
  KEY_FAILURE_MESSAGE,
  KEY_ID,
  KEY_ID_REV,
  KEY_PROGRESS,
  KEY_RAND,
  KEY_REV,
  KEY_SORTING,
  KEY_SUCCESS_MESSAGE,
  KEY_TITLE,
  KEY_TITLE_REV,
  KEY_URL,
  KEY_URL_REV,
  NOTIFICATION_ID,
  NOTIFICATION_INTERVAL,
  NOTIFICATION_PERMISSION,
  debug,
  onError,
} from './common.js'

const {
  i18n,
  permissions,
  tabs,
} = browser

const COMPARATOR_GENERATORS = {
  [KEY_URL]: () => (tab1, tab2) => tab1.url.localeCompare(tab2.url),
  [KEY_URL_REV]: () => (tab1, tab2) => tab2.url.localeCompare(tab1.url),
  [KEY_TITLE]: () => (tab1, tab2) => tab1.title.localeCompare(tab2.title),
  [KEY_TITLE_REV]: () => (tab1, tab2) => tab2.title.localeCompare(tab1.title),
  [KEY_ID]: () => (tab1, tab2) => tab1.id - tab2.id,
  [KEY_ID_REV]: () => (tab1, tab2) => tab2.id - tab1.id,
  [KEY_ACCESS]: () => (tab1, tab2) => tab1.lastAccessed - tab2.lastAccessed,
  [KEY_ACCESS_REV]: () => (tab1, tab2) => tab2.lastAccessed -
    tab1.lastAccessed,
  [KEY_RAND]: () => {
    const random = []
    return (tab1, tab2) => {
      const index = Math.max(tab1.index, tab2.index)
      while (random.length <= index) {
        random.push(Math.random())
      }
      return random[tab1.index] - random[tab2.index]
    }
  },
  [KEY_REV]: () => {
    const indices = []
    return (tab1, tab2) => {
      const index = Math.max(tab1.index, tab2.index)
      while (indices.length <= index) {
        indices.push(indices.length)
      }
      return indices[tab2.index] - indices[tab1.index]
    }
  },
}

function createComparator (keyType) {
  if (!ALL_MENU_ITEMS.includes(keyType)) {
    throw new Error('Unsupported keyType: ' + keyType)
  }
  return COMPARATOR_GENERATORS[keyType]()
}

async function rearrange (curOrder, idealOrder, progress) {
  const idToIdealIndex = new Map()
  for (let i = 0; i < idealOrder.length; i++) {
    idToIdealIndex.set(idealOrder[i].id, i)
  }

  const orderedIds = new Set()
  let headIndex = 0
  let curHeadIndex = 0
  let tailIndex = idealOrder.length - 1
  let curTailIndex = curOrder.length - 1

  const movePairs = []
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

    const headDiff = idToIdealIndex.get(curHeadId) - headIndex
    const tailDiff = tailIndex - idToIdealIndex.get(curTailId)

    if (headDiff <= tailDiff) {
      movePairs.push([idealHeadId, headIndex])
      orderedIds.add(idealHeadId)
      headIndex++
    } else {
      movePairs.push([idealTailId, tailIndex])
      orderedIds.add(idealTailId)
      tailIndex--
    }
  }

  progress.target = movePairs.length
  for (const [id, index] of movePairs) {
    await tabs.move(id, { index })
    debug('Tab ' + id + ' was moved to ' + index)
    progress.done++
  }
}

async function sortTabs (windowId, comparator, sortPinned, progress) {
  const tabList = await tabs.query({ windowId })
  progress.all = tabList.length

  tabList.sort((tab1, tab2) => tab1.index - tab2.index)

  let firstUnpinnedIndex = 0
  for (; firstUnpinnedIndex < tabList.length; firstUnpinnedIndex++) {
    if (!tabList[firstUnpinnedIndex].pinned) {
      break
    }
  }

  let idealOrder
  if (sortPinned) {
    const pinnedIdealOrder = tabList.slice(0, firstUnpinnedIndex)
    pinnedIdealOrder.sort(comparator)
    idealOrder = pinnedIdealOrder.concat(tabList.slice(firstUnpinnedIndex))
  } else {
    const unpinnedIdealOrder = tabList.slice(firstUnpinnedIndex)
    unpinnedIdealOrder.sort(comparator)
    idealOrder = tabList.slice(0, firstUnpinnedIndex).
      concat(unpinnedIdealOrder)
  }

  await rearrange(tabList, idealOrder, progress)
}

function startProgressNotification (progress) {
  let timerId
  let stopped = false

  const tick = () => {
    timerId = setTimeout(() => {
      if (stopped || progress.end || progress.error) {
        return
      }
      tryNotify(progress).then((notified) => {
        if (notified && !stopped) {
          tick()
        }
      }).catch(onError)
    }, NOTIFICATION_INTERVAL)
  }

  tick()
  return () => {
    stopped = true
    globalThis.clearTimeout(timerId)
  }
}

function getNotificationOptions (progress) {
  let message
  if (progress.error) {
    message = i18n.getMessage(KEY_FAILURE_MESSAGE, progress.error)
  } else if (progress.end) {
    const seconds = (progress.end - progress.start) / 1000
    message = i18n.getMessage(KEY_SUCCESS_MESSAGE,
      [seconds, progress.all, progress.done])
  } else if (progress.start && progress.target) {
    const seconds = (new Date() - progress.start) / 1000
    const percentage = Math.floor(progress.done * 100 / progress.target)
    message = i18n.getMessage(KEY_PROGRESS, [seconds, percentage])
  } else {
    message = i18n.getMessage(KEY_SORTING)
  }
  return {
    type: 'basic',
    title: NOTIFICATION_ID,
    message,
  }
}

async function notify (progress) {
  await browser.notifications.create(NOTIFICATION_ID,
    getNotificationOptions(progress))
}

async function tryNotify (progress) {
  try {
    await notify(progress)
    return true
  } catch (error) {
    onError(error)
    return false
  }
}

export async function run (windowId, keyType, sortPinned, notification) {
  const progress = {
    done: 0,
  }
  let notifyEnabled = false
  let stopProgressNotification
  try {
    const notificationsApi = browser.notifications
    notifyEnabled = notification &&
      typeof notificationsApi?.create === 'function' &&
      await permissions.contains(NOTIFICATION_PERMISSION)
    if (notifyEnabled) {
      progress.start = new Date()
      stopProgressNotification = startProgressNotification(progress)
    }

    await sortTabs(windowId, createComparator(keyType), sortPinned, progress)
    debug('Finished')

    if (notifyEnabled) {
      progress.end = new Date()
      stopProgressNotification?.()
      stopProgressNotification = undefined
      await tryNotify(progress)
    }
  } catch (error) {
    onError(error)
    if (notifyEnabled) {
      progress.error = error
      stopProgressNotification?.()
      stopProgressNotification = undefined
      await tryNotify(progress)
    }
  } finally {
    stopProgressNotification?.()
  }
}
