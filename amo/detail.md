ClickTabSort adds tab sorting commands to Firefox right-click menus.
You can sort tabs from the tab context menu, or enable the same commands on page context menus from the settings page.

Available sort orders:

- URL
- Title
- Opened date / opened date reverse
- Accessed date / accessed date reverse
- Random
- Reverse order

You can choose which sort items appear in the menu.
When only one item is enabled, it is shown directly as a flat menu command.
When multiple items are enabled, they are grouped under the Sort Tabs submenu.

Each sort item can be configured for the clicked area, or for the top level and all groups.
When you sort from a tab inside a group, the clicked area means that group only.
When you sort from a top-level tab, the clicked area means top-level tabs only.

Pinned tabs are sorted only when the right-click menu is opened on a pinned tab.
Tab groups are sorted as blocks at the top level, and tabs inside each group can be sorted separately.
Split view tabs keep their internal order and move as one block.
Containers are ignored when sorting.

Optional notifications can show progress and completion.
The notification permission is requested only when notifications are enabled in settings.

Opened dates are inferred from Firefox tab IDs and are reset when Firefox starts.
