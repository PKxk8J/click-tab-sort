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

export const KEY_SORT = 'sort'
export const KEY_SORT_BY = 'sortBy'
export const KEY_CONTEXTS = 'contexts'
export const KEY_MENU_ITEMS = 'menuItems'
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
export const DEFAULT_MENU_ITEMS = [KEY_URL, KEY_TITLE]
export const DEFAULT_NOTIFICATION = false

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

export async function getValue (key, defaultValue) {
  const {
    [key]: value = defaultValue,
  } = await storageArea.get(key)
  return value
}

function cloneKeys (keys) {
  return [...keys]
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
    return cloneKeys(DEFAULT_MENU_ITEMS)
  }

  if (!Array.isArray(menuItems)) {
    return []
  }

  return ALL_MENU_ITEMS.filter((key) => menuItems.includes(key))
}

export function normalizeNotification (notification) {
  if (notification === undefined) {
    return DEFAULT_NOTIFICATION
  }

  return notification === true
}
