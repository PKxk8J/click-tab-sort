const {
  i18n,
  storage,
} = browser

export const KEY_DEBUG = 'debug'
export const KEY_NAME = 'name'

export const KEY_TAB = 'tab'
export const KEY_ALL = 'all'

export const KEY_URL = 'url'
export const KEY_URL_REV = 'urlReverse'
export const KEY_TITLE = 'title'
export const KEY_TITLE_REV = 'titleReverse'
export const KEY_ID = 'id'
export const KEY_ID_REV = 'idReverse'
export const KEY_ACCESS = 'access'
export const KEY_ACCESS_REV = 'accessReverse'
export const KEY_RAND = 'random'
export const KEY_REV = 'reverse'

export const KEY_CURRENT_AREA = 'currentArea'
export const KEY_ALL_GROUPS = 'allGroups'
export const KEY_CURRENT_GROUP_ONLY = 'currentGroupOnly'
export const KEY_TOP_LEVEL_ONLY = 'topLevelOnly'
export const KEY_TOP_LEVEL_SCOPE = 'topLevelScope'
export const KEY_GROUP_SCOPE = 'groupScope'
export const KEY_PINNED_SCOPE = 'pinnedScope'
export const KEY_ALL_GROUPS_MENU = 'allGroupsMenu'

export const KEY_SORT = 'sort'
export const KEY_SORT_BY = 'sortBy'
export const KEY_CONTEXTS = 'contexts'
export const KEY_MENU_ITEMS = 'menuItems'
export const KEY_HIERARCHY_DESCRIPTION = 'hierarchyDescription'
export const KEY_BEHAVIOR = 'behavior'
export const KEY_USE_GROUP_NAME_AS_GROUP_TITLE =
  'useGroupNameAsGroupTitle'
export const KEY_USE_GROUP_NAME_AS_GROUP_TITLE_DESCRIPTION =
  'useGroupNameAsGroupTitleDescription'
export const KEY_NOTIFICATION = 'notification'
export const KEY_FEEDBACK = 'feedback'
export const KEY_SETTINGS = 'settings'
export const KEY_SAVE_STATUS_FAILED = 'saveStatusFailed'
export const KEY_SAVE_STATUS_SAVED = 'saveStatusSaved'
export const KEY_SAVE_STATUS_SAVING = 'saveStatusSaving'
export const KEY_SORTING = 'sorting'
export const KEY_PROGRESS = 'progress'
export const KEY_SUCCESS_MESSAGE = 'successMessage'
export const KEY_FAILURE_MESSAGE = 'failureMessage'

export const ALL_CONTEXTS = [KEY_TAB, KEY_ALL]
export const DEFAULT_CONTEXTS = [KEY_TAB]
export const ALL_MENU_ITEMS = [
  KEY_URL,
  KEY_URL_REV,
  KEY_TITLE,
  KEY_TITLE_REV,
  KEY_ID,
  KEY_ID_REV,
  KEY_ACCESS,
  KEY_ACCESS_REV,
  KEY_RAND,
  KEY_REV,
]
export const ALL_MENU_SCOPES = [KEY_CURRENT_AREA, KEY_ALL_GROUPS]
export const DEFAULT_MENU_ITEMS = {
  [KEY_URL]: [KEY_ALL_GROUPS],
  [KEY_TITLE]: [KEY_ALL_GROUPS],
}
export const DEFAULT_NOTIFICATION = false
export const DEFAULT_USE_GROUP_NAME_AS_GROUP_TITLE = false

export const NOTIFICATION_PERMISSION = {
  permissions: ['notifications'],
}
export const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')
export const NOTIFICATION_ID = i18n.getMessage(KEY_NAME)
export const NOTIFICATION_INTERVAL = 10 * 1000

export const storageArea = storage.sync

export function debug (message) {
  if (DEBUG) {
    console.log(message)
  }
}

export function onError (error) {
  console.error(error)
}

export function getNoGroupId () {
  return browser.tabGroups?.TAB_GROUP_ID_NONE ?? -1
}

export function getNoSplitViewId () {
  return -1
}

export function isGroupedTab (tab) {
  return tab?.groupId !== undefined && tab.groupId !== getNoGroupId()
}

export function isSplitViewTab (tab) {
  return tab?.splitViewId !== undefined &&
    tab.splitViewId !== getNoSplitViewId()
}

export function getSortedTabsInSegment (tabList, sortPinned) {
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

export async function getValue (key, defaultValue) {
  const {
    [key]: value = defaultValue,
  } = await storageArea.get(key)
  return value
}

function cloneKeys (keys) {
  return [...keys]
}

function cloneMenuItems (menuItems) {
  const normalized = {}
  for (const key of ALL_MENU_ITEMS) {
    const scopes = menuItems[key]
    if (Array.isArray(scopes) && scopes.length > 0) {
      normalized[key] = [...scopes]
    }
  }
  return normalized
}

export function normalizeContexts (contexts) {
  if (contexts === undefined) {
    return cloneKeys(DEFAULT_CONTEXTS)
  }

  if (!Array.isArray(contexts)) {
    return []
  }

  return ALL_CONTEXTS.filter((key) => contexts.includes(key))
}

export function normalizeMenuItems (menuItems) {
  if (menuItems === undefined) {
    return cloneMenuItems(DEFAULT_MENU_ITEMS)
  }

  // Legacy settings from versions before per-item scopes were introduced.
  if (Array.isArray(menuItems)) {
    const normalized = {}
    for (const key of ALL_MENU_ITEMS) {
      if (menuItems.includes(key)) {
        normalized[key] = [KEY_CURRENT_AREA]
      }
    }
    return normalized
  }

  if (!menuItems || typeof menuItems !== 'object') {
    return {}
  }

  const normalized = {}
  for (const key of ALL_MENU_ITEMS) {
    const scopes = menuItems[key]
    if (!Array.isArray(scopes)) {
      continue
    }

    const normalizedScopes = ALL_MENU_SCOPES.
      filter((scope) => scopes.includes(scope))
    if (normalizedScopes.length > 0) {
      normalized[key] = normalizedScopes
    }
  }
  return normalized
}

export function normalizeNotification (notification) {
  if (notification === undefined) {
    return DEFAULT_NOTIFICATION
  }

  return notification === true
}

export function normalizeUseGroupNameAsGroupTitle (useGroupName) {
  if (useGroupName === undefined) {
    return DEFAULT_USE_GROUP_NAME_AS_GROUP_TITLE
  }

  return useGroupName === true
}
