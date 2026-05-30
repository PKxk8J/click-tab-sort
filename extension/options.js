import {
  ALL_CONTEXTS,
  ALL_MENU_ITEMS,
  KEY_CONTEXTS,
  KEY_FEEDBACK,
  KEY_MENU_ITEMS,
  KEY_NAME,
  KEY_NOTIFICATION,
  KEY_SAVE_STATUS_FAILED,
  KEY_SAVE_STATUS_SAVED,
  KEY_SAVE_STATUS_SAVING,
  KEY_SETTINGS,
  NOTIFICATION_PERMISSION,
  debug,
  normalizeContexts,
  normalizeMenuItems,
  normalizeNotification,
  onError,
  storageArea,
} from './common.js'

const {
  i18n,
  permissions,
} = browser

const SAVE_STATUS_CLEAR_DELAY = 1800

let savePromise
let saveRequested = false
let saveStatusVersion = 0

function setLabelText (id, key) {
  document.getElementById(id).textContent = i18n.getMessage(key)
}

function setSaveStatus (key, state = '', transient = false) {
  const status = document.getElementById('saveStatus')
  const version = ++saveStatusVersion
  status.textContent = key ? i18n.getMessage(key) : ''
  status.dataset.state = state

  if (!transient) {
    return
  }

  setTimeout(() => {
    if (version === saveStatusVersion) {
      status.textContent = ''
      status.dataset.state = ''
    }
  }, SAVE_STATUS_CLEAR_DELAY)
}

async function restore () {
  const data = await storageArea.get()
  debug('Loaded ' + JSON.stringify(data))

  const contexts = normalizeContexts(data[KEY_CONTEXTS])
  const menuItems = normalizeMenuItems(data[KEY_MENU_ITEMS])
  const notification = normalizeNotification(data[KEY_NOTIFICATION])
  const notificationAllowed = notification &&
    await permissions.contains(NOTIFICATION_PERMISSION)

  const contextSet = new Set(contexts)
  ALL_CONTEXTS.forEach((key) => {
    document.getElementById(key).checked = contextSet.has(key)
  })

  const menuItemSet = new Set(menuItems)
  ALL_MENU_ITEMS.forEach((key) => {
    document.getElementById(key).checked = menuItemSet.has(key)
  })

  document.getElementById(KEY_NOTIFICATION).checked = notificationAllowed
}

async function applyNotificationPermission (notification) {
  if (notification) {
    return await permissions.request(NOTIFICATION_PERMISSION)
  }
  if (await permissions.contains(NOTIFICATION_PERMISSION)) {
    await permissions.remove(NOTIFICATION_PERMISSION)
  }
  return false
}

async function save () {
  const contexts = []
  ALL_CONTEXTS.forEach((key) => {
    if (document.getElementById(key).checked) {
      contexts.push(key)
    }
  })

  const menuItems = []
  ALL_MENU_ITEMS.forEach((key) => {
    if (document.getElementById(key).checked) {
      menuItems.push(key)
    }
  })

  const notificationInput = document.getElementById(KEY_NOTIFICATION)
  let notification = notificationInput.checked
  if (notification && !await permissions.contains(NOTIFICATION_PERMISSION)) {
    notification = false
    notificationInput.checked = false
  }

  const data = {
    [KEY_CONTEXTS]: contexts,
    [KEY_MENU_ITEMS]: menuItems,
    [KEY_NOTIFICATION]: notification,
  }
  await storageArea.set(data)
  debug('Saved ' + JSON.stringify(data))
}

function queueSave () {
  saveRequested = true
  setSaveStatus(KEY_SAVE_STATUS_SAVING, 'saving')

  if (!savePromise) {
    savePromise = runSaveQueue()
  }
}

async function runSaveQueue () {
  try {
    while (saveRequested) {
      saveRequested = false
      await save()
    }
    setSaveStatus(KEY_SAVE_STATUS_SAVED, 'saved', true)
  } catch (error) {
    setSaveStatus(KEY_SAVE_STATUS_FAILED, 'error')
    onError(error)
  } finally {
    savePromise = undefined
    if (saveRequested) {
      queueSave()
    }
  }
}

function createSwitch (inputId) {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.id = inputId
  input.className = 'switch-input'

  const control = document.createElement('span')
  control.className = 'switch-control'
  control.setAttribute('aria-hidden', 'true')

  const switchWrapper = document.createElement('span')
  switchWrapper.className = 'switch'
  switchWrapper.appendChild(input)
  switchWrapper.appendChild(control)

  return switchWrapper
}

function createToggleLabel (key) {
  const title = document.createElement('span')
  title.className = 'setting-title'
  title.textContent = i18n.getMessage(key)

  const copy = document.createElement('span')
  copy.className = 'setting-copy'
  copy.appendChild(title)

  const label = document.createElement('label')
  label.className = 'toggle-row'
  label.appendChild(copy)
  label.appendChild(createSwitch(key))

  return label
}

function addCheckboxEntry (key, container) {
  container.appendChild(createToggleLabel(key))
}

function bindAutoSave () {
  document.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      handleInputChange(input).catch((error) => {
        if (input.id === KEY_NOTIFICATION) {
          input.checked = false
        }
        onError(error)
        queueSave()
      })
    })
  })
}

async function handleInputChange (input) {
  if (input.id === KEY_NOTIFICATION) {
    input.checked = await applyNotificationPermission(input.checked)
  }
  queueSave()
}

async function init () {
  const contextContainer = document.getElementById(KEY_CONTEXTS)
  ALL_CONTEXTS.forEach((key) => addCheckboxEntry(key, contextContainer))

  const itemContainer = document.getElementById(KEY_MENU_ITEMS)
  ALL_MENU_ITEMS.forEach((key) => addCheckboxEntry(key, itemContainer))

  const notificationContainer = document.getElementById('notificationSetting')
  addCheckboxEntry(KEY_NOTIFICATION, notificationContainer)

  setLabelText('label_' + KEY_NAME, KEY_NAME)
  setLabelText('label_' + KEY_SETTINGS, KEY_SETTINGS)
  setLabelText('label_' + KEY_CONTEXTS, KEY_CONTEXTS)
  setLabelText('label_' + KEY_MENU_ITEMS, KEY_MENU_ITEMS)
  setLabelText('label_' + KEY_FEEDBACK, KEY_FEEDBACK)

  await restore()
  bindAutoSave()
}

init().catch(onError)
