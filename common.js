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

    const KEY_TAB = 'tab'
    const KEY_ALL = 'all'

    const KEY_URL = 'url'
    const KEY_URL_REV = 'urlReverse'
    const KEY_TITLE = 'title'
    const KEY_TITLE_REV = 'titleReverse'
    const KEY_ID = 'id'
    const KEY_ID_REV = 'idReverse'
    const KEY_ACCESS = 'access'
    const KEY_ACCESS_REV = 'accessReverse'
    const KEY_RAND = 'random'
    const KEY_REV = 'reverse'

    const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')

    const storageArea = storage.sync

    function debug(message) {
        if (DEBUG) {
            console.log(message)
        }
    }

    // 設定値を取得する
    async function getValue(key, defaultValue) {
        const {
            [key]: value = defaultValue
        } = await storageArea.get(key)
        return value
    }

    async function asleep(msec) {
        return new Promise(resolve => setTimeout(resolve, msec))
    }

    _export = Object.freeze({
        KEY_TAB,
        KEY_ALL,
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
        KEY_SORT: 'sort',
        KEY_SORT_BY: 'sortBy',
        KEY_CONTEXTS: 'contexts',
        KEY_MENU_ITEMS: 'menuItems',
        KEY_NOTIFICATION: 'notification',
        KEY_SAVE: 'save',
        KEY_SORTING: 'sorting',
        KEY_PROGRESS: 'progress',
        KEY_SUCCESS_MESSAGE: 'successMessage',
        KEY_FAILURE_MESSAGE: 'failureMessage',
        ALL_CONTEXTS: [KEY_TAB, KEY_ALL],
        DEFAULT_CONTEXTS: [KEY_TAB],
        ALL_MENU_ITEMS: [KEY_URL, KEY_URL_REV, KEY_TITLE, KEY_TITLE_REV, KEY_ID, KEY_ID_REV, KEY_ACCESS, KEY_ACCESS_REV, KEY_RAND, KEY_REV],
        DEFAULT_MENU_ITEMS: [KEY_URL, KEY_TITLE],
        DEFAULT_NOTIFICATION: false,
        NOTIFICATION_ID: i18n.getMessage(KEY_NAME),
        NOTIFICATION_INTERVAL: 10 * 1000,
        DEBUG,
        storageArea,
        debug,
        onError: console.error,
        getValue,
        asleep
    })
}

const common = _export
