'use strict'

const { i18n, storage } = browser
const storageArea = storage.sync

const LABEL_MENU_ITEM = i18n.getMessage('menuItem')
const LABEL_URL = i18n.getMessage('url')
const LABEL_TITLE = i18n.getMessage('title')
const LABEL_NOTIFICATION = i18n.getMessage('notification')
const LABEL_SAVE = i18n.getMessage('save')

document.getElementById('label_menu_item').innerText = LABEL_MENU_ITEM
document.getElementById('label_url').innerText = LABEL_URL
document.getElementById('label_title').innerText = LABEL_TITLE
document.getElementById('label_save').innerText = LABEL_SAVE
document.getElementById('label_notification').innerText = LABEL_NOTIFICATION

function onError (error) {
  console.error('Error: ' + error)
}

function restore () {
  const getting = storageArea.get()
  getting.then((result) => {
    const {
      url: urlOn = true,
      title: titleOn = true,
      notification: notificationOn = false
    } = result
    document.getElementById('url').checked = urlOn
    document.getElementById('title').checked = titleOn
    document.getElementById('notification').checked = notificationOn
  }, onError)
}

function save (e) {
  e.preventDefault()

  const urlOn = document.getElementById('url').checked
  const titleOn = document.getElementById('title').checked
  const notificationOn = document.getElementById('notification').checked
  const setting = storageArea.set({
    url: urlOn,
    title: titleOn,
    notification: notificationOn
  })
  setting.then(() => console.log('Saved'), onError)
}

document.addEventListener('DOMContentLoaded', restore)
document.getElementById('form').addEventListener('submit', save)
