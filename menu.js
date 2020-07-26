'use strict'

// 右クリックメニュー

{
    const {
        contextMenus,
        i18n,
        runtime,
        storage,
        tabs
    } = browser
    const {
        KEY_SORT,
        KEY_SORT_BY,
        KEY_CONTEXTS,
        KEY_MENU_ITEMS,
        KEY_NOTIFICATION,
        ALL_MENU_ITEMS,
        DEFAULT_CONTEXTS,
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
    async function addMenuItem(id, title, parentId) {
        const contexts = await getValue(KEY_CONTEXTS, DEFAULT_CONTEXTS)
        if (contexts.length <= 0) {
            return
        }
        contextMenus.create({
            id,
            title,
            contexts,
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
    async function changeMenu(menuItems) {
        // 一旦、全削除してから追加する
        await contextMenus.removeAll()
        debug('Clear menu items')

        switch (menuItems.length) {
            case 0: {
                break
            }
            case 1: {
                // 1 つだけのときはフラットメニュー
                const key = menuItems[0]
                await addMenuItem(key, i18n.getMessage(KEY_SORT_BY, i18n.getMessage(key)))
                break
            }
            default: {
                addMenuItem(KEY_SORT, i18n.getMessage(KEY_SORT))
                for (const key of menuItems) {
                    await addMenuItem(key, i18n.getMessage(key), KEY_SORT)
                }
            }
        }
    }

    // 初期化
    (async function () {
        // リアルタイムで設定を反映させる
        storage.onChanged.addListener((changes, area) => (async function () {
            const menuItems = changes[KEY_MENU_ITEMS]
            if (menuItems && menuItems.newValue) {
                await changeMenu(menuItems.newValue)
            }
        })().catch(onError))

        // 右クリックメニューから実行
        contextMenus.onClicked.addListener((info, tab) => (async function () {
            if (ALL_MENU_ITEMS.includes(info.menuItemId)) {
                tab = tab || (await tabs.query({active: true, currentWindow: true}))[0]
                const notification = await getValue(KEY_NOTIFICATION, DEFAULT_NOTIFICATION)
                await run(tab.windowId, info.menuItemId, tab.pinned, notification)
            }
        })().catch(onError))

        const menuItems = await getValue(KEY_MENU_ITEMS, DEFAULT_MENU_ITEMS)
        await changeMenu(menuItems)
    })().catch(onError)
}
