'use strict'

// 共通処理

var _export

{
  const {
    i18n,
    storage
  } = browser

  const KEY_DEBUG = 'debug'
  const KEY_NAME = 'name'

  const KEY_URL = 'url'
  const KEY_URL_REV = 'urlReverse'
  const KEY_TITLE = 'title'
  const KEY_TITLE_REV = 'titleReverse'
  const KEY_ID = 'id'
  const KEY_ID_REV = 'idReverse'
  const KEY_RAND = 'random'

  const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')

  const storageArea = storage.sync

  function debug (message) {
    if (DEBUG) {
      console.log(message)
    }
  }

  function onError (error) {
    console.error(error)
  }

  // 設定値を取得する
  async function getValue (key, defaultValue) {
    const {
      [key]: value = defaultValue
    } = await storageArea.get(key)
    return value
  }

  _export = Object.freeze({
    KEY_URL,
    KEY_URL_REV,
    KEY_TITLE,
    KEY_TITLE_REV,
    KEY_ID,
    KEY_ID_REV,
    KEY_RAND,
    KEY_SORT: 'sort',
    KEY_SORT_BY: 'sortBy',
    KEY_MENU_ITEM: 'menuItem',
    KEY_NOTIFICATION: 'notification',
    KEY_SAVE: 'save',
    KEY_SORTING: 'sorting',
    KEY_SUCCESS_MESSAGE: 'successMessage',
    KEY_FAILURE_MESSAGE: 'failureMessage',
    KEY_MENU_ITEM_DESCRIPTION: 'menuItemDescription',
    ALL_MENU_ITEMS: [KEY_URL, KEY_URL_REV, KEY_TITLE, KEY_TITLE_REV, KEY_ID, KEY_ID_REV, KEY_RAND],
    DEFAULT_MENU_ITEMS: [KEY_URL, KEY_TITLE],
    DEFAULT_NOTIFICATION: false,
    NOTIFICATION_ID: i18n.getMessage(KEY_NAME),
    DEBUG,
    storageArea,
    debug,
    onError,
    getValue
  })
}

const common = _export
