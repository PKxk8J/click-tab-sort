import {
  ALL_MENU_ITEMS,
  KEY_ALL_GROUPS,
  KEY_ACCESS,
  KEY_ACCESS_REV,
  KEY_CURRENT_AREA,
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

function getNoGroupId () {
  return browser.tabGroups?.TAB_GROUP_ID_NONE ?? -1
}

function getNoSplitViewId () {
  return tabs.SPLIT_VIEW_ID_NONE ?? -1
}

function isGroupedTab (tab) {
  return tab.groupId !== undefined && tab.groupId !== getNoGroupId()
}

function isSplitViewTab (tab) {
  return tab.splitViewId !== undefined &&
    tab.splitViewId !== getNoSplitViewId()
}

function getRepresentativeTab (unit) {
  if (unit.type === 'group') {
    return getRepresentativeTab(unit.units[0])
  }
  return unit.tabs[0]
}

function makeTabUnit (tab) {
  return {
    id: 'tab:' + tab.id,
    type: 'tab',
    tabs: [tab],
  }
}

function makeSplitViewUnit (tabList, startIndex) {
  const splitViewId = tabList[startIndex].splitViewId
  const unitTabs = []
  let index = startIndex
  for (; index < tabList.length; index++) {
    if (tabList[index].splitViewId !== splitViewId) {
      break
    }
    unitTabs.push(tabList[index])
  }

  return {
    nextIndex: index,
    unit: {
      id: 'splitView:' + splitViewId + ':' + unitTabs[0].id,
      type: 'splitView',
      splitViewId,
      tabs: unitTabs,
    },
  }
}

function buildTabUnits (tabList) {
  const units = []
  for (let i = 0; i < tabList.length;) {
    const tab = tabList[i]
    if (isSplitViewTab(tab)) {
      const { unit, nextIndex } = makeSplitViewUnit(tabList, i)
      units.push(unit)
      i = nextIndex
      continue
    }

    units.push(makeTabUnit(tab))
    i++
  }
  return units
}

function makeGroupUnit (tabList, startIndex) {
  const groupId = tabList[startIndex].groupId
  const groupTabs = []
  let index = startIndex
  for (; index < tabList.length; index++) {
    if (tabList[index].groupId !== groupId) {
      break
    }
    groupTabs.push(tabList[index])
  }

  return {
    nextIndex: index,
    unit: {
      id: 'group:' + groupId,
      type: 'group',
      groupId,
      tabs: groupTabs,
      units: buildTabUnits(groupTabs),
    },
  }
}

function buildTopLevelUnits (tabList) {
  const units = []
  for (let i = 0; i < tabList.length;) {
    const tab = tabList[i]
    if (isGroupedTab(tab)) {
      const { unit, nextIndex } = makeGroupUnit(tabList, i)
      units.push(unit)
      i = nextIndex
      continue
    }

    if (isSplitViewTab(tab)) {
      const { unit, nextIndex } = makeSplitViewUnit(tabList, i)
      units.push(unit)
      i = nextIndex
      continue
    }

    units.push(makeTabUnit(tab))
    i++
  }
  return units
}

function sortUnits (units, comparator) {
  const idealUnits = [...units]
  idealUnits.sort((unit1, unit2) => comparator(
    getRepresentativeTab(unit1),
    getRepresentativeTab(unit2),
  ))
  return idealUnits
}

async function moveUnit (unit, index) {
  if (unit.type === 'group' &&
      typeof browser.tabGroups?.move === 'function') {
    await browser.tabGroups.move(unit.groupId, { index })
    debug('Group ' + unit.groupId + ' was moved to ' + index)
    return
  }

  const ids = unit.tabs.map((tab) => tab.id)
  await tabs.move(ids.length === 1 ? ids[0] : ids, { index })
  debug('Tabs ' + ids.join(',') + ' were moved to ' + index)
}

async function restoreTopLevelMembership (windowId, topLevelTabIds) {
  if (topLevelTabIds.size <= 0 || typeof tabs.ungroup !== 'function') {
    return
  }

  const tabList = await tabs.query({ windowId })
  const attachedIds = tabList.
    filter((tab) => topLevelTabIds.has(tab.id) && isGroupedTab(tab)).
    map((tab) => tab.id)
  if (attachedIds.length <= 0) {
    return
  }

  await tabs.ungroup(attachedIds)
  debug('Tabs ' + attachedIds.join(',') + ' were restored to top level')
}

async function rearrangeUnits (curOrder, idealOrder, progress,
  afterMove = async () => {}) {
  if (curOrder.length <= 0 || idealOrder.length <= 0) {
    return
  }

  const idToIdealIndex = new Map()
  const idToIdealStartIndex = new Map()
  let idealStartIndex = curOrder[0].tabs[0].index
  for (let i = 0; i < idealOrder.length; i++) {
    idToIdealIndex.set(idealOrder[i].id, i)
    idToIdealStartIndex.set(idealOrder[i].id, idealStartIndex)
    idealStartIndex += idealOrder[i].tabs.length
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
      movePairs.push([
        idealOrder[headIndex],
        idToIdealStartIndex.get(idealHeadId),
      ])
      orderedIds.add(idealHeadId)
      headIndex++
    } else {
      movePairs.push([
        idealOrder[tailIndex],
        idToIdealStartIndex.get(idealTailId),
      ])
      orderedIds.add(idealTailId)
      tailIndex--
    }
  }

  progress.target = (progress.target || 0) +
    movePairs.reduce((sum, [unit]) => sum + unit.tabs.length, 0)
  for (const [unit, index] of movePairs) {
    await moveUnit(unit, index)
    await afterMove()
    progress.done += unit.tabs.length
  }
}

function getSortedTabsInSegment (tabList, sortPinned) {
  const sortedTabs = [...tabList].sort((tab1, tab2) => tab1.index - tab2.index)

  let firstUnpinnedIndex = 0
  for (; firstUnpinnedIndex < sortedTabs.length; firstUnpinnedIndex++) {
    if (!sortedTabs[firstUnpinnedIndex].pinned) {
      break
    }
  }

  if (sortPinned) {
    return sortedTabs.slice(0, firstUnpinnedIndex)
  }
  return sortedTabs.slice(firstUnpinnedIndex)
}

async function querySortedTabsInSegment (windowId, sortPinned, progress) {
  const tabList = await tabs.query({ windowId })
  progress.all = tabList.length
  return getSortedTabsInSegment(tabList, sortPinned)
}

function findTargetTab (tabList, targetTabId) {
  return tabList.find((tab) => tab.id === targetTabId) || tabList[0]
}

async function sortGroup (windowId, sortPinned, groupId, comparator, progress) {
  const tabList = await querySortedTabsInSegment(windowId, sortPinned, progress)
  const groupTabs = tabList.filter((tab) => tab.groupId === groupId)
  if (groupTabs.length <= 0) {
    return
  }

  const units = buildTabUnits(groupTabs)
  await rearrangeUnits(units, sortUnits(units, comparator), progress)
}

async function sortAllGroups (windowId, sortPinned, comparator, progress) {
  const tabList = await querySortedTabsInSegment(windowId, sortPinned, progress)
  const groupIds = []
  const knownGroupIds = new Set()
  for (const tab of tabList) {
    if (!isGroupedTab(tab) || knownGroupIds.has(tab.groupId)) {
      continue
    }
    knownGroupIds.add(tab.groupId)
    groupIds.push(tab.groupId)
  }

  for (const groupId of groupIds) {
    await sortGroup(windowId, sortPinned, groupId, comparator, progress)
  }
}

async function sortTopLevel (windowId, sortPinned, comparator, progress) {
  const tabList = await querySortedTabsInSegment(windowId, sortPinned, progress)
  const units = buildTopLevelUnits(tabList)
  const topLevelTabIds = new Set(units.
    filter((unit) => unit.type !== 'group').
    flatMap((unit) => unit.tabs.map((tab) => tab.id)))
  const restore = () => restoreTopLevelMembership(windowId, topLevelTabIds)
  await rearrangeUnits(units, sortUnits(units, comparator), progress, restore)
  await restore()
}

async function sortTabs (windowId, comparator, sortPinned, scope, targetTabId,
  progress) {
  const tabList = await querySortedTabsInSegment(windowId, sortPinned, progress)
  const targetTab = findTargetTab(tabList, targetTabId)

  if (scope === KEY_CURRENT_AREA) {
    if (isGroupedTab(targetTab)) {
      await sortGroup(windowId, sortPinned, targetTab.groupId, comparator,
        progress)
      return
    }

    await sortTopLevel(windowId, sortPinned, comparator, progress)
    return
  }

  if (scope === KEY_ALL_GROUPS) {
    await sortAllGroups(windowId, sortPinned, comparator, progress)
    await sortTopLevel(windowId, sortPinned, comparator, progress)
    return
  }

  throw new Error('Unsupported scope: ' + scope)
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

export async function run (windowId, keyType, sortPinned, notification,
  scope = KEY_CURRENT_AREA, targetTabId) {
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

    await sortTabs(windowId, createComparator(keyType), sortPinned, scope,
      targetTabId, progress)
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
