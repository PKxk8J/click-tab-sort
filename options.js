'use strict'

const { i18n, storage } = browser
const storageArea = storage.sync

const LABEL_TITLE = i18n.getMessage('title')
const LABEL_SAVE = i18n.getMessage('save')

document.getElementById('label_title').innerText = LABEL_TITLE
document.getElementById('label_save').innerText = LABEL_SAVE

function onError (error) {
  console.error('Error: ' + error)
}

function restore () {
  const getting = storageArea.get()
  getting.then((result) => {
    const urlOn = typeof result.url === 'undefined' || result.url
    const titleOn = typeof result.title === 'undefined' || result.title
    document.getElementById('url').checked = urlOn
    document.getElementById('title').checked = titleOn
  }, onError)
}

function save (e) {
  e.preventDefault()

  const urlOn = document.getElementById('url').checked
  const titleOn = document.getElementById('title').checked
  const setting = storageArea.set({
    url: urlOn,
    title: titleOn
  })
  setting.then(() => console.log('Saved'), onError)
}

document.addEventListener('DOMContentLoaded', restore)
document.getElementById('form').addEventListener('submit', save)
