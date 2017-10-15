'use strict'

// 右クリックメニュー

{
  const {
    contextMenus,
    i18n,
    runtime,
    storage
  } = browser
  const {
    KEY_SORT,
    KEY_SORT_BY,
    KEY_MENU_ITEM,
    KEY_NOTIFICATION,
    ALL_MENU_ITEMS,
    DEFAULT_MENU_ITEMS,
    DEFAULT_NOTIFICATION,
    debug,
    onError,
    getValue
  } = common
  const {
    run
  } = sort

  // 右クリックメニューに項目を追加する
  function addMenuItem (id, title, parentId) {
    contextMenus.create({
      id,
      title,
      contexts: ['tab'],
      parentId
    }, () => {
      if (runtime.lastError) {
        onError(runtime.lastError)
      } else {
        debug('Added ' + title + ' menu item')
      }
    })
  }

  // 右クリックメニューの変更
  async function changeMenu (menuItem) {
    // 一旦、全削除してから追加する
    await contextMenus.removeAll()
    debug('Clear menu items')

    switch (menuItem.length) {
      case 0: {
        break
      }
      case 1: {
        // 1 つだけのときはフラットメニュー
        const key = menuItem[0]
        addMenuItem(key, i18n.getMessage(KEY_SORT_BY, i18n.getMessage(key)))
        break
      }
      default: {
        addMenuItem(KEY_SORT, i18n.getMessage(KEY_SORT))
        menuItem.forEach((key) => addMenuItem(key, i18n.getMessage(key), KEY_SORT))
      }
    }
  }

  // 初期化
  (async function () {
    // リアルタイムで設定を反映させる
    storage.onChanged.addListener((changes, area) => (async function () {
      const menuItem = changes[KEY_MENU_ITEM]
      if (menuItem && menuItem.newValue) {
        await changeMenu(menuItem.newValue)
      }
    })().catch(onError))

    // 右クリックメニューから実行
    contextMenus.onClicked.addListener((info, tab) => (async function () {
      if (ALL_MENU_ITEMS.includes(info.menuItemId)) {
        const notification = await getValue(KEY_NOTIFICATION, DEFAULT_NOTIFICATION)
        await run(tab.windowId, info.menuItemId, tab.pinned, notification)
      }
    })().catch(onError))

    const menuItem = await getValue(KEY_MENU_ITEM, DEFAULT_MENU_ITEMS)
    await changeMenu(menuItem)
  })().catch(onError)
}
