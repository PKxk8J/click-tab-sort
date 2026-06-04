## Summary

Sort tabs from the right-click menu.

## Description

ClickTabSort adds tab sorting commands to Firefox right-click menus.
You can sort tabs from the tab context menu, or enable the same commands on page context menus from the settings page.

Available sort orders:

- URL
- Title
- Opened date / opened date reverse
- Accessed date / accessed date reverse
- Random
- Reverse order

You can choose which sort methods appear in the menu.
Each sort item can be enabled for the clicked hierarchy, or for each hierarchy.

Hierarchy types are top level, tab groups, and pinned tabs.
When you sort from a tab inside a group, the clicked hierarchy means that group only.
When you sort from a top-level tab, the clicked hierarchy means top-level tabs only.
When you sort each hierarchy, pinned tabs are also sorted as their own hierarchy.
When only one menu path is available, it is folded into a single command, such as "Sort Tabs: URL (A-Z): Top level".

Pinned tabs are sorted when the clicked hierarchy is pinned tabs, or when each hierarchy is sorted.
Tab groups are sorted as blocks at the top level, and tabs inside each group can be sorted separately.
Split view tabs keep their internal order and move as one block.
Containers are ignored when sorting.

An optional behavior setting can use tab group names as group titles when sorting groups at the top level.
Unnamed groups are sorted as an empty title when this setting is enabled.

Optional notifications can show progress and completion.
The notification permission is requested only when notifications are enabled in settings.

Opened dates are inferred from Firefox tab IDs and are reset when Firefox starts.
