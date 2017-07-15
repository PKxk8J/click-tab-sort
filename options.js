'use strict'

const { i18n, storage } = browser
const storageArea = storage.sync

const KEY_DEBUG = 'debug'

const KEY_URL = 'url'
const KEY_URL_REV = 'urlReverse'
const KEY_TITLE = 'title'
const KEY_TITLE_REV = 'titleReverse'
const KEY_RAND = 'random'
const KEY_NOTIFICATION = 'notification'

const KEY_MENU_ITEM = 'menuItem'
const KEY_SAVE = 'save'

const DEBUG = (i18n.getMessage(KEY_DEBUG) === 'debug')
function debug (message) {
  if (DEBUG) {
    console.log(message)
  }
}

function onError (error) {
  console.error(error)
}

// bool が undefined でなく false のときだけ false になるように
function falseIffFalse (bool) {
  if (typeof bool === 'undefined') {
    return true
  }
  return bool
}

[KEY_MENU_ITEM, KEY_URL, KEY_URL_REV, KEY_TITLE, KEY_TITLE_REV, KEY_RAND, KEY_NOTIFICATION, KEY_SAVE].forEach((key) => {
  document.getElementById('label_' + key).innerText = i18n.getMessage(key)
})

// 現在の設定を表示する
async function restore () {
  const result = await storageArea.get()
  debug('Loaded ' + JSON.stringify(result))

  const flags = {
    [KEY_URL]: falseIffFalse(result[KEY_URL]),
    [KEY_URL_REV]: result[KEY_URL_REV],
    [KEY_TITLE]: falseIffFalse(result[KEY_TITLE]),
    [KEY_TITLE_REV]: result[KEY_TITLE_REV],
    [KEY_RAND]: result[KEY_RAND],
    [KEY_NOTIFICATION]: result[KEY_NOTIFICATION]
  }
  Object.keys(flags).forEach((key) => {
    document.getElementById(key).checked = flags[key]
  })
}

async function save () {
  const result = {}
  ;[KEY_URL, KEY_URL_REV, KEY_TITLE, KEY_TITLE_REV, KEY_RAND, KEY_NOTIFICATION].forEach((key) => {
    result[key] = document.getElementById(key).checked
  })

  await storageArea.set(result)
  debug('Saved ' + JSON.stringify(result))
}

document.addEventListener('DOMContentLoaded', () => restore().catch(onError))
document.getElementById('form').addEventListener('submit', (e) => (async function () {
  e.preventDefault()
  await save()
})().catch(onError))
