'use strict'

// メッセージインターフェース

{
  const {
    runtime
  } = browser
  const {
    KEY_SORT,
    debug,
    onError
  } = common
  const {
    run
  } = sort

  function handler (message, sender, sendResponse) {
    (async function () {
      debug('Message ' + JSON.stringify(message) + ' was received')
      switch (message.type) {
        case KEY_SORT: {
          const {
            keyType,
            windowId,
            pinned,
            notification
          } = message
          await run(windowId, keyType, pinned, notification)
        }
      }
    })().catch(onError)
  }

  // 初期化
  (async function () {
    // メッセージから実行
    runtime.onMessageExternal.addListener(handler)
  })().catch(onError)
}
