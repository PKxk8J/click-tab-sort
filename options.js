'use strict'

const { i18n, storage } = browser
const storageArea = storage.sync

const KEY_DEBUG = 'debug'

const KEY_URL = 'url'
const KEY_TITLE = 'title'
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
  console.error('Error: ' + error)
}

// bool が undefined でなく false のときだけ false になるように
function falseIffFalse (bool) {
  if (typeof bool === 'undefined') {
    return true
  }
  return bool
}

[KEY_MENU_ITEM, KEY_URL, KEY_TITLE, KEY_NOTIFICATION, KEY_SAVE].forEach((key) => {
  document.getElementById('label_' + key).innerText = i18n.getMessage(key)
})

// 現在の設定を表示する
function restore () {
  const getting = storageArea.get()
  getting.then((result) => {
    const flags = {
      [KEY_URL]: falseIffFalse(result[KEY_URL]),
      [KEY_TITLE]: falseIffFalse(result[KEY_TITLE]),
      [KEY_NOTIFICATION]: result[KEY_NOTIFICATION]
    }
    Object.keys(flags).forEach((key) => {
      document.getElementById(key).checked = flags[key]
    })
  }, onError)
}

function save (e) {
  e.preventDefault()

  const result = {}
  ;[KEY_URL, KEY_TITLE, KEY_NOTIFICATION].forEach((key) => {
    result[key] = document.getElementById(key).checked
  })
  const setting = storageArea.set(result)
  setting.then(() => debug('Saved'), onError)
}

document.addEventListener('DOMContentLoaded', restore)
document.getElementById('form').addEventListener('submit', save)
