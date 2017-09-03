# click-tab-sort

タブ右クリックからタブをソートする Firefox アドオン。

e10s 対応。

https://addons.mozilla.org/addon/clicktabsort/


## <span id="messaging"/> Messaging

Other addons can use this addon by using [sendMessage](https://developer.mozilla.org/Add-ons/WebExtensions/API/runtime/sendMessage)

```javascript
browser.runtime.sendMessage('{9a51d52f-40fa-44c6-9c62-66936e43c4db}', {
  type: 'sort',
  keyType: 'title',
  windowId: 24,
  notification: false
})
```


#### extensionId

`{9a51d52f-40fa-44c6-9c62-66936e43c4db}`


#### message

|Property name|Type|Description|
|:--|:--|:--|
|type|string|`sort`|
|keyType|string|`url` or `urlReverse` or `title` or `titleReverse` or `id` or `idReverse` or `random`|
|windowId|number|The ID of a target window|
|notification|boolean|Whether to show notification|
