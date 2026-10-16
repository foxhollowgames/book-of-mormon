# Control comparison with Bible Wayfinder

Reference: read-only `main` checkout at `48f5a45`. No reference assets were fetched.
This lists each control family, including controls made from data.

| Area | Starting Book of Mormon control | Bible control or location | Final action |
| --- | --- | --- | --- |
| Top bar | Back to books link | Back arrow | Keep |
| Top bar | Menu button | Menu button | Keep |
| Menu | Read and Map | Study mode | Keep |
| Menu | Text only and Text + Sorenson | Historical and LDS perspective | Removed; Sorenson's notes always show |
| Menu | Lens help | Perspective and art help | Removed with the lens |
| Menu | Open study guides | Guided study actions exist in reader code; no top-bar button | Keep this unique feature in Menu |
| Menu | Open source library | Same menu action | Keep |
| Menu | No portrait switch | Use historical art | Omit; this app has no portraits |
| Map stage | Zoom in and out | Leaflet zoom controls at bottom right | Keep |
| Map stage | Recenter | Same conditional control | Keep |
| Map stage | No chapter slider | Chapter-order timeline for undated books | Add in Map mode |
| Map stage | Place dots and labels | Clickable places | Use shared feature binding and full-size labels |
| Map stage | Paths | Clickable path hit areas | Keep |
| Map stage | Terrain shapes | Clickable areas | Keep this app's terrain data |
| Map stage | Distance lines | No mile-estimate layer | Keep this unique feature |
| Map stage | Destruction rings | Clickable distress rings | Bind clicks; keep empty centers for place clicks |
| Map stage | Mile scale | Leaflet scale | Keep the relative-mile scale |
| Layers | Map layers collapse | Same collapse button | Keep |
| Layers | Places checkbox | Places checkbox | Keep |
| Layers | Rough guesses checkbox | Place uncertainty in notes; no guess toggle | Keep; unique uncertainty filtering needs a home |
| Layers | Terrain zones checkbox | Areas checkbox | Keep; terrain is this app's area layer |
| Layers | Paths checkbox | Paths checkbox | Keep |
| Layers | Sorenson's distances checkbox | No equivalent | Keep |
| Layers | Show the whole land button | No equivalent | Remove |
| Layers | No Map context disclosure | Map context disclosure | Add; move place and area lists here |
| Layers | No roads or nations | Only shows layers supported by book data | Do not add empty controls |
| Layers | No gray coverage key | Gray areas outside real-map coverage | Omit; the relative map has no real-world coverage mask |
| Sidebar | Previous and Next | Previous and Next within one book | Keep; stop at book boundaries |
| Sidebar | Chapter picker and numbered options | Same picker and options | Keep |
| Sidebar | Scripture resize separator | Same mouse and keyboard resize | Keep |
| Sidebar | Places named here chips | Entity details and map context | Move chips to layer Map context |
| Sidebar | Areas named list | Map context | Move to layer Map context |
| Sidebar | Paths in this chapter, open by default | Paths and facts, collapsed | Match label, classes, and collapsed state |
| Sidebar | Destruction place chips | Impact details on map | Remove duplicate summary chips; keep clickable rings and place links |
| Sidebar | Sorenson figure chips | Supporting sources and guides | Remove repeated chips; retain the Menu guide |
| Sidebar | Highlighted place names | Entity inline links | Keep click action; use reference inline-link class |
| Sidebar | Source link absent from introduction | Source footnote | Add compact source footnote |
| Context card | Close button | Close button | Keep |
| Context card | Drag handle and arrow-key movement | Shared modal-drag.js | Keep |
| Context card | Verse reference buttons | Exact scripture and references | Keep; show the reader when selected from Map mode |
| Context card | Route stop chips | Linked entities | Keep this route's named stops in shared control style |
| Context card | Figure buttons | Compact source links | Remove repeated buttons |
| Context card | Sorenson page link | Source citation | Keep |
| Context card | No compact source list | Sources section | Add using shared classes |
| Guides | Guide choice buttons | Guide choice buttons | Keep |
| Guides | Close, back to list, Previous, Next, Finish | Same guide navigation | Keep |
| Guides | Place chips, verse buttons, page links | Linked entities and source links | Keep useful links in shared styles |
| Dialogs | Source links and close controls | Source library and source details | Keep |
| Dialogs | Drag handles | Shared modal-drag.js | Keep |
| Directory | Menu, Read/Map, book links | Same menu and book cards | Keep |
| Directory | Map background zoom on hover | Cover artwork stays still | Remove background zoom; keep reference card hover |

`styles.css` keeps the complete reference rules before the necessary relative-map additions.
`bible.css` matches the reference file. The reference does not contain `directory.css`.
The app does not have people profiles, word studies, museum images, or historical dates.
It therefore does not add controls for those data types.
