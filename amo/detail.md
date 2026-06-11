# Summary

Easily sort too many tabs by URL, title, opened time, last access time, random order, or reverse order.
Tab groups and pinned tabs are supported.

# Description

ClickTabSort is a Firefox extension for sorting Firefox tabs from the right-click menu.
You can sort the tab list directly from the menu.
You can choose whether to sort only the clicked hierarchy, or to sort every hierarchy separately.

Choose from the following sort methods:

- URL
- Title
- Opened date
- Last accessed date
- Random
- Reverse current order

For each sort method, you can also choose the target scope:

- The clicked hierarchy
- Each hierarchy

Hierarchies are the top level, each tab group, and pinned tabs. They can be sorted separately.
When sorting the top level, tab groups are treated as single blocks, so tabs inside a group are not mixed with tabs outside the group.
Pinned tabs stay in the pinned area.
In every case, split view tabs keep their internal order and are treated as a single block.
Containers are ignored when sorting.

If only one sort method or target scope is available, the right-click menu is collapsed so you can run the action in fewer steps.

When a group or split view is treated as a single block, it is usually sorted by the information of its first tab.
In the settings, you can choose to use the group name as the group title when sorting at the top level.
When group names are used, unnamed groups are sorted as an empty title.

Opened dates are inferred from Firefox tab IDs and are reset when Firefox starts.

Optional notifications can show progress and completion.

## Privacy

ClickTabSort uses tab access to compare tab URLs, titles, tab groups, pinned state, and last access times.
It does not collect or send browsing data.
