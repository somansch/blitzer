/**
 * Blitzer.de dashboard card.
 *
 * One list answering "what is on my way right now", per configured area or
 * route. Controls and hazards together, nearest first, with an optional map
 * that can either mirror the list or drive it.
 *
 * Everything it needs is already in the frontend's own state: the reports are
 * geo_location entities, the area names and their search mode come from the
 * device registry, and the "last updated" moment from the entry's own total
 * sensor. The card therefore needs nothing added to the integration.
 */
(() => {
  const CARD_TAG = "blitzer-card";
  const EDITOR_TAG = `${CARD_TAG}-editor`;
  const DOMAIN = "blitzer";
  const SOURCE_PREFIX = `${DOMAIN}_`;
  // How close a click on a list entry takes the map: near enough to read the
  // street the report stands in, and never further out than it already is.
  const FOCUS_ZOOM = 16;
  // What to mark as new with when the area's own sensor does not say -
  // an entry set up before the windows existed, or one whose sensors have
  // not been created yet. The integration's own default, in minutes: an
  // unmarked card would read as broken, where an hour reads as a setting.
  const FALLBACK_WINDOW = 60;
  // What the map fades into at its edges: whatever the card is standing on.
  const FADE = "var(--ha-card-background, var(--card-background-color, #1c1c1c))";

  // ---------------------------------------------------------------- strings
  //
  // Kept here rather than pulled from the integration's own translations: a
  // card renders in the *reader's* language, while entity attributes are
  // stored once for everyone in the server's. Only the card's own chrome is
  // translated - `summary`, `type_name` and the rest arrive already worded by
  // the integration and are printed as they come.
  const STRINGS = {
    en: {
      title: "Blitzer.de",
      filterAll: "Everything",
      filterControls: "Controls only",
      filterHazards: "Hazards only",
      radius: "Radius",
      tracker: "Tracker",
      waypoints: "Route",
      updatedNever: "not updated yet",
      updatedNow: "updated just now",
      updatedMin: (n) => `updated ${n} min ago`,
      updatedHours: (n) => `updated ${n} h ago`,
      nothing: "Nothing reported right now",
      nothingInView: "Nothing reported in this part of the map",
      noAreas: "No Blitzer.de area configured yet.",
      confirmedAt: (v) => `Confirmed at ${v}`,
      confirmedOn: (v) => `Confirmed on ${v}`,
      reportedAt: (v) => `Reported at ${v}`,
      reportedOn: (v) => `Reported on ${v}`,
      closureSince: (v) => `Since ${v}`,
      closureUntil: (v) => `Until ${v}`,
      closureOpenEnd: "No end date",
      count: (n) => `${n} shown`,
      countOf: (n, total) => `${n} of ${total}`,
      countView: (n) => `${n} in view`,
      newLabel: "New",
      newCount: (n) => `${n} New`,
      // What the jams on this card add up to. Minutes up to an hour, hours
      // and minutes above it - "+95 min" is a number to work out, "+1 h 35
      // min" is one to read.
      // Nought is not "+0": the plus means "on top of your journey", and
      // nothing on top of it is what the minimal line says while the road
      // is clear. The badge never shows this - it is not drawn at nought.
      delaySum: (n) =>
        n <= 0 ? "0 min" : n < 60 ? `+${n} min` : n % 60 ? `+${Math.floor(n / 60)} h ${n % 60} min` : `+${Math.floor(n / 60)} h`,
      noNew: "Nothing new right now",
      noDelay: "Nothing is costing time right now",
      newReports: "new reports",
      popClose: "Close",
      foldOpen: (n) => `Show ${n} more`,
      foldClose: "Show fewer",
      edLayout: "Format",
      edLayoutHelp: "Portrait stacks the map over the list, landscape puts them side by side. Minimal is one line with what is new, and the reports behind it in a pop-up.",
      miniLabelTotal: "total",
      miniLabelNew: "new",
      miniLabelDelay: "delay",
      edMiniIconHelp: "Any MDI name, drawn in front of the number. Empty leaves the number on its own.",
      edMiniIconColorHelp: "Empty takes the colour of the number beside it.",
      edMiniIconSizeHelp: "How large the symbol is drawn, e.g. 22px. Empty keeps its usual size.",
      edFontColor: "Text color",
      edMiniBg: "Background color",
      edMiniBgHelp: "The fill behind this part of the minimal line. The new reports and the delay start on the colour they already wear; empty leaves the fill clear.",
      edMiniBgOpacity: "Opacity",
      edMiniBgOpacityHelp: "How much of that colour comes through, in percent. With no colour set there is nothing for it to act on.",
      edElMiniTotal: "Total number of reports",
      edElMiniTotalHelp: "The part of the minimal line counting everything the area reports.",
      edMiniTotalColorHelp: "Text color for the total.",
      edMiniTotalFontHelp: "Font size for the total.",
      edElMiniNew: "New reports",
      edElMiniNewHelp: "The part of the minimal line counting only what is still new.",
      edMiniNewColorHelp: "Text color for the number of new reports.",
      edMiniNewFontHelp: "Font size for the number of new reports.",
      edElMiniDelay: "What the jams cost",
      edElMiniDelayHelp: "The part of the minimal line adding up the delay of every report behind it.",
      edMiniDelayColorHelp: "Text color for what the jams cost.",
      edMiniDelayFontHelp: "Font size for what the jams cost.",
      edElPopNew: "New marker in the list",
      edElPopNewHelp: "The NEW tag on an entry of the list in the pop-up.",
      edPopNewColorHelp: "Text color for that NEW tag.",
      edPopNewFontHelp: "Font size for that NEW tag.",
      edPopNewBackground: "Show background",
      edPopNewBackgroundHelp: "Show a rounded background behind that NEW tag.",
      edPopNewBg: "Background color",
      edPopNewBgHelp: "Background color behind that NEW tag.",
      edMiniTap: "Tap action",
      edMiniTapHelp: "What a tap on either of the two numbers does. On \"Default\" it opens the pop-up on the reports that number counts, which is what the format is for.",
      edMiniTotal: "Show the total",
      edMiniTotalHelp: "The part of the minimal line counting how many reports the area has at all. Off leaves the line to the other parts.",
      layoutPortrait: "Portrait",
      layoutLandscape: "Landscape",
      layoutMinimal: "Minimal",
      newFilterOn: "Show only the new reports",
      newFilterOff: "Back to all reports",
      delayFilterOn: "Show only the reports costing time",
      delayFilterOff: "Back to all reports",
      // editor
      edPanelSettings: "Settings",
      edPanelSettingsDesc: "General, content and list",
      edPanelLayout: "Layout",
      edPanelLayoutDesc: "General, map and list",
      edGroupGeneral: "General",
      edGroupDisplay: "General",
      edGroupMap: "Map",
      edGroupList: "List",
      edTitle: "Card title",
      edTitleHelp: "Empty keeps the default heading.",
      edNothing: "Text when nothing is reported",
      edNothingHelp: "What the card says when the area has nothing to show. Empty keeps its own wording.",
      edShowDelay: "Show what the jams cost",
      edShowDelayHelp: "The red badge beside the NEW one, adding up the delay of every report on this card that carries one - and narrowing the card to those reports when it is clicked. In the minimal format it is the third part of the line instead, which opens the pop-up on those reports. Off, the delay stays in each report's own summary and nothing is added up.",
      edShowNew: "Show and mark new reports",
      edShowNewHelp: "Marks fresh reports as NEW, and draws the new part of the minimal line. How long something counts as new is set on the area in Home Assistant - one window for controls, one for hazards.",
      edSubIcon: "Icon",
      edSubIconHelp: "Any Material Design icon, drawn in front of the line. Empty draws none.",
      edSubIconColor: "Icon color",
      edSubIconColorHelp: "Empty takes the colour of the line itself.",
      edSubIconSize: "Icon size",
      edSubIconSizeHelp: "A font size, like the one above: the icon is drawn as tall as a capital letter of it. Empty follows the line itself.",
      edShowSub: "Show the subtitle line",
      edShowSubHelp: "The line under the title. Off drops it and everything it says.",
      edGroupContent: "Content",
      edGroupRows: "List",
      edCollapse: "Fold the rest away",
      edCollapseHelp: "Shows only the first few reports and puts the rest behind a chevron. A card given a fixed height then ends where the fold is instead of growing a scrollbar. Portrait format only.",
      edCollapseAfter: "Reports shown",
      edCollapseAfterHelp: "How many are on screen before the rest has to be unfolded.",
      edDivider: "Show the rule between entries",
      edDividerHelp: "The line drawn between one entry and the next.",
      edRowPicture: "Show the symbol",
      edRowPictureHelp: "Blitzer.de's own drawing at the start of an entry.",
      edRowLine1: "Distance and kind",
      edRowLine1Help: "The entry's first line.",
      edRowLine2: "Place",
      edRowLine2Help: "The street and town under it.",
      edRowExtra: "Description",
      edRowExtraHelp: "Blitzer.de's own free text, where it has one.",
      edRowReported: "Reported at",
      edRowConfirmed: "Confirmed at",
      edRowStars: "Stars",
      edElDivider: "Rule between entries",
      edElDividerHelp: "How the line between two entries is drawn.",
      edDividerColorHelp: "Colour of the rule.",
      edDividerWidth: "Width",
      edDividerWidthHelp: "Thickness of the line, e.g. \"1px\". Left empty it is 1px.",
      edDividerStyle: "Style",
      edDividerStyleHelp: "Solid, dashed or dotted.",
      lineStyleSolid: "Solid",
      lineStyleDashed: "Dashed",
      lineStyleDotted: "Dotted",
      edChipBackground: "Show background",
      edChipBackgroundHelp: "A filled background behind each chip.",
      edChipBg: "Background color",
      edChipBgHelp: "Background color behind the chips.",
      edStarsColorHelp: "Colour of the stars.",
      edRowDistance: "Distance",
      edRowDistanceHelp: "The distance at the start of the line.",
      edRowSpeed: "Speed limit",
      edRowSpeedHelp: "The km/h a control enforces, at the end of the line.",
      edElPicture: "Symbol",
      edElPictureHelp: "Blitzer.de's own drawing at the start of an entry.",
      edPictureSize: "Size",
      edPictureSizeHelp: "For example 34px. Empty keeps the card's own size.",
      edElLine1: "Distance and kind",
      edElLine1Help: "The entry's first line.",
      edLine1ColorHelp: "Text colour for the first line.",
      edLine1FontHelp: "Font size for the first line.",
      edElLine2: "Place",
      edElLine2Help: "The street and town under the first line.",
      edLine2ColorHelp: "Text colour for the place.",
      edLine2FontHelp: "Font size for the place.",
      edElExtra: "Description",
      edElExtraHelp: "Blitzer.de's own free text, where it has one.",
      edExtraColorHelp: "Text colour for the description.",
      edExtraFontHelp: "Font size for the description.",
      edElChip: "Chips",
      edElChipHelp: "The small framed labels under an entry.",
      edChipColorHelp: "Text colour for the chips.",
      edChipFontHelp: "Font size for the chips.",
      edElStars: "Stars",
      edElStarsHelp: "The confirmation count, as up to three stars.",
      edStarsSize: "Size",
      edStarsSizeHelp: "For example 14px. Empty keeps the size of the chips beside them.",
      edElAreaPicker: "Area dropdown",
      edElAreaPickerHelp: "How the dropdown that picks the area is drawn.",
      edAreaPickerColorHelp: "Text color for the area dropdown.",
      edAreaPickerFontHelp: "Font size for the area dropdown.",
      edAreaPickerBackground: "Show background",
      edAreaPickerBackgroundHelp: "The dropdown's own filled background.",
      edAreaPickerBg: "Background color",
      edAreaPickerBgHelp: "Background color of the area dropdown.",
      edElFilterPicker: "Filter dropdown",
      edElFilterPickerHelp: "How the dropdown that picks what is shown is drawn.",
      edFilterPickerColorHelp: "Text color for the filter dropdown.",
      edFilterPickerFontHelp: "Font size for the filter dropdown.",
      edFilterPickerBackground: "Show background",
      edFilterPickerBackgroundHelp: "The dropdown's own filled background.",
      edFilterPickerBg: "Background color",
      edFilterPickerBgHelp: "Background color of the filter dropdown.",
      edElCount: "Number of reports shown",
      edElCountHelp: "The badge next to the title saying how many reports are on screen.",
      edCountColorHelp: "Text color for the number.",
      edCountFontHelp: "Font size for the number.",
      edCountBackground: "Show background",
      edCountBackgroundHelp: "Show a rounded background behind the number.",
      edCountBg: "Background color",
      edCountBgHelp: "Background color behind the number.",
      edElRefresh: "Refresh button",
      edElRefreshHelp: "The button at the end of the subtitle line that fetches the area again.",
      edRefreshIconHelp: "Any Material Design icon. Empty draws none, which leaves the button nothing to press.",
      edRefreshColor: "Color",
      edRefreshColorHelp: "Empty takes the colour of the line it sits on.",
      edRefreshSize: "Size",
      edRefreshSizeHelp: "A font size: the symbol is drawn as tall as a capital letter of it. Empty follows the line itself.",
      edShowRefresh: "Show a refresh button",
      edShowRefreshHelp: "A button at the end of this line that fetches the area again straight away. Worth having above all where the area polls on demand only - an update interval of 0.",
      refreshNow: "Fetch this area again",
      edShowCount: "Show the number of reports",
      edShowCountHelp: "The badge next to the title, saying how many reports are on screen. The NEW badge beside it is untouched.",
      edElSub: "Subtitle line",
      edElSubHelp: "The line under the title, and which of its three parts it says.",
      edSubColorHelp: "Text color for the subtitle line.",
      edSubFontHelp: "Font size for the subtitle line.",
      edSubArea: "Name of the area",
      edSubAreaHelp: "The area, route or tracker the card is showing.",
      edSubMode: "How it searches",
      edSubModeHelp: "Whether the area is a radius or a route.",
      edSubUpdated: "Last update",
      edSubUpdatedHelp: "How long ago the integration last fetched.",
      edElNew: "New marker",
      edElNewHelp: "How the NEW badge and the NEW tag in the list are drawn.",
      edNewColorHelp: "Text color for the NEW marker.",
      edNewFontHelp: "Font size for the NEW marker.",
      edNewBackground: "Show background",
      edNewBackgroundHelp: "Show a rounded background behind the NEW marker.",
      edNewBg: "Background color",
      edNewBgHelp: "Background color behind the NEW marker.",
      edElDelay: "Delay badge",
      edElDelayHelp: "How the badge beside the NEW one is drawn - the one that adds up what the jams on this card cost, and narrows the card to them when clicked.",
      edDelayColorHelp: "Text color for the delay badge.",
      edDelayFontHelp: "Font size for the delay badge.",
      edDelayBackground: "Show background",
      edDelayBackgroundHelp: "Show a rounded background behind the delay badge.",
      edDelayBg: "Background color",
      edDelayBgHelp: "Background color behind the delay badge. Empty is the theme's own error color.",
      edHideTitle: "Hide",
      edHideTitleHelp: "Hide the card's own title, even when one is set above. The pop-up of the minimal format wears the same title, and loses it here too.",
      edElTitle: "Card title",
      edElTitleHelp: "How the card's own title is drawn.",
      edElCardBg: "Card background",
      edElCardBgHelp: "A colour and an image of your own behind the whole card - in the minimal format behind its pop-up, which is the side of it with room for one.",
      edCardBgEnable: "Show background",
      edCardBgEnableHelp: "Draws the colour and the image below. Off leaves the card the background the theme gives it.",
      edCardBgColor: "Color",
      edCardBgColorHelp: "Background color for the card.",
      edCardBgImage: "Image",
      edCardBgImageHelp: "Upload one, or paste a URL or a local path - one from Home Assistant's own media browser, say. JPEG, PNG, GIF and WebP. Keep it small: the card waits for it on every load.",
      edCardBgImagePlaceholder: "e.g. /local/my-image.jpg",
      edCardBgUpload: "Upload image",
      edCardBgClear: "Remove image",
      edCardBgSize: "Image behaviour",
      edCardBgSizeHelp: "How the image meets the edges of the card.",
      bgSizeCover: "Fill (cover)",
      bgSizeContain: "Fit (contain)",
      bgSizeAuto: "Actual size",
      bgSizeRepeat: "Repeat (tile)",
      edCardBgOpacity: "Opacity",
      edCardBgOpacityHelp: "How much of the colour and the image comes through, in percent. Below 100 the theme's own background shows through them.",
      edElNothing: "Text without reports",
      edElNothingHelp: "How the line is drawn that the card shows when it has nothing to report.",
      edColor: "Color",
      edTitleColorHelp: "Text color for the card's own title.",
      edNothingColorHelp: "Text color for the empty-area line.",
      edColorPlaceholder: "e.g. #ff5722 or var(--my-red)",
      edFont: "Font",
      edTitleFontHelp: "Font size for the card's own title.",
      edNothingFontHelp: "Font size for the empty-area line.",
      edFontPlaceholder: "e.g. 1.2em or 20px",
      edBold: "Bold",
      edItalic: "Italic",
      edUppercase: "Caps",
      edUnderline: "Underline",
      edLetterSpacing: "Letter spacing",
      edLetterSpacingHelp: "Space between the letters. Empty leaves the font's own spacing.",
      edLetterSpacingPlaceholder: "e.g. 0.05em or 1px",
      presetDefault: "Default",
      presetCustom: "Custom",
      presetPrimary: "Primary",
      presetAccent: "Accent",
      presetRed: "Red",
      presetPink: "Pink",
      presetPurple: "Purple",
      presetDeepPurple: "Deep purple",
      presetIndigo: "Indigo",
      presetBlue: "Blue",
      presetLightBlue: "Light blue",
      presetCyan: "Cyan",
      presetTeal: "Teal",
      presetGreen: "Green",
      presetLightGreen: "Light green",
      presetLime: "Lime",
      presetYellow: "Yellow",
      presetAmber: "Amber",
      presetOrange: "Orange",
      presetDeepOrange: "Deep orange",
      presetBrown: "Brown",
      presetGrey: "Grey",
      presetBlueGrey: "Blue grey",
      edAreas: "Areas and routes",
      edAreasHelp: "Leave empty to offer every configured area.",
      edFilterHelp: "Which half is selected when the card is first opened. Anyone can change it afterwards.",
      edGroupContentReports: "Reports",
      edGroupContentReportsHelp: "Which of the area's reports the card shows.",
      edMax: "Maximum number of reports",
      edMaxHelp: "Cuts the list down to the nearest few. Off shows every report the area has.",
      edOnlyNew: "Only new reports",
      edOnlyNewHelp: "Shows only what is still marked as new. The badge in the head switches it too.",
      edReference: "Measure distance from",
      edReferenceHelp: "The point every distance is measured from. On a route - waypoints or start/destination - every distance is the way along the route from its start, whatever is picked here.",
      refModeArea: "Centre of the area",
      refModeMap: "Centre of the map view",
      refModeEntity: "A person, a tracker or a zone",
      edAreaPicker: "Offer the area dropdown",
      edAreaPickerHelp: "Switch off to pin the card to one area.",
      edFilterPicker: "Offer the filter dropdown",
      edFilterPickerHelp: "Switch off to pin the card to the filter chosen below.",
      edSort: "Sort order",
      edSortHelp: "The order the reports stand in - in the list, and in the pop-up of the minimal format. It decides which of them survive when the number is capped, too.",
      sortDistance: "Nearest first",
      sortNewest: "Newest first",
      sortOldest: "Oldest first",
      edCenterOnClick: "Click centres the map",
      edCenterOnClickHelp: "Clicking a list entry moves the map onto that report and zooms in. Off, the click opens the report's details instead.",
      edMapHighlight: "Map click highlights the entry",
      edMapHighlightHelp: "Clicking a report on the map backs its entry in the list. Clicking the bare map lets it go again.",
      edElHighlight: "Highlight",
      edElHighlightHelp: "How the entry is backed whose report was clicked on the map.",
      edHighlightBg: "Background color",
      edHighlightBgHelp: "Background color of the highlighted entry.",
      edShowList: "Show the list",
      edShowListHelp: "The list of reports under the card's head - in the minimal format, the list in its pop-up. Off leaves only the head and, if it is on, the map.",
      edListOff: "The list is switched off. Turn it on under Settings, General to set it up.",
      edMapOff: "The map is switched off. Turn it on under Settings, General to set it up.",
      edGroupContentFilter: "Filter",
      edShowMap: "Show a map",
      edShowMapHelp: "Home Assistant's own map card, above the list - in the minimal format, the map beside the list in its pop-up.",
      edAspect: "Map aspect ratio",
      edAspectHelp: "How tall the map is drawn against its width. Landscape has none: the map fills its half of the card.",
      aspectPanorama: "21:9 (panorama)",
      aspectWide: "16:9 (widescreen)",
      aspect32: "3:2",
      aspect43: "4:3",
      aspectSquare: "1:1 (square)",
      aspectTall: "3:4 (tall)",
      edMarkerBorder: "Ring around the symbols",
      edMarkerBorderHelp: "Home Assistant's own coloured ring around each marker. Off leaves the bare symbol.",
      edMapFade: "Soft edges",
      edMapFadeHelp: "Fades the map into the card on all four sides instead of cutting it off. Its buttons move inward to stay clear of the fade.",
      edMapCluster: "Group nearby reports",
      edMapClusterHelp: "Gathers reports that lie close together into one disc with the count on it when zoomed out; zooming in splits them again. Off draws every report on its own, however many overlap. Needs Home Assistant 2026.10 or newer - older versions always group, and the switch is greyed out on them.",
      edClusterStyle: "Shape of a group",
      edClusterStyleHelp: "How grouped reports are drawn from Home Assistant 2026.10 on: the map's own bubble with the first few symbols and a \"+N\", or the disc with the count on it that every version before drew. A click on either zooms in to the reports. Older versions draw the disc regardless, so the choice is greyed out on them.",
      clusterStyleBubble: "Bubble with symbols (Home Assistant's)",
      clusterStyleDisc: "Disc with the count (as before 2026.10)",
      edMarkerBackground: "Background behind the symbols",
      edMarkerBackgroundHelp: "The filled disc each marker sits on. Off lets the map show through.",
      edFollowMap: "List follows the map",
      edFollowMapHelp: "The map then shows the whole area and the list shows what is inside the visible part of it - for following a route. Switched off, the map mirrors the list instead. In the minimal format this is the pop-up's map and the list beside it.",
      edMapRoute: "Show the route on the map",
      edMapRouteHelp: "For a route entry - waypoints or start/destination - the route itself, drawn under the reports and fitted into view when the card first draws it. Its color and width are under Layout -> Map.",
      edMapAlways: "Keep the map when nothing is reported",
      edMapAlwaysHelp: "Shows the map even while the area has nothing to report, fitted to the area as it is set up - the circle around its centre, or around the tracker, drawn as a dashed line - or to the route. Off takes the map down until something is reported again. Worth keeping on with the traffic flow, which has something to show on an empty map.",
      trafficLine: "Traffic flow",
      trafficOff: "off",
      trafficSwitch: "Show the traffic flow on the map",
      trafficRefresh: "Fetch the traffic flow again",
      edMapTraffic: "Show the traffic flow",
      edMapTrafficHelp: "Colours the roads by how traffic is moving on them, from green to dark red, with the colours and speed steps of Blitzer.de's own map. Not polled: fetched for the view this map shows while the card is on screen - one request per view, one more after a pan or a zoom, a fresh one every three minutes while it stays visible, none while nobody looks. On a route entry only the route itself, in its direction of travel. The card then carries a line under its subtitle with a switch to show or hide the flow for the moment, the time of the last fetch and a refresh button. Counted on the area's request counter. Needs Home Assistant 2026.10 or newer; the switch is greyed out on older versions.",
      edMapClosures: "Draw closures along the road",
      edMapClosuresHelp: "An official road closure comes with the stretch of road it closes; drawn as a red band along it, the way Blitzer.de's own map draws them, under its symbol.",
      edRowClosure: "Closure period",
      edElRoute: "Route",
      edElRouteHelp: "The line a route entry's route is drawn with. Only drawn while \"Show the route on the map\" is on under Settings -> General.",
      edRouteColor: "Line color",
      edRouteColorHelp: "The color of the route line and its end markers. Empty follows the theme's primary color.",
      edRouteWidth: "Line width",
      edRouteWidthHelp: "How thick the route line is drawn, in pixels. 4 by default.",
      edElTraffic: "Traffic flow",
      edElTrafficHelp: "The lines the traffic flow is drawn with. Only drawn while \"Show the traffic flow\" is on under Settings -> General.",
      edTrafficWidth: "Line width",
      edTrafficWidthHelp: "How thick a road's flow is drawn at the usual zoom, in pixels, decimals allowed; a motorway gets one more, and zooming in to street level widens them. 1.5 by default.",
      edTrafficOpacity: "Opacity",
      edTrafficOpacityHelp: "How solid the colours are drawn, in percent. 50 by default; less lets the map show through.",
      edElCluster: "Grouped reports",
      edElClusterHelp: "What the map gathers nearby reports into when zoomed out: up to Home Assistant 2026.9 a disc with the count on it, from 2026.10 a bubble with the first few symbols and a \"+N\" for the rest. Zooming in splits them into the single reports again.",
      edClusterColor: "Group color",
      edClusterColorHelp: "The color behind the grouped reports - the disc and its ring, or the bubble and its tail. Empty follows the theme.",
      edClusterTextColor: "Number color",
      edClusterTextColorHelp: "The color of the count - on the disc, or the \"+N\" in the bubble. Empty follows the theme's text color for it.",
      edClusterFont: "Size and style of the number",
      edClusterFontHelp: "The count's font size - 14px, 1.2em - and whether it is bold, italic or underlined. Empty keeps the map's own size.",
    },
    de: {
      title: "Blitzer.de",
      filterAll: "Alles",
      filterControls: "Nur Kontrollen",
      filterHazards: "Nur Gefahren",
      radius: "Radius",
      tracker: "Tracker",
      waypoints: "Route",
      updatedNever: "noch nicht aktualisiert",
      updatedNow: "gerade aktualisiert",
      updatedMin: (n) => `vor ${n} Min. aktualisiert`,
      updatedHours: (n) => `vor ${n} Std. aktualisiert`,
      nothing: "Aktuell nichts gemeldet",
      nothingInView: "In diesem Kartenausschnitt ist nichts gemeldet",
      noAreas: "Noch kein Blitzer.de-Bereich eingerichtet.",
      confirmedAt: (v) => `Bestätigt um ${v}`,
      confirmedOn: (v) => `Bestätigt am ${v}`,
      reportedAt: (v) => `Gemeldet um ${v}`,
      reportedOn: (v) => `Gemeldet am ${v}`,
      closureSince: (v) => `Seit ${v}`,
      closureUntil: (v) => `Bis ${v}`,
      closureOpenEnd: "Ohne Enddatum",
      count: (n) => `${n} angezeigt`,
      countOf: (n, total) => `${n} von ${total}`,
      countView: (n) => `${n} im Ausschnitt`,
      newLabel: "Neu",
      newCount: (n) => `${n} Neu`,
      delaySum: (n) =>
        n <= 0 ? "0 Min" : n < 60 ? `+${n} Min` : n % 60 ? `+${Math.floor(n / 60)} Std ${n % 60} Min` : `+${Math.floor(n / 60)} Std`,
      noNew: "Aktuell nichts Neues",
      noDelay: "Aktuell kostet nichts Zeit",
      newReports: "neue Meldungen",
      popClose: "Schließen",
      foldOpen: (n) => `${n} weitere anzeigen`,
      foldClose: "Weniger anzeigen",
      edLayout: "Format",
      edLayoutHelp: "Hochformat stellt die Karte über die Liste, Querformat nebeneinander. Minimalformat ist eine Zeile mit dem, was neu ist, und den Meldungen dahinter in einem Pop-up.",
      miniLabelTotal: "gesamt",
      miniLabelNew: "neu",
      miniLabelDelay: "Stau",
      edMiniIconHelp: "Ein beliebiger MDI-Name, gezeichnet vor der Zahl. Leer steht die Zahl für sich.",
      edMiniIconColorHelp: "Leer übernimmt die Farbe der Zahl daneben.",
      edMiniIconSizeHelp: "Wie groß das Symbol gezeichnet wird, z. B. 22px. Leer bleibt es bei seiner üblichen Größe.",
      edFontColor: "Schriftfarbe",
      edMiniBg: "Hintergrundfarbe",
      edMiniBgHelp: "Die Fläche hinter diesem Teil der Minimalzeile. Bei den neuen Meldungen und beim Stau steht hier die Farbe, die sie ohnehin tragen; leer bleibt die Fläche durchsichtig.",
      edMiniBgOpacity: "Deckkraft",
      edMiniBgOpacityHelp: "Wie viel von dieser Farbe durchkommt, in Prozent. Ohne gesetzte Farbe hat sie nichts, worauf sie wirken könnte.",
      edElMiniTotal: "Gesamtanzahl Meldungen",
      edElMiniTotalHelp: "Der Teil der Minimalzeile, der alles zählt, was der Bereich meldet.",
      edMiniTotalColorHelp: "Textfarbe für die Gesamtanzahl.",
      edMiniTotalFontHelp: "Schriftgröße für die Gesamtanzahl.",
      edElMiniNew: "Neue Meldungen",
      edElMiniNewHelp: "Der Teil der Minimalzeile, der nur zählt, was noch neu ist.",
      edMiniNewColorHelp: "Textfarbe für die Anzahl der neuen Meldungen.",
      edMiniNewFontHelp: "Schriftgröße für die Anzahl der neuen Meldungen.",
      edElMiniDelay: "Was die Staus kosten",
      edElMiniDelayHelp: "Der Teil der Minimalzeile, der die Verzögerung aller Meldungen dahinter zusammenzählt.",
      edMiniDelayColorHelp: "Textfarbe für das, was die Staus kosten.",
      edMiniDelayFontHelp: "Schriftgröße für das, was die Staus kosten.",
      edElPopNew: "Neu-Markierung in der Liste",
      edElPopNewHelp: "Das NEU-Zeichen an einem Eintrag der Liste im Pop-up.",
      edPopNewColorHelp: "Textfarbe für dieses NEU-Zeichen.",
      edPopNewFontHelp: "Schriftgröße für dieses NEU-Zeichen.",
      edPopNewBackground: "Hintergrund anzeigen",
      edPopNewBackgroundHelp: "Zeigt einen abgerundeten Hintergrund hinter diesem NEU-Zeichen an.",
      edPopNewBg: "Hintergrundfarbe",
      edPopNewBgHelp: "Hintergrundfarbe hinter diesem NEU-Zeichen.",
      edMiniTap: "Klick-Aktion",
      edMiniTapHelp: "Was ein Klick auf eine der beiden Zahlen tut. Bei \"Standard\" öffnet er das Pop-up mit den Meldungen, die diese Zahl zählt - wofür das Format gedacht ist.",
      edMiniTotal: "Gesamtanzahl anzeigen",
      edMiniTotalHelp: "Der Teil der Minimalzeile, der zählt, wie viele Meldungen der Bereich überhaupt hat. Aus überlässt die Zeile den anderen Teilen.",
      layoutPortrait: "Hochformat",
      layoutLandscape: "Querformat",
      layoutMinimal: "Minimalformat",
      newFilterOn: "Nur die neuen Meldungen anzeigen",
      newFilterOff: "Zurück zu allen Meldungen",
      delayFilterOn: "Nur die Meldungen anzeigen, die Zeit kosten",
      delayFilterOff: "Zurück zu allen Meldungen",
      // editor
      edPanelSettings: "Einstellungen",
      edPanelSettingsDesc: "Allgemein, Inhalt und Liste",
      edPanelLayout: "Layout",
      edPanelLayoutDesc: "Allgemein, Karte und Liste",
      edGroupGeneral: "Allgemein",
      edGroupDisplay: "Allgemein",
      edGroupMap: "Karte",
      edGroupList: "Liste",
      edTitle: "Kartentitel",
      edTitleHelp: "Leer behält die Standardüberschrift.",
      edNothing: "Text ohne Meldungen",
      edNothingHelp: "Was die Karte sagt, wenn der Bereich nichts zu zeigen hat. Leer behält ihren eigenen Wortlaut.",
      edShowDelay: "Zeigen, was die Staus kosten",
      edShowDelayHelp: "Das rote Abzeichen neben dem NEU-Abzeichen, das die Verzögerung aller Meldungen dieser Karte zusammenzählt - und die Karte beim Klick darauf auf diese Meldungen filtert. Im Minimalformat ist es stattdessen der dritte Teil der Zeile, der das Fenster auf diese Meldungen öffnet. Aus bleibt die Verzögerung in der Zusammenfassung jeder einzelnen Meldung, und nichts wird zusammengezählt.",
      edShowNew: "Neue Meldungen anzeigen und markieren",
      edShowNewHelp: "Markiert frische Meldungen als NEU und zeichnet den Neu-Teil der Minimalzeile. Wie lange etwas als neu gilt, steht am Bereich in Home Assistant - je ein Zeitraum für Kontrollen und für Gefahren.",
      edSubIcon: "Symbol",
      edSubIconHelp: "Ein beliebiges Material-Design-Symbol, gezeichnet vor der Zeile. Leer zeichnet keines.",
      edSubIconColor: "Symbolfarbe",
      edSubIconColorHelp: "Leer übernimmt die Farbe der Zeile selbst.",
      edSubIconSize: "Symbolgröße",
      edSubIconSizeHelp: "Eine Schriftgröße wie oben: das Symbol wird so hoch wie ein Großbuchstabe davon. Leer folgt der Zeile selbst.",
      edShowSub: "Unterzeile anzeigen",
      edShowSubHelp: "Die Zeile unter dem Titel. Aus entfällt sie mitsamt allem, was sie nennt.",
      edGroupContent: "Inhalt",
      edGroupRows: "Liste",
      edCollapse: "Rest einklappen",
      edCollapseHelp: "Zeigt nur die ersten Meldungen und legt den Rest hinter einen Pfeil. Eine Karte mit fester Höhe endet dann an der Faltung, statt einen Scrollbalken zu bekommen. Nur im Hochformat.",
      edCollapseAfter: "Sichtbare Meldungen",
      edCollapseAfterHelp: "Wie viele zu sehen sind, bevor der Rest aufgeklappt werden muss.",
      edDivider: "Trennlinie anzeigen",
      edDividerHelp: "Die Linie zwischen einem Eintrag und dem nächsten.",
      edRowPicture: "Symbol anzeigen",
      edRowPictureHelp: "Die eigene Zeichnung von Blitzer.de am Anfang eines Eintrags.",
      edRowLine1: "Entfernung und Art",
      edRowLine1Help: "Die erste Zeile des Eintrags.",
      edRowLine2: "Ort",
      edRowLine2Help: "Straße und Ort darunter.",
      edRowExtra: "Beschreibung",
      edRowExtraHelp: "Der freie Text von Blitzer.de, wo es einen gibt.",
      edRowReported: "Gemeldet",
      edRowConfirmed: "Bestätigt",
      edRowStars: "Sterne",
      edElDivider: "Trennlinie",
      edElDividerHelp: "Wie die Linie zwischen zwei Einträgen gezeichnet wird.",
      edDividerColorHelp: "Farbe der Trennlinie.",
      edDividerWidth: "Breite",
      edDividerWidthHelp: "Dicke der Linie, z. B. „1px“. Leer gelassen sind es 1px.",
      edDividerStyle: "Stil",
      edDividerStyleHelp: "Durchgängig, gestrichelt oder gepunktet.",
      lineStyleSolid: "Durchgängig",
      lineStyleDashed: "Gestrichelt",
      lineStyleDotted: "Gepunktet",
      edChipBackground: "Hintergrund anzeigen",
      edChipBackgroundHelp: "Ein gefüllter Hintergrund hinter jedem Chip.",
      edChipBg: "Hintergrundfarbe",
      edChipBgHelp: "Hintergrundfarbe hinter den Chips.",
      edStarsColorHelp: "Farbe der Sterne.",
      edRowDistance: "Entfernung",
      edRowDistanceHelp: "Die Entfernung am Anfang der Zeile.",
      edRowSpeed: "Geschwindigkeit",
      edRowSpeedHelp: "Das Tempolimit, das eine Kontrolle überwacht, am Ende der Zeile.",
      edElPicture: "Symbol",
      edElPictureHelp: "Die eigene Zeichnung von Blitzer.de am Anfang eines Eintrags.",
      edPictureSize: "Größe",
      edPictureSizeHelp: "Zum Beispiel 34px. Leer behält die Größe der Karte.",
      edElLine1: "Entfernung und Art",
      edElLine1Help: "Die erste Zeile des Eintrags.",
      edLine1ColorHelp: "Textfarbe für die erste Zeile.",
      edLine1FontHelp: "Schriftgröße für die erste Zeile.",
      edElLine2: "Ort",
      edElLine2Help: "Straße und Ort unter der ersten Zeile.",
      edLine2ColorHelp: "Textfarbe für den Ort.",
      edLine2FontHelp: "Schriftgröße für den Ort.",
      edElExtra: "Beschreibung",
      edElExtraHelp: "Der freie Text von Blitzer.de, wo es einen gibt.",
      edExtraColorHelp: "Textfarbe für die Beschreibung.",
      edExtraFontHelp: "Schriftgröße für die Beschreibung.",
      edElChip: "Chips",
      edElChipHelp: "Die kleinen umrandeten Etiketten unter einem Eintrag.",
      edChipColorHelp: "Textfarbe für die Chips.",
      edChipFontHelp: "Schriftgröße für die Chips.",
      edElStars: "Sterne",
      edElStarsHelp: "Die Zahl der Bestätigungen, als bis zu drei Sterne.",
      edStarsSize: "Größe",
      edStarsSizeHelp: "Zum Beispiel 14px. Leer behält die Größe der Chips daneben.",
      edElAreaPicker: "Bereichsauswahl",
      edElAreaPickerHelp: "Wie die Auswahlliste für den Bereich gezeichnet wird.",
      edAreaPickerColorHelp: "Textfarbe für die Bereichsauswahl.",
      edAreaPickerFontHelp: "Schriftgröße für die Bereichsauswahl.",
      edAreaPickerBackground: "Hintergrund anzeigen",
      edAreaPickerBackgroundHelp: "Der eigene gefüllte Hintergrund der Auswahlliste.",
      edAreaPickerBg: "Hintergrundfarbe",
      edAreaPickerBgHelp: "Hintergrundfarbe der Bereichsauswahl.",
      edElFilterPicker: "Filterauswahl",
      edElFilterPickerHelp: "Wie die Auswahlliste für das Gezeigte gezeichnet wird.",
      edFilterPickerColorHelp: "Textfarbe für die Filterauswahl.",
      edFilterPickerFontHelp: "Schriftgröße für die Filterauswahl.",
      edFilterPickerBackground: "Hintergrund anzeigen",
      edFilterPickerBackgroundHelp: "Der eigene gefüllte Hintergrund der Auswahlliste.",
      edFilterPickerBg: "Hintergrundfarbe",
      edFilterPickerBgHelp: "Hintergrundfarbe der Filterauswahl.",
      edElCount: "Anzahl angezeigter Meldungen",
      edElCountHelp: "Das Abzeichen neben dem Titel, das nennt, wie viele Meldungen gerade zu sehen sind.",
      edCountColorHelp: "Textfarbe für die Anzahl.",
      edCountFontHelp: "Schriftgröße für die Anzahl.",
      edCountBackground: "Hintergrund anzeigen",
      edCountBackgroundHelp: "Zeigt einen abgerundeten Hintergrund hinter der Anzahl an.",
      edCountBg: "Hintergrundfarbe",
      edCountBgHelp: "Hintergrundfarbe hinter der Anzahl.",
      edElRefresh: "Aktualisieren-Knopf",
      edElRefreshHelp: "Der Knopf am Ende der Unterzeile, der den Bereich neu abruft.",
      edRefreshIconHelp: "Ein beliebiges Material-Design-Symbol. Leer zeichnet keines, dann hat der Knopf nichts zum Drücken.",
      edRefreshColor: "Farbe",
      edRefreshColorHelp: "Leer übernimmt die Farbe der Zeile, in der er steht.",
      edRefreshSize: "Größe",
      edRefreshSizeHelp: "Eine Schriftgröße: das Symbol wird so hoch wie ein Großbuchstabe davon. Leer folgt der Zeile selbst.",
      edShowRefresh: "Aktualisieren-Knopf anzeigen",
      edShowRefreshHelp: "Ein Knopf am Ende dieser Zeile, der den Bereich sofort neu abruft. Vor allem dort nützlich, wo der Bereich nur auf Zuruf abfragt - Aktualisierungsintervall 0.",
      refreshNow: "Diesen Bereich neu abrufen",
      edShowCount: "Anzahl der Meldungen anzeigen",
      edShowCountHelp: "Das Abzeichen neben dem Titel, das nennt, wie viele Meldungen gerade zu sehen sind. Das NEU-Abzeichen daneben bleibt davon unberührt.",
      edElSub: "Unterzeile",
      edElSubHelp: "Die Zeile unter dem Titel und welche ihrer drei Angaben sie nennt.",
      edSubColorHelp: "Textfarbe für die Unterzeile.",
      edSubFontHelp: "Schriftgröße für die Unterzeile.",
      edSubArea: "Name des Bereichs",
      edSubAreaHelp: "Der Bereich, die Route oder der Tracker, den die Karte zeigt.",
      edSubMode: "Art der Suche",
      edSubModeHelp: "Ob der Bereich ein Radius oder eine Route ist.",
      edSubUpdated: "Letzte Aktualisierung",
      edSubUpdatedHelp: "Wie lange die letzte Abfrage der Integration her ist.",
      edElNew: "Neu-Markierung",
      edElNewHelp: "Wie das NEU-Abzeichen und das NEU-Zeichen in der Liste gezeichnet werden.",
      edNewColorHelp: "Textfarbe für die Neu-Markierung.",
      edNewFontHelp: "Schriftgröße für die Neu-Markierung.",
      edNewBackground: "Hintergrund anzeigen",
      edNewBackgroundHelp: "Zeigt einen abgerundeten Hintergrund hinter der Neu-Markierung an.",
      edNewBg: "Hintergrundfarbe",
      edNewBgHelp: "Hintergrundfarbe hinter der Neu-Markierung.",
      edElDelay: "Verzögerungs-Abzeichen",
      edElDelayHelp: "Wie das Abzeichen neben dem NEU-Abzeichen gezeichnet wird - das, welches zusammenzählt, was die Staus dieser Karte kosten, und die Karte beim Klick darauf filtert.",
      edDelayColorHelp: "Textfarbe für das Verzögerungs-Abzeichen.",
      edDelayFontHelp: "Schriftgröße für das Verzögerungs-Abzeichen.",
      edDelayBackground: "Hintergrund anzeigen",
      edDelayBackgroundHelp: "Zeigt einen abgerundeten Hintergrund hinter dem Verzögerungs-Abzeichen an.",
      edDelayBg: "Hintergrundfarbe",
      edDelayBgHelp: "Hintergrundfarbe hinter dem Verzögerungs-Abzeichen. Leer ist die Fehlerfarbe des Themes.",
      edHideTitle: "Ausblenden",
      edHideTitleHelp: "Eigenen Kartentitel ausblenden, auch wenn oben einer gesetzt ist. Das Pop-up des Minimalformats trägt denselben Titel und verliert ihn hier mit.",
      edElTitle: "Kartentitel",
      edElTitleHelp: "Wie der eigene Titel der Karte gezeichnet wird.",
      edElCardBg: "Kartenhintergrund",
      edElCardBgHelp: "Eine eigene Farbe und ein eigenes Bild hinter der ganzen Karte - im Minimalformat hinter dessen Pop-up, der Seite mit Platz dafür.",
      edCardBgEnable: "Hintergrund anzeigen",
      edCardBgEnableHelp: "Zeichnet die Farbe und das Bild von unten. Aus behält die Karte den Hintergrund, den ihr das Theme gibt.",
      edCardBgColor: "Farbe",
      edCardBgColorHelp: "Hintergrundfarbe der Karte.",
      edCardBgImageHelp: "Eines hochladen oder eine URL bzw. einen lokalen Pfad einfügen - etwa aus Home Assistants eigenem Medienbrowser. JPEG, PNG, GIF und WebP. Klein halten: die Karte wartet bei jedem Laden darauf.",
      edCardBgImage: "Bild",
      edCardBgImagePlaceholder: "z. B. /local/mein-bild.jpg",
      edCardBgUpload: "Bild hochladen",
      edCardBgClear: "Bild entfernen",
      edCardBgSize: "Bildverhalten",
      edCardBgSizeHelp: "Wie das Bild an die Ränder der Karte stößt.",
      bgSizeCover: "Ausfüllen",
      bgSizeContain: "Einpassen",
      bgSizeAuto: "Originalgröße",
      bgSizeRepeat: "Kacheln",
      edCardBgOpacity: "Deckkraft",
      edCardBgOpacityHelp: "Wie viel von Farbe und Bild durchkommt, in Prozent. Unter 100 scheint der Hintergrund des Themes hindurch.",
      edElNothing: "Text ohne Meldungen",
      edElNothingHelp: "Wie die Zeile gezeichnet wird, die die Karte zeigt, wenn sie nichts zu melden hat.",
      edColor: "Farbe",
      edTitleColorHelp: "Textfarbe für den Kartentitel.",
      edNothingColorHelp: "Textfarbe für die Zeile ohne Meldungen.",
      edColorPlaceholder: "z. B. #ff5722 oder var(--my-red)",
      edFont: "Schrift",
      edTitleFontHelp: "Schriftgröße für den Kartentitel.",
      edNothingFontHelp: "Schriftgröße für die Zeile ohne Meldungen.",
      edFontPlaceholder: "z. B. 1.2em oder 20px",
      edBold: "Fett",
      edItalic: "Kursiv",
      edUppercase: "Groß",
      edUnderline: "Unterstrichen",
      edLetterSpacing: "Zeichenabstand",
      edLetterSpacingHelp: "Abstand zwischen den Buchstaben. Leer lässt den Abstand der Schrift.",
      edLetterSpacingPlaceholder: "z. B. 0.05em oder 1px",
      presetDefault: "Standard",
      presetCustom: "Benutzerdef.",
      presetPrimary: "Primär",
      presetAccent: "Akzent",
      presetRed: "Rot",
      presetPink: "Rosa",
      presetPurple: "Violett",
      presetDeepPurple: "Dunkelviolett",
      presetIndigo: "Indigo",
      presetBlue: "Blau",
      presetLightBlue: "Hellblau",
      presetCyan: "Cyan",
      presetTeal: "Türkis",
      presetGreen: "Grün",
      presetLightGreen: "Hellgrün",
      presetLime: "Limette",
      presetYellow: "Gelb",
      presetAmber: "Bernstein",
      presetOrange: "Orange",
      presetDeepOrange: "Dunkelorange",
      presetBrown: "Braun",
      presetGrey: "Grau",
      presetBlueGrey: "Blaugrau",
      edAreas: "Bereiche und Routen",
      edAreasHelp: "Leer lassen, um jeden eingerichteten Bereich anzubieten.",
      edFilterHelp: "Welche Hälfte beim Öffnen ausgewählt ist. Umschalten kann sie danach jeder.",
      edGroupContentReports: "Meldungen",
      edGroupContentReportsHelp: "Welche Meldungen des Bereichs die Karte zeigt.",
      edMax: "Maximale Anzahl Meldungen",
      edMaxHelp: "Kürzt die Liste auf die nächstgelegenen. Aus zeigt alle Meldungen des Bereichs.",
      edOnlyNew: "Nur neue Meldungen",
      edOnlyNewHelp: "Zeigt nur, was noch als neu markiert ist. Das Abzeichen im Kopf schaltet es ebenfalls um.",
      edReference: "Entfernung messen ab",
      edReferenceHelp: "Der Punkt, von dem aus alle Entfernungen gerechnet werden. Bei einer Route - Wegpunkte oder Start/Ziel - ist jede Entfernung die Wegstrecke vom Start aus, egal was hier gewählt ist.",
      refModeArea: "Mittelpunkt des Bereichs",
      refModeMap: "Mittelpunkt der Kartenansicht",
      refModeEntity: "Person, Tracker oder Zone",
      edAreaPicker: "Bereichsauswahl anbieten",
      edAreaPickerHelp: "Ausschalten, um die Karte auf einen Bereich festzulegen.",
      edFilterPicker: "Filterauswahl anbieten",
      edFilterPickerHelp: "Ausschalten, um die Karte auf den unten gewählten Filter festzulegen.",
      edSort: "Sortierung",
      edSortHelp: "In welcher Reihenfolge die Meldungen stehen - in der Liste und im Pop-up des Minimalformats. Sie entscheidet auch, welche übrig bleiben, wenn die Anzahl begrenzt ist.",
      sortDistance: "Nächste zuerst",
      sortNewest: "Neueste zuerst",
      sortOldest: "Älteste zuerst",
      edCenterOnClick: "Klick zentriert die Karte",
      edCenterOnClickHelp: "Ein Klick auf einen Listeneintrag rückt die Karte auf diese Meldung und zoomt heran. Aus öffnet der Klick die Detailansicht der Meldung.",
      edMapHighlight: "Klick auf der Karte hebt hervor",
      edMapHighlightHelp: "Ein Klick auf eine Meldung in der Karte hinterlegt ihren Eintrag in der Liste. Ein Klick auf die freie Karte hebt das wieder auf.",
      edElHighlight: "Hervorhebung",
      edElHighlightHelp: "Wie der Eintrag hinterlegt wird, dessen Meldung auf der Karte angeklickt wurde.",
      edHighlightBg: "Hintergrundfarbe",
      edHighlightBgHelp: "Hintergrundfarbe des hervorgehobenen Eintrags.",
      edShowList: "Liste anzeigen",
      edShowListHelp: "Die Liste der Meldungen unter dem Kopf der Karte - im Minimalformat die Liste in dessen Pop-up. Aus bleiben nur der Kopf und, wenn eingeschaltet, die Karte.",
      edListOff: "Die Liste ist ausgeschaltet. Schalte sie unter Einstellungen, Allgemein ein, um sie einzurichten.",
      edMapOff: "Die Karte ist ausgeschaltet. Schalte sie unter Einstellungen, Allgemein ein, um sie einzurichten.",
      edGroupContentFilter: "Filter",
      edShowMap: "Karte anzeigen",
      edShowMapHelp: "Home Assistants eigene Kartenkarte, über der Liste - im Minimalformat die Karte neben der Liste in dessen Pop-up.",
      edAspect: "Seitenverhältnis der Karte",
      edAspectHelp: "Wie hoch die Karte im Verhältnis zu ihrer Breite gezeichnet wird. Im Querformat gibt es keines: dort füllt die Karte ihre Hälfte.",
      aspectPanorama: "21:9 (Panorama)",
      aspectWide: "16:9 (Breitbild)",
      aspect32: "3:2",
      aspect43: "4:3",
      aspectSquare: "1:1 (Quadrat)",
      aspectTall: "3:4 (hoch)",
      edMarkerBorder: "Rahmen um die Symbole",
      edMarkerBorderHelp: "Der farbige Ring, den Home Assistant um jede Markierung zeichnet. Aus bleibt nur das Symbol.",
      edMapFade: "Weiche Ränder",
      edMapFadeHelp: "Blendet die Kartenansicht an allen vier Seiten weich in die Karte aus, statt sie abzuschneiden. Ihre Knöpfe rücken dafür nach innen.",
      edMapCluster: "Nahe Meldungen zusammenfassen",
      edMapClusterHelp: "Fasst herausgezoomt nahe beieinanderliegende Meldungen zu einer Scheibe mit der Anzahl darauf zusammen; Hineinzoomen teilt sie wieder auf. Aus zeichnet jede Meldung einzeln, so viele sich auch überlagern. Braucht Home Assistant 2026.10 oder neuer - ältere Versionen fassen immer zusammen, und der Schalter ist dort ausgegraut.",
      edClusterStyle: "Form der Gruppe",
      edClusterStyleHelp: "Wie zusammengefasste Meldungen ab Home Assistant 2026.10 gezeichnet werden: als Blase der Karte mit den ersten Symbolen und einem \"+N\", oder als Scheibe mit der Anzahl darauf, wie jede Version davor sie zeichnete. Ein Klick auf beide zoomt zu den Meldungen. Ältere Versionen zeichnen ohnehin die Scheibe, dort ist die Wahl ausgegraut.",
      clusterStyleBubble: "Blase mit Symbolen (Home Assistant)",
      clusterStyleDisc: "Scheibe mit Anzahl (wie bis 2026.9)",
      edMarkerBackground: "Hintergrund der Symbole",
      edMarkerBackgroundHelp: "Die gefüllte Scheibe, auf der eine Markierung sitzt. Aus scheint die Karte durch.",
      edFollowMap: "Liste folgt der Karte",
      edFollowMapHelp: "Die Karte zeigt dann den ganzen Bereich und die Liste, was im sichtbaren Ausschnitt liegt - zum Verfolgen einer Route. Ausgeschaltet spiegelt die Karte stattdessen die Liste. In der Minimal-Variante sind das die Karte des Pop-ups und die Liste daneben.",
      edMapRoute: "Route in der Karte einzeichnen",
      edMapRouteHelp: "Bei einem Routen-Eintrag - Wegpunkte oder Start/Ziel - die Route selbst, unter den Meldungen gezeichnet und beim ersten Aufbau der Karte ins Bild gerückt. Farbe und Breite stehen unter Layout -> Karte.",
      edMapAlways: "Karte auch ohne Meldungen zeigen",
      edMapAlwaysHelp: "Zeigt die Karte auch, solange der Bereich nichts zu melden hat, eingepasst auf den Bereich, wie er eingerichtet ist - der Kreis um seinen Mittelpunkt oder um den Tracker, gestrichelt eingezeichnet - oder auf die Route. Aus nimmt die Karte weg, bis wieder etwas gemeldet wird. Mit dem Verkehrsfluss lohnt sich An: der hat auch auf einer leeren Karte etwas zu zeigen.",
      trafficLine: "Verkehrsfluss",
      trafficOff: "aus",
      trafficSwitch: "Verkehrsfluss auf der Karte zeigen",
      trafficRefresh: "Verkehrsfluss neu abrufen",
      edMapTraffic: "Verkehrsfluss anzeigen",
      edMapTrafficHelp: "Färbt die Straßen danach, wie der Verkehr darauf fließt, von Grün bis Dunkelrot, mit den Farben und Geschwindigkeitsstufen der Karte von Blitzer.de. Wird nicht abgefragt wie die Meldungen, sondern für den Ausschnitt dieser Karte geholt, solange die Karte zu sehen ist - ein Request je Ausschnitt, einer mehr nach Verschieben oder Zoomen, alle drei Minuten ein frischer, keiner, solange niemand hinschaut. Bei einem Routen-Eintrag nur die Route selbst, in Fahrtrichtung. Die Karte bekommt dann unter dem Untertitel eine Zeile mit einem Schalter, der den Fluss vorübergehend ein- und ausblendet, der Zeit des letzten Abrufs und einem Knopf zum Neuabrufen. Zählt auf dem Anfragen-Zähler des Bereichs mit. Braucht Home Assistant 2026.10 oder neuer; auf älteren Versionen ist der Schalter ausgegraut.",
      edMapClosures: "Sperrungen entlang der Straße einzeichnen",
      edMapClosuresHelp: "Eine amtliche Sperrung bringt den gesperrten Straßenabschnitt mit; als rotes Band darauf gezeichnet, wie die Karte von Blitzer.de selbst es tut, unter ihrem Symbol.",
      edRowClosure: "Sperrzeitraum",
      edElRoute: "Route",
      edElRouteHelp: "Die Linie, mit der die Route eines Routen-Eintrags gezeichnet wird. Nur solange \"Route in der Karte einzeichnen\" unter Einstellungen -> Allgemein an ist.",
      edRouteColor: "Linienfarbe",
      edRouteColorHelp: "Die Farbe der Routenlinie und ihrer Endpunkte. Leer folgt der Primärfarbe des Themes.",
      edRouteWidth: "Linienbreite",
      edRouteWidthHelp: "Wie dick die Routenlinie gezeichnet wird, in Pixeln. Standard 4.",
      edElTraffic: "Verkehrsfluss",
      edElTrafficHelp: "Die Linien, mit denen der Verkehrsfluss gezeichnet wird. Nur gezeichnet, solange unter Einstellungen -> Allgemein \"Verkehrsfluss anzeigen\" an ist.",
      edTrafficWidth: "Linienbreite",
      edTrafficWidthHelp: "Wie dick der Fluss einer Straße bei üblichem Zoom gezeichnet wird, in Pixeln, auch mit Kommastelle; eine Autobahn bekommt einen mehr, und Hineinzoomen bis auf Straßenebene verbreitert sie. Standard 1,5.",
      edTrafficOpacity: "Deckkraft",
      edTrafficOpacityHelp: "Wie deckend die Farben gezeichnet werden, in Prozent. Standard 50; weniger lässt die Karte durchscheinen.",
      edElCluster: "Zusammengefasste Meldungen",
      edElClusterHelp: "Worin die Karte nahe beieinanderliegende Meldungen herausgezoomt zusammenfasst: bis Home Assistant 2026.9 eine Scheibe mit der Anzahl darauf, ab 2026.10 eine Blase mit den ersten Symbolen und einem \"+N\" für den Rest. Hineinzoomen teilt sie wieder in die einzelnen Meldungen auf.",
      edClusterColor: "Farbe der Gruppe",
      edClusterColorHelp: "Die Farbe hinter den zusammengefassten Meldungen - Scheibe samt Ring oder Blase samt Spitze. Leer folgt dem Theme.",
      edClusterTextColor: "Farbe der Zahl",
      edClusterTextColorHelp: "Die Farbe der Anzahl - auf der Scheibe oder als \"+N\" in der Blase. Leer folgt der Textfarbe, die das Theme dafür vorsieht.",
      edClusterFont: "Größe und Stil der Zahl",
      edClusterFontHelp: "Schriftgröße der Anzahl - 14px, 1.2em - und ob sie fett, kursiv oder unterstrichen ist. Leer behält die Größe der Karte.",
    },
  };

  function t(hass) {
    const lang = (hass && hass.language ? hass.language : "en").slice(0, 2).toLowerCase();
    return STRINGS[lang] || STRINGS.en;
  }

  // What Blitzer.de puts on something that was never confirmed.
  const NEVER_CONFIRMED = "01.01.1970";

  // The report types whose confirmation count is not a community rating.
  const UNRATED_TYPES = ["fixed", "archive", "police_report"];

  // ----------------------------------------------------------------- config
  const DEFAULTS = {
    // The shape of the whole card. "portrait" is the map over the list,
    // "landscape" the two side by side, and "minimal" a single line saying
    // what is new, with those reports behind it in a pop-up.
    layout: "portrait",
    // The minimal format is two numbers - everything the area reports, and
    // what of it is new - with a symbol between them. Each number opens the
    // pop-up on what it counts, so the scope is a click rather than a setting.
    // The two halves of the minimal line and the NEW tag in its pop-up are
    // elements of their own, each with the full set - see DESIGN_ELEMENTS.
    // Their looks are separate from the head's badges on purpose: the badges
    // are not drawn in this format, and a card that is one line has different
    // needs from one that is a head over a list.
    mini_icon: "mdi:radar",
    mini_icon_color: "",
    mini_icon_size: "",
    mini_color: "",
    mini_font_size: "",
    mini_bold: false,
    mini_italic: false,
    mini_uppercase: false,
    mini_underline: false,
    mini_letter_spacing: "",
    // A fill of its own behind each half. Empty leaves what the stylesheet
    // draws: nothing behind the total, the accent tint behind the new.
    mini_fill_color: "",
    mini_fill_opacity: 100,
    mini_new_icon: "mdi:bell-outline",
    mini_new_icon_color: "",
    mini_new_icon_size: "",
    mini_new_color: "",
    mini_new_font_size: "",
    mini_new_bold: false,
    mini_new_italic: false,
    mini_new_uppercase: false,
    mini_new_underline: false,
    mini_new_letter_spacing: "",
    // Pre-set rather than empty: this half is already drawn on the accent,
    // and a field that says nothing while something is plainly there cannot
    // be dimmed or replaced - a lower opacity would only have faded a second
    // layer over the first. These two are that first layer now, so the
    // stylesheet no longer paints one of its own.
    mini_new_fill_color: "var(--blitzer-new-background, var(--accent-color, #ff9800))",
    mini_new_fill_opacity: 14,
    // The third part, arranged like the second: a clock rather than a queue,
    // because what this part counts is time rather than reports, and the
    // colour of the badge it stands in for.
    mini_delay_icon: "mdi:timer-alert-outline",
    mini_delay_icon_color: "",
    mini_delay_icon_size: "",
    mini_delay_color: "",
    mini_delay_font_size: "",
    mini_delay_bold: false,
    mini_delay_italic: false,
    mini_delay_uppercase: false,
    mini_delay_underline: false,
    mini_delay_letter_spacing: "",
    mini_delay_fill_color: "var(--blitzer-delay-background, var(--error-color, #db4437))",
    mini_delay_fill_opacity: 14,
    // The same starting look as the NEW tag in the card's own list: bold,
    // in capitals, on its pill.
    pop_new_color: "",
    pop_new_background: true,
    pop_new_background_color: "",
    pop_new_font_size: "",
    pop_new_bold: true,
    pop_new_italic: false,
    pop_new_uppercase: true,
    pop_new_underline: false,
    pop_new_letter_spacing: "",
    // And whether that pop-up puts a map beside the list.
    // Which parts the minimal line is made of. The other two follow
    // show_new and show_delay, which answer for the head's badges where
    // there is a head instead.
    mini_show_total: true,
    title: "",           // empty = the translated default
    areas: [],           // device ids; empty = every configured area
    filter: "all",       // the initial pick, before anyone touches the dropdown
    // Off, the card shows every report the area has; on, the nearest `max`
    // of them. The number keeps its value while the limit is switched off, so
    // switching back on does not mean typing it again.
    show_max: false,
    max: 5,
    // Starts the card on the new-only filter the head badge also toggles.
    only_new: false,
    // Where distances are measured from. "area" keeps the integration's own
    // figure - to the area's centre point, or to the nearest waypoint on a
    // route. "map" follows the embedded map's centre, so panning re-sorts the
    // list around wherever one is looking. "entity" measures from the person,
    // device tracker or zone named below, which stays named while one of the
    // other two modes is picked - switching back keeps the pick rather than
    // asking for it again.
    reference_mode: "area",
    reference: "",
    show_area_picker: true,
    show_filter_picker: true,
    area_select_color: "",
    area_select_background: true,
    area_select_background_color: "",
    area_select_font_size: "",
    area_select_bold: false,
    area_select_italic: false,
    area_select_uppercase: false,
    area_select_underline: false,
    area_select_letter_spacing: "",
    filter_select_color: "",
    filter_select_background: true,
    filter_select_background_color: "",
    filter_select_font_size: "",
    filter_select_bold: false,
    filter_select_italic: false,
    filter_select_uppercase: false,
    filter_select_underline: false,
    filter_select_letter_spacing: "",
    // The card's own heading, and how it is drawn. Switched off, the whole
    // title line goes - and with it its Layout settings, which would then
    // style something nobody sees.
    show_title: true,
    title_color: "",
    title_font_size: "",
    title_bold: false,
    title_italic: false,
    title_uppercase: false,
    title_underline: false,
    title_letter_spacing: "",
    // The card's own wording for an empty area. Empty keeps whichever of
    // its two built-in sentences fits the situation.
    count_color: "",
    count_background: true,
    count_background_color: "",
    count_font_size: "",
    count_bold: false,
    count_italic: false,
    count_uppercase: false,
    count_underline: false,
    count_letter_spacing: "",
    // Any MDI name, drawn in front of the line and taking its colour and
    // size. Empty draws none.
    sub_icon: "mdi:information-outline",
    // Empty means "as tall as a capital letter of the line", which is what
    // the stylesheet does with the 1cap unit.
    sub_icon_color: "",
    sub_icon_size: "",
    // The line as a whole, then the three things it can say, each on its own.
    // The badge beside the title, and the line under it: each on its own
    // switch, because one says how much there is and the other says where
    // one is looking.
    show_count: true,
    // Part of the line under the title, and on with it: a card that polls
    // on demand is unusable without it, and one that polls on a schedule
    // loses nothing to a second symbol on a line that already says when it
    // last looked.
    show_refresh: true,
    refresh_icon: "mdi:refresh",
    refresh_icon_color: "",
    refresh_icon_size: "",
    show_sub: true,
    sub_show_area: true,
    sub_show_mode: true,
    sub_show_updated: true,
    sub_color: "",
    sub_font_size: "",
    sub_bold: false,
    sub_italic: false,
    sub_uppercase: false,
    sub_underline: false,
    sub_letter_spacing: "",
    no_reports_text: "",
    no_reports_color: "",
    no_reports_font_size: "",
    no_reports_bold: false,
    no_reports_italic: false,
    no_reports_uppercase: false,
    no_reports_underline: false,
    no_reports_letter_spacing: "",
    // A background of the user's own behind the whole card - a colour, an
    // image, or both. Off by default: an existing card must keep the
    // background its theme gives it until somebody asks for another.
    card_background: false,
    card_background_color: "",
    card_background_image: "",
    card_background_size: "cover",
    card_background_opacity: 100,
    // Whether a freshly reported entry is marked NEW at all. How long that
    // lasts is not the card's to answer - it belongs to the area, and is
    // read back off its sensors. See newWindows().
    show_new: true,
    // What the jams cost, added up (see delaySum): the badge beside the NEW
    // one where there is a head to draw it in, the third part of the line
    // where there is not. The badge is only drawn where there is something
    // to add up; the part of the line stands quiet at nought, the way the
    // new part beside it does.
    show_delay: true,
    new_color: "",
    new_background: true,
    new_background_color: "",
    new_font_size: "",
    // Both on: the marker is drawn bold and in capitals, and a switch that
    // reports a look has to start where that look actually is.
    new_bold: true,
    new_italic: false,
    new_uppercase: true,
    new_underline: false,
    new_letter_spacing: "",
    // The delay badge beside it (see delaySum): the same nine settings, so
    // the two can be styled as a pair or told apart. Bold and in capitals
    // like the badge it stands next to, which is where it started.
    delay_color: "",
    delay_background: true,
    delay_background_color: "",
    delay_font_size: "",
    delay_bold: true,
    delay_italic: false,
    delay_uppercase: true,
    delay_underline: false,
    delay_letter_spacing: "",
    // On by default, both of them: a map beside the list is what most people
    // put this card on a dashboard for, and with the list following the map
    // panning it is how one reads a route rather than a radius.
    show_map: true,
    // The list itself. Off leaves the head - and the map, if that is on.
    show_list: true,
    map_aspect_ratio: "16:9",
    // Home Assistant's own marker chrome. Off by default: the Blitzer.de
    // symbols are drawings in their own right and read better without a ring
    // and a disc around them. Switch either on for Home Assistant's own look.
    map_marker_border: false,
    map_marker_background: false,
    // Soft edges rather than a hard cut, on by default - a map that melts
    // into the card is what this card is meant to look like. The switch is
    // there for anyone who wants the plain rectangle back.
    map_fade: true,
    // The route of a route entry - waypoints or start/destination - drawn on
    // the map. Its colour follows the theme's primary colour until one is
    // picked; the width is in pixels.
    map_route: true,
    // An official closure's stretch of road, as a band on the map.
    map_closures: true,
    map_always: true,
    map_traffic: false,
    traffic_width: 1.5,
    traffic_opacity: 50,
    route_color: "",
    route_width: 4,
    // Whether Home Assistant's map gathers nearby reports into discs at all.
    // On, as the map itself defaults to; off is handed to the map as its
    // "cluster" option, which versions before 2026.10 do not know and
    // ignore - they group regardless.
    map_cluster: true,
    // What a group looks like from 2026.10 on: the map's bubble with the
    // first few symbols ("bubble"), or the disc with the count that every
    // version before drew ("disc") - redrawn by the card over the bubble.
    // Moot before 2026.10, where the disc is all there is.
    cluster_style: "bubble",
    // The discs Home Assistant's map gathers nearby reports into, with the
    // count on them: the disc's colour and the count's. Empty leaves the
    // theme's primary colour and its text colour on it.
    cluster_color: "",
    cluster_text_color: "",
    cluster_font_size: "",
    cluster_bold: false,
    cluster_italic: false,
    cluster_underline: false,
    follow_map: true,
    // A click on a list entry aims the map at that report rather than
    // opening Home Assistant's details dialog for it.
    center_on_click: true,
    // And the other way round: a click on a report in the map backs its
    // entry in the list until the bare map is clicked.
    map_highlight: true,
    highlight_color: "",
    // Nearest first, which is what a card about what is on the road ahead
    // is for. The other two order by when something was reported.
    sort: "distance",
    // Off by default: a card that has always shown its whole list must not
    // start hiding the end of it because it was updated. On, the first few
    // stand and the rest waits behind a chevron.
    collapse_list: false,
    collapse_after: 3,
    // What a list entry is made of, each part on its own switch, plus the
    // rule between two entries.
    show_divider: true,
    divider_color: "",
    divider_width: "",
    divider_style: "solid",
    show_row_picture: true,
    row_picture_size: "",
    show_row_line1: true,
    show_row_distance: true,
    show_row_speed: true,
    show_row_line2: true,
    show_row_extra: true,
    show_row_reported: true,
    show_row_confirmed: true,
    // "Since ..." and "Until ..." on an official closure.
    show_row_closure: true,
    show_row_stars: true,
    stars_size: "",
    stars_color: "",
    line1_color: "",
    line1_font_size: "",
    line1_bold: false,
    line1_italic: false,
    line1_uppercase: false,
    line1_underline: false,
    line1_letter_spacing: "",
    line2_icon: "mdi:map-marker",
    line2_icon_color: "",
    line2_icon_size: "",
    line2_color: "",
    line2_font_size: "",
    line2_bold: false,
    line2_italic: false,
    line2_uppercase: false,
    line2_underline: false,
    line2_letter_spacing: "",
    extra_icon: "mdi:text",
    extra_icon_color: "",
    extra_icon_size: "",
    extra_color: "",
    extra_font_size: "",
    extra_bold: false,
    extra_italic: false,
    extra_uppercase: false,
    extra_underline: false,
    extra_letter_spacing: "",
    chip_color: "",
    chip_background: true,
    chip_background_color: "",
    chip_font_size: "",
    chip_bold: false,
    chip_italic: false,
    chip_uppercase: false,
    chip_underline: false,
    chip_letter_spacing: "",
  };

  function defaultConfig(config) {
    const merged = { ...DEFAULTS, ...(config || {}) };
    // Until the windows moved to the integration, the card carried its own
    // "mark as new for" in minutes, and 0 was how the marking got switched
    // off. Nothing but that switch could produce a 0 - the default was 60 -
    // so one still on file is read as the switch it has become, and the dead
    // key drops out the next time the editor saves.
    if (merged.new_minutes !== undefined) {
      if (merged.new_minutes === 0) merged.show_new = false;
      delete merged.new_minutes;
    }
    // The pop-up used to have a map switch of its own, next to the card's.
    // Two switches for one map is one too many, so the card's own answers
    // for both now - and a card that had the pop-up map switched off keeps
    // it off. Only where that switch was ever reachable: outside the minimal
    // format it was hidden, and a stale false there must not blank the map a
    // portrait card actually draws.
    if (merged.mini_popup_map !== undefined) {
      if (merged.mini_popup_map === false && merged.layout === "minimal") {
        merged.show_map = false;
      }
      delete merged.mini_popup_map;
    }
    return merged;
  }

  function sameValue(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((item, i) => sameValue(item, b[i]));
    }
    return false;
  }

  // Everything that differs from what defaultConfig would have produced
  // anyway. Writing all of it back would put a dozen lines of YAML behind a
  // card nobody has customised, burying the one or two that say something -
  // and would pin options nobody chose to today's defaults forever.
  function pruneDefaults(config) {
    const out = {};
    for (const [key, value] of Object.entries(config)) {
      if (key === "type") { out[key] = value; continue; }
      if (sameValue(value, DEFAULTS[key])) continue;
      out[key] = value;
    }
    return out;
  }

  // ------------------------------------------------------------------ data
  //
  // Every area the Blitzer.de integration has set up, as the device registry
  // sees it. A renamed device answers on name_by_user, so both are read - and
  // the id, not the name, is what the entities are matched against further
  // down, so renaming an area never breaks the card.
  // ------------------------------------------------------------------ route
  //
  // The line a "Route (start/destination)" entry searches along, drawn on
  // Home Assistant's own map - in this card, in its pop-up, and in the setup
  // dialog, which has no field of its own that could draw one.
  //
  // Drawn with the map element's own Leaflet (ha-map's Leaflet and
  // leafletMap), in the overlay pane, so the reports sit on top of it.
  function routeSig(route) {
    if (!route || !route.points || route.points.length < 2) return "";
    const pts = route.points;
    return pts.length + ":" + pts[0].join(",") + ":" + pts[pts.length - 1].join(",");
  }

  // The colour the route is drawn in: the one picked in the editor, or the
  // theme's primary colour. A picked one is resolved here - a preset is a CSS
  // variable, and Leaflet writes the colour into an SVG attribute, where a
  // variable means nothing.
  function routeColor(el, picked) {
    try {
      if (picked) {
        const probe = document.createElement("span");
        probe.style.display = "none";
        probe.style.color = picked;
        (el.shadowRoot || el).appendChild(probe);
        const rgb = getComputedStyle(probe).color;
        probe.remove();
        if (rgb) return rgb;
      }
      return getComputedStyle(el).getPropertyValue("--primary-color").trim() || "#03a9f4";
    } catch (err) {
      return "#03a9f4";
    }
  }

  // ---- the map's handles, by Home Assistant version
  //
  // Through 2026.9, ha-map carried Leaflet itself: the namespace as
  // `Leaflet`, the instance as `leafletMap`. From 2026.10 it drives an
  // engine instead - MapLibre GL, or Leaflet as the fallback without
  // WebGL2 - keeps that engine to itself, and offers fitBounds,
  // containsLocation, getView and setView of its own. Neither shape is a
  // documented interface, so everything here is found by feel and guarded:
  // a map that offers neither simply gets no route drawn and no viewport
  // read, as the card has always behaved when it could not reach in.
  //
  // What comes back is one small vocabulary the rest of the card speaks
  // whatever the version: events, the centre and the viewport, a jump to a
  // point, and the three things a route is drawn with - a line, a dot and a
  // numbered label - plus a fit to a set of points.
  function mapHandles(haMap) {
    if (!haMap) return null;

    const leafletHandles = (L, leaflet) => ({
      kind: "leaflet",
      on: (name, fn) => leaflet.on(name, fn),
      off: (name, fn) => leaflet.off(name, fn),
      container: () => (typeof leaflet.getContainer === "function" ? leaflet.getContainer() : null),
      centre: () => {
        const c = leaflet.getCenter();
        return { lat: c.lat, lon: c.lng };
      },
      contains: (lat, lon) => leaflet.getBounds().contains([lat, lon]),
      bounds: () => {
        const b = leaflet.getBounds();
        return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
      },
      traffic: () => trafficLeafletLayer(L, leaflet),
      zoom: () => leaflet.getZoom(),
      zoomTo: (lat, lon, minZoom) =>
        leaflet.setView([lat, lon], Math.max(leaflet.getZoom() || 0, minZoom)),
      line: (points, o) => {
        const line = L.polyline(points, {
          color: o.color,
          weight: o.width,
          opacity: o.opacity,
          dashArray: o.dashed ? "8 6" : null,
          interactive: false,
        });
        line.addTo(leaflet);
        return { remove: () => line.remove() };
      },
      dot: (point, o) => {
        const dot = L.circleMarker(point, {
          radius: o.radius,
          color: "#fff",
          weight: 2,
          fillColor: o.color,
          fillOpacity: o.fill,
          interactive: false,
        });
        dot.addTo(leaflet);
        return { remove: () => dot.remove() };
      },
      label: (point, text, color) => {
        const marker = L.marker(point, {
          interactive: false,
          icon: L.divIcon({
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: routeLabelHtml(text, color),
          }),
        });
        marker.addTo(leaflet);
        return { remove: () => marker.remove() };
      },
      fit: (points, o = {}) => fitRoute(leaflet, L.latLngBounds(points), o.maxZoom),
      inView: (points) => leaflet.getBounds().contains(L.latLngBounds(points)),
    });

    // Through 2026.9.
    if (haMap.leafletMap && haMap.Leaflet && typeof haMap.leafletMap.getBounds === "function") {
      return leafletHandles(haMap.Leaflet, haMap.leafletMap);
    }

    const engine = haMap._engine;
    if (!engine) return null;
    // 2026.10's Leaflet fallback: the same Leaflet, one level down.
    if (engine.leafletMap && engine.Leaflet && typeof engine.leafletMap.getBounds === "function") {
      return leafletHandles(engine.Leaflet, engine.leafletMap);
    }
    // 2026.10's MapLibre engine. The route goes on as one of the engine's
    // own paths - the kind it draws history trails with, which it also
    // carries across a change of map style - and the dots and labels as
    // markers, which is what the engine places any element with.
    const inner = engine._map;
    if (
      !inner || typeof inner.on !== "function" ||
      typeof engine.addPath !== "function" || typeof engine.addMarker !== "function" ||
      typeof haMap.fitBounds !== "function" || typeof haMap.containsLocation !== "function" ||
      typeof haMap.getView !== "function"
    ) {
      return null;
    }
    const element = (cssText) => {
      const el = document.createElement("div");
      el.style.cssText = cssText;
      return el;
    };
    return {
      kind: "engine",
      on: (name, fn) => inner.on(name, fn),
      off: (name, fn) => inner.off(name, fn),
      container: () => (typeof inner.getContainer === "function" ? inner.getContainer() : null),
      centre: () => {
        const view = haMap.getView();
        return view && view.center ? { lat: view.center[0], lon: view.center[1] } : undefined;
      },
      contains: (lat, lon) => haMap.containsLocation([lat, lon]),
      bounds: () => {
        const b = inner.getBounds();
        return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
      },
      traffic: () => trafficEngineLayer(inner),
      zoom: () => {
        const view = haMap.getView();
        return view ? view.zoom : undefined;
      },
      zoomTo: (lat, lon, minZoom) => {
        const view = haMap.getView();
        haMap.setView([lat, lon], Math.max((view && view.zoom) || 0, minZoom));
      },
      line: (points, o) => {
        // The engine numbers its paths; the one just added is the last
        // number handed out. Its line is drawn 3px wide whatever is asked,
        // so the width is set on the layer afterwards - and again whenever
        // the style is rebuilt, since the engine re-adds the layer as it
        // first made it.
        const handle = engine.addPath({
          color: o.color,
          segments: [{ points, opacity: o.opacity }],
          markers: [],
        });
        const id = Number.isFinite(engine._idCounter)
          ? "ha-map-path-" + (engine._idCounter - 1) + "-lines"
          : null;
        const apply = () => {
          if (!id) return;
          try {
            if (!inner.getLayer(id)) return;
            if (inner.getPaintProperty(id, "line-width") !== o.width) {
              inner.setPaintProperty(id, "line-width", o.width);
            }
            if (o.dashed && !inner.getPaintProperty(id, "line-dasharray")) {
              inner.setPaintProperty(id, "line-dasharray", [2, 1.5]);
            }
          } catch (err) {
            // The style is still loading, or the layer went with it.
          }
        };
        apply();
        inner.on("styledata", apply);
        return {
          remove: () => {
            try {
              inner.off("styledata", apply);
            } catch (err) {
              // The map went first.
            }
            handle.remove();
          },
        };
      },
      dot: (point, o) => {
        const size = o.radius * 2 + 4;
        const el = element(
          "box-sizing:border-box;width:" + size + "px;height:" + size + "px;border-radius:50%;" +
          "border:2px solid #fff;background:color-mix(in srgb, " + o.color + " " +
          Math.round(o.fill * 100) + "%, transparent);pointer-events:none"
        );
        const handle = engine.addMarker(el, point, { size: [size, size], interactive: false });
        return { remove: () => handle.remove() };
      },
      label: (point, text, color) => {
        const el = element("pointer-events:none");
        el.innerHTML = routeLabelHtml(text, color);
        const handle = engine.addMarker(el, point, { size: [22, 22], interactive: false });
        return { remove: () => handle.remove() };
      },
      // ha-map's own fit: it pauses the map's auto-fit for good, so nothing
      // of Home Assistant's undoes it later. Its zoom is a ceiling, and the
      // map's default of 14 is too far out for a short commute.
      fit: (points, o = {}) => haMap.fitBounds(points, {
        zoom: o.maxZoom || 17,
        pad: 0.05,
        padding: { top: 20, right: 20, bottom: 20, left: 20 },
      }),
      inView: (points) => {
        const lats = points.map((pt) => pt[0]);
        const lons = points.map((pt) => pt[1]);
        return (
          haMap.containsLocation([Math.min(...lats), Math.min(...lons)]) &&
          haMap.containsLocation([Math.max(...lats), Math.max(...lons)])
        );
      },
    };
  }

  // ---- The traffic flow, as Blitzer.de's map draws it ----------------------
  //
  // The integration hands over what the endpoint sends, four arrays side by
  // side - each road's points on a 2000-step grid laid over the box asked
  // for, its speed, whether it is a motorway, and its carriageway - and the
  // box itself. Decoded here the way the map's own code does it: a jump of
  // more than 800 grid steps starts a new line, a non-number ends one.
  const TRAFFIC_GRID = 2000;
  const TRAFFIC_GAP = 800;
  // The map's speed steps and colours: grey for "no data", then dark red to
  // green. Motorways are judged against the first set, every other road
  // against the second.
  const TRAFFIC_HIGHWAY_STEPS = [-1, 0, 30, 50, 70, 90, 110];
  const TRAFFIC_ROAD_STEPS = [-1, 0, 5, 15, 25, 40, 60];
  const TRAFFIC_COLORS = ["#c0c0c0", "#850000", "#850000", "#cd0000", "#f5c800", "#acd739", "#00aa00"];
  // How long a fetched view stays before the card asks again while it is
  // on screen, and how long a pan or a zoom is given to settle first.
  const TRAFFIC_REFRESH_MS = 180000;
  const TRAFFIC_DEBOUNCE_MS = 900;

  function trafficSegments(data, box) {
    if (!Array.isArray(data) || data.length !== 4 || !Array.isArray(box) || box.length !== 4) return [];
    const [lines, speeds, highways, lanes] = data;
    const [south, west, north, east] = box.map(Number);
    const out = [];
    for (let i = 0; i < (lines || []).length; i++) {
      const line = lines[i];
      if (!Array.isArray(line) || line.length < 4) continue;
      const speed = Number((speeds || [])[i] ?? 0);
      const highway = !!(highways || [])[i];
      const lane = Number((lanes || [])[i] ?? 0);
      let points = [];
      let px = null;
      let py = null;
      const flush = () => {
        if (points.length >= 2) out.push({ coordinates: points, speed, highway, lane });
        points = [];
      };
      for (let k = 0; k + 1 < line.length; k += 2) {
        const x = Number(line[k]);
        const y = Number(line[k + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          flush();
          px = null;
          py = null;
          continue;
        }
        if (px !== null && (x - px) * (x - px) + (y - py) * (y - py) > TRAFFIC_GAP * TRAFFIC_GAP) flush();
        points.push([south + ((north - south) * y) / TRAFFIC_GRID, west + ((east - west) * x) / TRAFFIC_GRID]);
        px = x;
        py = y;
      }
      flush();
    }
    return out;
  }

  // The colour of a stretch: the step nearest its speed.
  function trafficColor(segment) {
    const steps = segment.highway ? TRAFFIC_HIGHWAY_STEPS : TRAFFIC_ROAD_STEPS;
    let best = 0;
    let gap = Infinity;
    for (let i = 0; i < steps.length; i++) {
      const d = Math.abs(segment.speed - steps[i]);
      if (d < gap) {
        gap = d;
        best = i;
      }
    }
    return TRAFFIC_COLORS[best] || TRAFFIC_COLORS[TRAFFIC_COLORS.length - 1];
  }

  // The width from the card's own setting, a motorway one wider, and both
  // wider at street level the way the map's own are; the band is set off to
  // the right of the direction of travel by as much, so the two carriageways
  // sit side by side rather than on top of each other.
  function trafficWidth(highway, zoom, base) {
    const factor = zoom >= 18 ? 2 : zoom >= 16 ? 1.5 : 1;
    const width = Math.max(0.5, Math.round((Number(base) || 1.5) * factor * 10) / 10);
    return highway ? width + 1 : width;
  }

  // How far apart two pieces of one road may lie and still be joined. The
  // endpoint delivers a road in pieces with holes between them, and the
  // holes grow with the zoom it is asked at: 80-150 m between pieces of
  // 110-150 m at z=16 on the St 2580, 150-300 m between pieces of 250 m at
  // z=13. The integration asks for more detail than the map shows, and
  // what holes are left are bridged up to this - along the road's own
  // direction only, so a junction does not get a bridge across it.
  const TRAFFIC_BRIDGE_M = 400;
  const TRAFFIC_CELL = 0.002;

  function trafficMetres(a, b) {
    const k = Math.cos((a[0] * Math.PI) / 180);
    return Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * k);
  }

  // The cosine of the angle between the way a piece ends and the way the
  // next begins - for telling the continuation of a road from a side road
  // that happens to start nearby.
  function trafficAligned(tail, nextStart, nextSecond) {
    const k = Math.cos((tail[1][0] * Math.PI) / 180);
    const ax = (tail[1][1] - tail[0][1]) * k;
    const ay = tail[1][0] - tail[0][0];
    const bx = (nextSecond[1] - nextStart[1]) * k;
    const by = nextSecond[0] - nextStart[0];
    const gx = (nextStart[1] - tail[1][1]) * k;
    const gy = nextStart[0] - tail[1][0];
    const cosine = (p, q, r, t) => {
      const n = Math.hypot(p, q) * Math.hypot(r, t);
      return n ? (p * r + q * t) / n : 1;
    };
    return cosine(ax, ay, bx, by) >= 0.3 && cosine(ax, ay, gx, gy) >= 0.3;
  }

  // Blitzer.de delivers a road in pieces, and with the band set off
  // sideways two pieces meeting at a bend no longer overlap - a wedge of
  // map shows between them. Pieces that meet end to end in the same colour
  // are joined into one line first, which the renderer then bends properly.
  function trafficChain(segments, bridge) {
    // Starts filed by cell, so the pieces near an end are found without
    // measuring every one.
    const cell = (pt) => Math.floor(pt[0] / TRAFFIC_CELL) + "," + Math.floor(pt[1] / TRAFFIC_CELL);
    const byCell = new Map();
    segments.forEach((seg, i) => {
      const k = cell(seg.coordinates[0]);
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k).push(i);
    });
    const near = (pt) => {
      const r = Math.floor(pt[0] / TRAFFIC_CELL);
      const c = Math.floor(pt[1] / TRAFFIC_CELL);
      const found = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) found.push(...(byCell.get(r + dr + "," + (c + dc)) || []));
      }
      return found;
    };
    const used = new Array(segments.length).fill(false);
    const out = [];
    for (let i = 0; i < segments.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const head = segments[i];
      const coordinates = head.coordinates.slice();
      for (let guard = 0; guard < 5000; guard++) {
        const end = coordinates[coordinates.length - 1];
        const tail = [coordinates[coordinates.length - 2], end];
        let best = -1;
        let bestGap = Infinity;
        for (const j of near(end)) {
          if (used[j] || segments[j].color !== head.color || segments[j].highway !== head.highway) continue;
          const start = segments[j].coordinates[0];
          const gap = trafficMetres(end, start);
          if (gap >= bestGap || gap > (bridge ? TRAFFIC_BRIDGE_M : 1)) continue;
          // Touching pieces join whatever the angle - a bend is a bend;
          // a hole is only bridged along the road's own direction, and
          // only on a route: an area's view is never complete anyway.
          if (gap > 1 && !trafficAligned(tail, start, segments[j].coordinates[1])) continue;
          best = j;
          bestGap = gap;
        }
        if (best < 0) break;
        used[best] = true;
        const piece = segments[best].coordinates;
        coordinates.push(...(bestGap <= 1 ? piece.slice(1) : piece));
      }
      out.push({ ...head, coordinates });
    }
    // A hole before a piece of another colour is bridged too, with a short
    // connector in the colour of the line before it: the road is the same
    // road, only its speed changes across the hole. A line whose end a
    // piece already starts at, or that ends where no piece follows in its
    // direction, gets none.
    if (!bridge) return out;
    for (const line of out.slice()) {
      const end = line.coordinates[line.coordinates.length - 1];
      const tail = [line.coordinates[line.coordinates.length - 2], end];
      let best = null;
      let bestGap = Infinity;
      for (const j of near(end)) {
        const seg = segments[j];
        if (seg.highway !== line.highway || seg.coordinates[0] === line.coordinates[0]) continue;
        const start = seg.coordinates[0];
        const gap = trafficMetres(end, start);
        if (gap <= 1) {
          best = null;
          break;
        }
        if (gap >= bestGap || gap > TRAFFIC_BRIDGE_M) continue;
        if (!trafficAligned(tail, start, seg.coordinates[1])) continue;
        best = start;
        bestGap = gap;
      }
      if (best) out.push({ ...line, coordinates: [end, best], bridge: true });
    }
    return out;
  }

  let trafficLayerCount = 0;

  // On 2026.10's MapLibre engine: one GeoJSON source and two line layers -
  // a white casing and the coloured flow - on top of the engine's own
  // paths: a route's line lies under the flow, since on a route entry the
  // flow is drawn on the route itself, and a thin flow under a thick route
  // line would never show. The engine rebuilds its style now and then and
  // loses what was added to it, and adds a path of its own on top whenever
  // the route is repainted; the layers are put back, and back on top,
  // whenever the style comes up without them there.
  function trafficEngineLayer(inner) {
    const id = "blitzer-traffic-" + (++trafficLayerCount);
    let features = [];
    const collection = () => ({ type: "FeatureCollection", features });
    const topmost = () => {
      try {
        const layers = (inner.getStyle() && inner.getStyle().layers) || [];
        return layers.length > 0 && layers[layers.length - 1].id === id + "-flow";
      } catch (err) {
        return true;
      }
    };
    const raise = () => {
      try {
        inner.moveLayer(id + "-casing");
        inner.moveLayer(id + "-flow");
      } catch (err) {
        // Not there to move.
      }
    };
    const layout = { "line-cap": "round", "line-join": "round" };
    const add = () => {
      try {
        const source = inner.getSource(id);
        if (source && inner.getLayer(id + "-flow")) {
          source.setData(collection());
          if (!topmost()) raise();
          return;
        }
        if (!source) inner.addSource(id, { type: "geojson", data: collection() });
        const before = undefined;
        if (!inner.getLayer(id + "-casing")) {
          inner.addLayer(
            {
              id: id + "-casing",
              type: "line",
              source: id,
              layout,
              paint: {
                "line-color": "#ffffff",
                "line-width": ["+", ["get", "weight"], 2],
                "line-offset": ["get", "offset"],
                "line-opacity": ["get", "opacity"],
              },
            },
            before
          );
        }
        if (!inner.getLayer(id + "-flow")) {
          inner.addLayer(
            {
              id: id + "-flow",
              type: "line",
              source: id,
              layout,
              paint: {
                "line-color": ["get", "color"],
                "line-width": ["get", "weight"],
                "line-offset": ["get", "offset"],
                "line-opacity": ["get", "opacity"],
              },
            },
            before
          );
        }
      } catch (err) {
        // The style is still loading; styledata brings this back.
      }
    };
    const onStyle = () => {
      if (!features.length) return;
      try {
        if (!inner.getSource(id) || !inner.getLayer(id + "-flow")) add();
        else if (!topmost()) raise();
      } catch (err) {
        // Not yet.
      }
    };
    inner.on("styledata", onStyle);
    return {
      set: (segments, zoom, style) => {
        features = trafficChain(segments.map((seg) => ({ ...seg, color: trafficColor(seg) })), style.bridge).map((seg) => {
          const weight = trafficWidth(seg.highway, zoom, style.width);
          return {
            type: "Feature",
            properties: { color: seg.color, weight, offset: weight, opacity: style.opacity },
            geometry: { type: "LineString", coordinates: seg.coordinates.map((pt) => [pt[1], pt[0]]) },
          };
        });
        add();
      },
      remove: () => {
        try {
          inner.off("styledata", onStyle);
        } catch (err) {
          // The map went first.
        }
        try {
          [id + "-flow", id + "-casing"].forEach((layer) => {
            if (inner.getLayer(layer)) inner.removeLayer(layer);
          });
          if (inner.getSource(id)) inner.removeSource(id);
        } catch (err) {
          // Gone with the map.
        }
      },
    };
  }

  // On Leaflet - the fallback without WebGL - plain polylines in a group,
  // casing under flow, without the sideways offset.
  function trafficLeafletLayer(L, leaflet) {
    const group = L.layerGroup();
    group.addTo(leaflet);
    return {
      set: (segments, zoom, style) => {
        group.clearLayers();
        try {
          if (typeof group.bringToFront === "function") group.bringToFront();
        } catch (err) {
          // Older Leaflet.
        }
        for (const seg of trafficChain(segments.map((item) => ({ ...item, color: trafficColor(item) })), style.bridge)) {
          const weight = trafficWidth(seg.highway, zoom, style.width);
          group.addLayer(
            L.polyline(seg.coordinates, { color: "#ffffff", weight: weight + 2, opacity: style.opacity, lineCap: "round", interactive: false })
          );
          group.addLayer(
            L.polyline(seg.coordinates, { color: seg.color, weight, opacity: style.opacity, lineCap: "round", interactive: false })
          );
        }
      },
      remove: () => {
        try {
          group.clearLayers();
          group.remove();
        } catch (err) {
          // Gone with the map.
        }
      },
    };
  }

  // A number on a route, for telling alternatives apart: a small disc in
  // the line's colour.
  function routeLabelHtml(text, color) {
    return (
      '<div style="width:22px;height:22px;border-radius:50%;background:' + color + ";" +
      'color:#fff;font:700 13px/22px sans-serif;text-align:center;' +
      'box-shadow:0 0 0 2px #fff">' + escapeHtml(String(text)) + "</div>"
    );
  }

  // The route as drawn on any map: the line, a hollow dot at its start and a
  // filled one at its destination - which way round it runs, without a
  // legend - and the via points smaller between them: a route that bends
  // away from where it seems to be going is almost always following one.
  function drawRouteWith(h, points, color, vias, weight) {
    const width = Number.isFinite(Number(weight)) && Number(weight) > 0 ? Number(weight) : 4;
    const items = [h.line(points, { color, width, opacity: 0.85 })];
    items.push(h.dot(points[0], { color, fill: 0.35, radius: 5 }));
    items.push(h.dot(points[points.length - 1], { color, fill: 1, radius: 5 }));
    for (const via of Array.isArray(vias) ? vias : []) {
      items.push(h.dot(via, { color, fill: 0.7, radius: 4 }));
    }
    return {
      points,
      remove: () => {
        for (const item of items) {
          try {
            item.remove();
          } catch (err) {
            // Its map is already gone.
          }
        }
      },
    };
  }

  function removeRoute(drawn) {
    if (drawn) drawn.remove();
  }

  // Since 2026.9 the streets under ha-map are a MapLibre GL layer, and it
  // does not follow a jump it was not animated through: after a plain fit it
  // keeps its last frame, stretched over the new view - measured, labels
  // three times their size until something else moved the map. Telling it
  // its size again makes it draw the view it is actually showing.
  function refreshBaseMap(leaflet) {
    try {
      leaflet.eachLayer((layer) => {
        if (typeof layer.getMaplibreMap !== "function") return;
        const gl = layer.getMaplibreMap();
        if (gl && typeof gl.resize === "function") gl.resize();
      });
    } catch (err) {
      // No MapLibre layer on this version - nothing to refresh.
    }
  }

  // Without animation: an animated fit is exactly what leaves the stretched
  // frame behind.
  function fitRoute(leaflet, bounds, maxZoom) {
    try {
      leaflet.invalidateSize(false);
      leaflet.fitBounds(bounds, {
        padding: [20, 20],
        animate: false,
        ...(maxZoom ? { maxZoom } : {}),
      });
    } catch (err) {
      return;
    }
    refreshBaseMap(leaflet);
  }

  // Home Assistant's map fits itself to its markers once it has them, and
  // that lands after a route fitted the moment the map attached. Measured on
  // a 458 x 258 map: the first fit left the route's far end outside it, while
  // the very same fit repeated later showed it end to end - and with the list
  // following the map, reports at that end had dropped out of the list too.
  //
  // When that fit comes is not something to guess at: with the streets drawn
  // by MapLibre the map takes 15-30 s to appear, and a few timed refits a
  // few seconds apart still lost. So the map is asked instead - every time it
  // comes to rest, a route no longer entirely in view is fitted again. The
  // route's own fit comes to rest with the route in view, so it does not set
  // itself off again. The first touch - a drag, a pinch, the wheel, a key -
  // ends it for good: where someone put the view is where it stays.
  // Returns the function that ends the watch early - for whoever moves the
  // map on purpose before the minute is up, so the watch does not pull it
  // back to the route.
  function fitRouteSettled(h, points) {
    h.fit(points);
    const container = h.container();
    const events = ["mousedown", "touchstart", "wheel", "keydown"];
    let done = false;
    // 2026.10's MapLibre fires moveend from a resize, moved or not, and
    // fitting the map is what resizes it - so a fit from here fires the very
    // event that called here, synchronously. Guarded twice: nothing while a
    // fit is under way, and nothing for a view that did not change.
    let busy = false;
    let lastView = "";
    const viewOf = () => {
      try {
        const c = h.centre();
        return c ? `${c.lat.toFixed(5)},${c.lon.toFixed(5)},${h.zoom()}` : "";
      } catch (err) {
        return "";
      }
    };
    const cleanup = () => {
      if (done) return;
      done = true;
      try {
        h.off("moveend", onRest);
      } catch (err) {
        // The map went first.
      }
      if (container) {
        events.forEach((name) => container.removeEventListener(name, cleanup));
      }
    };
    const onRest = () => {
      if (busy || done) return;
      const view = viewOf();
      if (view === lastView) return;
      lastView = view;
      busy = true;
      try {
        if (!h.inView(points)) h.fit(points);
      } catch (err) {
        cleanup();
      } finally {
        busy = false;
      }
    };
    lastView = viewOf();
    h.on("moveend", onRest);
    if (container) {
      events.forEach((name) => container.addEventListener(name, cleanup, { passive: true }));
    }
    // Long enough for the slowest first load measured, and not forever: a
    // map left alone for a minute has settled.
    window.setTimeout(cleanup, 60000);
    return cleanup;
  }

  // ---------------------------------------------------------- setup dialog
  //
  // The integration hands a route step's points to the frontend in the
  // step's description_placeholders, under "blitzer_route" - a key no text
  // refers to. Every Home Assistant page loads this file, so the dialog is
  // watched from here and a native map with the route is put under the
  // step's description.
  //
  // None of what this reaches into is a documented interface:
  // dialog-data-entry-flow in home-assistant's shadow root, the
  // step-flow-form inside it and that element's "step" property. Each step
  // is a new step-flow-form. Everything is guarded, so a dialog laid out
  // differently one day shows its form without the map rather than failing.
  function ensureHaMap() {
    if (customElements.get("ha-map")) return Promise.resolve();
    // ha-map is loaded on demand. A location selector pulls it in, and the
    // dialog has one defined already.
    let probe;
    try {
      const ha = document.querySelector("home-assistant");
      probe = document.createElement("ha-selector");
      probe.hass = ha && ha.hass;
      probe.selector = { location: {} };
      probe.value = { latitude: 0, longitude: 0 };
      probe.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px";
      document.body.appendChild(probe);
    } catch (err) {
      probe = undefined;
    }
    return Promise.race([
      customElements.whenDefined("ha-map"),
      new Promise((resolve) => window.setTimeout(resolve, 8000)),
    ]).then(() => {
      if (probe) probe.remove();
    });
  }


  // Where several routes are on offer, the fastest is drawn as the route
  // and the others beside it in their own colours, each numbered the way
  // the menu numbers them - so "Route 2" can be found on the map.
  const ALTERNATIVE_COLORS = ["#ff9800", "#9c27b0"];

  function drawFlowRoute(map, points, vias, attempt, alternatives) {
    const h = mapHandles(map);
    if (!h) {
      if (attempt < 40) {
        window.setTimeout(() => drawFlowRoute(map, points, vias, attempt + 1, alternatives), 250);
      }
      return;
    }
    const color = routeColor(map);
    const all = [...points];
    (alternatives || []).forEach((route, i) => {
      const tint = ALTERNATIVE_COLORS[i % ALTERNATIVE_COLORS.length];
      h.line(route, { color: tint, width: 4, opacity: 0.8, dashed: true });
      h.label(route[Math.floor(route.length / 2)], String(i + 2), tint);
      all.push(...route);
    });
    drawRouteWith(h, points, color, vias);
    if (alternatives && alternatives.length) {
      h.label(points[Math.floor(points.length / 2)], "1", color);
    }
    h.fit(all);
    // The dialog grows into its size while it opens; fit once more after.
    window.setTimeout(() => h.fit(all), 500);
  }

  async function addFlowMap(form, points, vias, attempt, alternatives) {
    const root = form.shadowRoot;
    const description = root && root.querySelector("ha-markdown");
    if (!description || !description.parentNode) {
      if (attempt < 20) {
        window.setTimeout(() => addFlowMap(form, points, vias, attempt + 1, alternatives), 150);
      }
      return;
    }
    await ensureHaMap();
    if (!customElements.get("ha-map") || !form.isConnected) return;
    const ha = document.querySelector("home-assistant");
    const map = document.createElement("ha-map");
    map.hass = ha && ha.hass;
    map.style.cssText =
      "display:block;height:240px;margin:12px 0 4px;border-radius:8px;overflow:hidden";
    description.parentNode.insertBefore(map, description.nextSibling);
    drawFlowRoute(map, points, vias, 0, alternatives);
  }

  function decorateFlow(dialog) {
    // A form, or the menu that picks between routes - both carry a
    // description, which is where the map goes.
    const form =
      dialog.shadowRoot && dialog.shadowRoot.querySelector("step-flow-form, step-flow-menu");
    if (!form || form.__blitzerRoute) return;
    const placeholders = form.step && form.step.description_placeholders;
    const raw = placeholders && placeholders.blitzer_route;
    if (!raw) return;
    let points;
    try {
      points = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!Array.isArray(points) || points.length < 2) return;
    let vias = [];
    try {
      vias = JSON.parse(placeholders.blitzer_vias || "[]");
    } catch (err) {
      vias = [];
    }
    let alternatives = [];
    try {
      alternatives = JSON.parse(placeholders.blitzer_alternatives || "[]");
    } catch (err) {
      alternatives = [];
    }
    if (!Array.isArray(alternatives)) alternatives = [];
    form.__blitzerRoute = true;
    addFlowMap(form, points, vias, 0, alternatives);
  }

  function watchFlowDialogs() {
    if (window.__blitzerFlowMapWatch) return;
    const ha = document.querySelector("home-assistant");
    if (!ha || !ha.shadowRoot) {
      window.setTimeout(watchFlowDialogs, 1000);
      return;
    }
    window.__blitzerFlowMapWatch = true;
    const watched = new WeakSet();
    const scan = () => {
      for (const dialog of ha.shadowRoot.querySelectorAll("dialog-data-entry-flow")) {
        if (watched.has(dialog) || !dialog.shadowRoot) continue;
        watched.add(dialog);
        new MutationObserver(() => decorateFlow(dialog)).observe(dialog.shadowRoot, {
          childList: true,
          subtree: true,
        });
        decorateFlow(dialog);
      }
    };
    new MutationObserver(scan).observe(ha.shadowRoot, { childList: true, subtree: true });
    scan();
  }

  // The device's model field is what the integration puts the search mode
  // in: "Wegpunkte" for a waypoint route, "Route" for one openrouteservice
  // worked out.
  function isRouteArea(area) {
    return !!area && (area.model === "Wegpunkte" || area.model === "Route");
  }

  function blitzerAreas(hass, wanted) {
    const out = [];
    for (const device of Object.values(hass.devices || {})) {
      const mine = (device.identifiers || []).some((pair) => pair[0] === DOMAIN);
      if (!mine) continue;
      if (wanted && wanted.length && !wanted.includes(device.id)) continue;
      out.push({
        id: device.id,
        name: device.name_by_user || device.name || device.id,
        model: device.model || "",
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }

  function referencePoint(hass, entityId) {
    if (!entityId) return null;
    const state = hass.states[entityId];
    if (!state) return null;
    const lat = Number.parseFloat(state.attributes.latitude);
    const lon = Number.parseFloat(state.attributes.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }

  // The reports of one area, already filtered and sorted. Matching runs over
  // the device id rather than the `area` attribute: the two agree today, but
  // only the id is guaranteed to keep agreeing after a rename.
  //
  // With a reference point set, the distance is recomputed here rather than
  // taken from the entity: the integration measures to the area's own centre,
  // which answers "how far into the area is it", not "how far is it from me".
  function reportsFor(hass, deviceId, filter, reference, sort) {
    const imperial = hass.config && hass.config.unit_system && hass.config.unit_system.length === "mi";
    const rows = [];
    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!entityId.startsWith("geo_location.")) continue;
      const source = state.attributes.source || "";
      if (!source.startsWith(SOURCE_PREFIX)) continue;
      const entry = hass.entities[entityId];
      if (!entry || entry.device_id !== deviceId) continue;
      const isHazard = source.endsWith("_hazards");
      if (filter === "controls" && isHazard) continue;
      if (filter === "hazards" && !isHazard) continue;

      const lat = Number.parseFloat(state.attributes.latitude);
      const lon = Number.parseFloat(state.attributes.longitude);
      let distance = Number.parseFloat(state.state);
      let unit = state.attributes.unit_of_measurement || (imperial ? "mi" : "km");
      if (reference && Number.isFinite(lat) && Number.isFinite(lon)) {
        const km = distanceKm(reference.lat, reference.lon, lat, lon);
        distance = Math.round((imperial ? km * 0.621371 : km) * 10) / 10;
        unit = imperial ? "mi" : "km";
      }
      rows.push({ entityId, state, source, isHazard, distance, unit, lat, lon });
    }
    // Distance is the order the card is built around and the tie-breaker for
    // the other two: two reports of the same minute are still nearer and
    // farther, and leaving that to chance would shuffle the list on every
    // poll.
    const byDistance = (a, b) => {
      const x = Number.isFinite(a.distance) ? a.distance : Infinity;
      const y = Number.isFinite(b.distance) ? b.distance : Infinity;
      return x - y;
    };
    if (sort !== "newest" && sort !== "oldest") return rows.sort(byDistance);
    // Age rather than a timestamp: Blitzer.de dates a report as a time of
    // day or as a date, never as one comparable thing - minutesSince is what
    // makes the two the same kind of number. One reading of the clock for
    // the whole sort, so no two comparisons disagree.
    const now = new Date();
    const ages = new Map(
      rows.map((row) => [row, minutesSince(row.state.attributes.created, now)])
    );
    return rows.sort((a, b) => {
      const x = ages.get(a);
      const y = ages.get(b);
      // A report Blitzer.de dated in neither of its two ways goes last
      // whichever end is asked for: it says nothing about when, and putting
      // it at the front of "newest" would be an answer it never gave.
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1;
        return byDistance(a, b);
      }
      if (x !== y) return sort === "newest" ? x - y : y - x;
      return byDistance(a, b);
    });
  }

  // The entry's own "Anzahl Gesamt" sensor, which is where both halves' fetch
  // moments are readable side by side.
  function totalSensor(hass, deviceId) {
    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!entityId.startsWith("sensor.")) continue;
      if (state.attributes.last_update_controls === undefined) continue;
      const entry = hass.entities[entityId];
      if (entry && entry.device_id === deviceId) return state;
    }
    return null;
  }

  // The two windows that decide what is still new, in minutes: one for
  // controls, one for hazards. They belong to the area rather than to the
  // card - set on the integration, next to the counts they govern - so that
  // three cards of one area cannot disagree about which reports are new, and
  // so that a dashboard's visibility condition and an automation reading the
  // same sensor agree with all three.
  //
  // Read off the total sensor, which reports both whether or not either is
  // switched on. A sensor carrying neither is one from before they existed;
  // only then does the card answer for itself.
  function newWindows(hass, deviceId) {
    const attrs = (totalSensor(hass, deviceId) || {}).attributes || {};
    if (
      attrs.new_minutes_controls === undefined &&
      attrs.new_minutes_hazards === undefined
    ) {
      return { controls: FALLBACK_WINDOW, hazards: FALLBACK_WINDOW };
    }
    const read = (key) => {
      const minutes = Number(attrs[key]);
      return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
    };
    return {
      controls: read("new_minutes_controls"),
      hazards: read("new_minutes_hazards"),
    };
  }

  function updatedText(str, iso) {
    if (!iso) return str.updatedNever;
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return str.updatedNever;
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return str.updatedNow;
    if (mins < 60) return str.updatedMin(mins);
    return str.updatedHours(Math.floor(mins / 60));
  }

  // Blitzer.de's own stamps are either a date or a time of day, never both -
  // see the integration's README. The wording follows which one arrived.
  // Blitzer.de dates an entry the way it displays it: a bare "HH:MM" while it
  // is from today, "dd.mm.yyyy" once it is not. Nothing finer is available, so
  // the freshness check reads that same string.
  //
  // Returns the age in minutes, or null when the string says nothing useful.
  // A date always answers "older than today", which is what it means - the
  // only thing lost is the few minutes after midnight, when a report from
  // 23:5x has already been re-dated.
  // "2026-10-10 09:25:30", as www.blitzer.de stamps a report. The
  // integration folds it into the short form below before the card sees
  // it; this is for a card running against an older integration.
  const FULL_STAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/;

  function minutesSince(created, now) {
    if (typeof created !== "string") return null;
    const full = created.match(FULL_STAMP);
    if (full) {
      const then = new Date(
        Number(full[1]), Number(full[2]) - 1, Number(full[3]), Number(full[4]), Number(full[5])
      );
      return Math.max(0, Math.round((now - then) / 60000));
    }
    const time = created.match(/^(\d{1,2}):(\d{2})$/);
    if (time) {
      const then = new Date(now);
      then.setHours(Number(time[1]), Number(time[2]), 0, 0);
      // A time still ahead of the clock belongs to yesterday - the card can be
      // a minute behind the server that stamped it.
      if (then > now) then.setDate(then.getDate() - 1);
      return Math.max(0, Math.round((now - then) / 60000));
    }
    const date = created.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (date) {
      const then = new Date(Number(date[3]), Number(date[2]) - 1, Number(date[1]));
      return Math.max(0, Math.round((now - then) / 60000));
    }
    return null;
  }

  // Each half against its own window, so that a card can still be marking a
  // camera from this morning once the tailback from half an hour ago has
  // stopped counting.
  function isNewReport(row, windows, now) {
    const minutes = row.isHazard ? windows.hazards : windows.controls;
    if (!(minutes > 0)) return false;
    const age = minutesSince(row.state.attributes.created, now);
    return age !== null && age < minutes;
  }

  // A full stamp shown the short way: the time for today, the date for
  // any other day - what the chips have always read.
  function shortStamp(value) {
    const full = typeof value === "string" && value.match(FULL_STAMP);
    if (!full) return value;
    const now = new Date();
    if (
      Number(full[1]) === now.getFullYear() &&
      Number(full[2]) === now.getMonth() + 1 &&
      Number(full[3]) === now.getDate()
    ) {
      return `${full[4]}:${full[5]}`;
    }
    return `${full[3]}.${full[2]}.${full[1]}`;
  }

  function reportedText(str, created) {
    created = shortStamp(created);
    if (!created) return "";
    return created.includes(".") ? str.reportedOn(created) : str.reportedAt(created);
  }

  // An official closure's period, as chips: since when, and until when or
  // that it has no end yet. The dates arrive as ISO days and are shown the
  // way the page's language writes a date.
  function closureChips(str, attrs) {
    if (!attrs || (!attrs.closure_since && !attrs.closure_until && !attrs.closure_open_end)) {
      return [];
    }
    // Written the way the reported and confirmed chips are - "21.09.2026",
    // Blitzer.de's own form - rather than after the browser's language, so
    // the chips of one entry do not read two ways.
    const day = (iso) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
      return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
    };
    const chips = [];
    const since = day(attrs.closure_since);
    if (since) chips.push(str.closureSince(since));
    if (attrs.closure_open_end) chips.push(str.closureOpenEnd);
    else {
      const until = day(attrs.closure_until);
      if (until) chips.push(str.closureUntil(until));
    }
    return chips;
  }

  // The stretch of road a closure closes comes as a Google-encoded polyline
  // (five decimals), the way the endpoint sends it.
  function decodePolyline(encoded) {
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    while (index < encoded.length) {
      for (const which of [0, 1]) {
        let shift = 0;
        let result = 0;
        let byte;
        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20);
        const delta = result & 1 ? ~(result >> 1) : result >> 1;
        if (which === 0) lat += delta;
        else lng += delta;
      }
      points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
  }

  // The band's colours: Blitzer.de's own dark red for a closure, with a
  // white dashed centre the way its map stripes them.
  const CLOSURE_COLOR = "#b71c1c";

  // Blitzer.de dates a confirmation the same way it dates a report: a bare
  // time while it is from today, a date once it is not. "01.01.1970" is what
  // it puts on something that was never community-confirmed at all - a fixed
  // installation, say - and means "no confirmation" rather than a date.
  function confirmedText(str, confirmed) {
    confirmed = shortStamp(confirmed);
    if (!confirmed || confirmed === NEVER_CONFIRMED) return "";
    return confirmed.includes(".") ? str.confirmedOn(confirmed) : str.confirmedAt(confirmed);
  }

  // The confirmation count as Blitzer.de's own map draws it: three stars,
  // filled as far as the count reaches. Capped at three the way its map caps
  // them - one control in the test data reported 16.
  //
  // Three kinds of report have no stars at all, because for them the number
  // is not a community rating: a fixed installation is put up by whoever
  // operates it, an archived record's count is a leftover from when it was
  // still live, and a police report is an official bulletin rather than a
  // sighting. Written as an exclusion, so a hazard type Blitzer.de adds later
  // is rated rather than silently left blank.
  // Drawn here rather than fetched as Blitzer.de's own two star images. Those
  // are flat pictures: a colour can only be forced onto them with a filter,
  // which is a different colour per star and never the one that was asked
  // for. The same two shapes as a path take `fill: currentColor` and follow
  // whatever colour the element is given.
  const STAR_PATHS = {
    full: "M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z",
    empty:
      "M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.96L22,9.24Z",
  };

  function starsHtml(row, config) {
    if (UNRATED_TYPES.includes(row.state.attributes.type)) return "";
    const filled = Math.min(Number.parseInt(row.state.attributes.counter, 10) || 0, 3);
    const style = [];
    if (config && config.stars_size) style.push(`font-size: ${config.stars_size}`);
    if (config && config.stars_color) style.push(`color: ${config.stars_color}`);
    const star = (which) =>
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATHS[which]}"/></svg>`;
    return `<span class="stars" style="${escapeHtml(style.join("; "))}">${star("full").repeat(
      filled
    )}${star("empty").repeat(3 - filled)}</span>`;
  }

  // Changing any of this is what a re-render actually depends on. Every other
  // state update in the system leaves the card's DOM - and whatever the
  // person is mid-interaction with - alone.
  function signature(hass, deviceId, reference) {
    if (!deviceId) return "none";
    const parts = [];
    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!entityId.startsWith("geo_location.") && !entityId.startsWith("sensor.")) continue;
      const entry = hass.entities[entityId];
      if (!entry || entry.device_id !== deviceId) continue;
      parts.push(`${entityId}:${state.state}:${state.last_updated}`);
    }
    // A moving reference point changes every distance on the card.
    if (reference && hass.states[reference]) {
      const ref = hass.states[reference];
      parts.push(`ref:${ref.attributes.latitude},${ref.attributes.longitude}`);
    }
    return parts.sort().join("|");
  }

  // One element's Layout -> General settings as an inline style. Only what has
  // actually been set is written, so an untouched card keeps the theme's own
  // look rather than a frozen copy of today's defaults. `prefix` is the
  // element's own config prefix - "title", "no_reports".
  // How many minutes one report costs. The integration works this out the
  // way Blitzer.de's own map does - ceil(delay / 60) - and only reports it
  // on the types that describe a queue, so anything without it simply
  // costs nothing (see _tailback_figures in geo_location.py).
  function delayMinutes(row) {
    const raw = row && row.state && row.state.attributes ? row.state.attributes.delay_minutes : null;
    const minutes = Number.parseInt(raw, 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  }

  function elementStyle(config, prefix) {
    const parts = [];
    const color = config[`${prefix}_color`];
    const size = config[`${prefix}_font_size`];
    const spacing = config[`${prefix}_letter_spacing`];
    if (color) parts.push(`color: ${color}`);
    if (size) parts.push(`font-size: ${size}`);
    if (config[`${prefix}_bold`]) parts.push("font-weight: 700");
    if (config[`${prefix}_italic`]) parts.push("font-style: italic");
    if (config[`${prefix}_uppercase`]) parts.push("text-transform: uppercase");
    if (config[`${prefix}_underline`]) parts.push("text-decoration: underline");
    if (spacing) parts.push(`letter-spacing: ${spacing}`);
    // Only the elements that declare a background carry these keys; for the
    // others both reads are undefined and nothing is written.
    if (config[`${prefix}_background`] === false) {
      parts.push("background: none");
    } else if (config[`${prefix}_background_color`]) {
      parts.push(`background: ${config[`${prefix}_background_color`]}`);
    }
    return parts.join("; ");
  }

  // What to overrule inside one map marker, or "" while both parts are kept.
  //
  // Home Assistant draws every marker as a coloured ring on a filled disc with
  // the entity picture in the middle (ha-entity-marker's own ".marker"). The
  // ring keeps its width when only its colour goes, so switching it off moves
  // nothing on the map - the symbols stay exactly where they were.
  function markerCss(config) {
    const parts = [];
    if (config.map_marker_border === false) parts.push("border-color: transparent !important;");
    if (config.map_marker_background === false) parts.push("background: none !important;");
    return parts.length ? `.marker { ${parts.join(" ")} }` : "";
  }

  // The map's cluster discs - the ones it gathers nearby reports into, with
  // the count on them - as --blitzer-cluster-* custom properties, the way
  // every other element of this card is dressed. Home Assistant draws each
  // as a filled disc with a wider ring of the same colour at a fifth of its
  // opacity, and the count on it in its text colour; every fallback here is
  // Home Assistant's own declaration, so nothing changes until a property
  // is set. The ring follows the disc, so a recoloured disc still looks like
  // Home Assistant's. The rule lands inside the map's own shadow root, which
  // the card's stylesheet cannot reach - but the properties do: a custom
  // property set on the map card, by the editor or by a theme, is inherited
  // straight through.
  const CLUSTER_CSS = [
    ".marker-cluster div {",
    "  background-color: var(--blitzer-cluster-background, var(--primary-color)) !important;",
    "  border-color: color-mix(in srgb, var(--blitzer-cluster-background, var(--primary-color)) 20%, transparent) !important;",
    "  color: var(--blitzer-cluster-color, var(--text-primary-color)) !important;",
    "  font-size: var(--blitzer-cluster-font-size, var(--ha-font-size-m)) !important;",
    "  font-weight: var(--blitzer-cluster-font-weight, normal) !important;",
    "  font-style: var(--blitzer-cluster-font-style, normal) !important;",
    "  text-transform: var(--blitzer-cluster-text-transform, none) !important;",
    "  text-decoration: var(--blitzer-cluster-text-decoration, none) !important;",
    "  letter-spacing: var(--blitzer-cluster-letter-spacing, normal) !important;",
    // Centred whatever its size. Home Assistant gives the count a line height
    // of twice its font size and lets the disc centre that line, which holds
    // at the size it ships with and sinks the count as it grows - at 24px it
    // sat 8px low. Centring the count itself instead, at a line height of its
    // own size, puts it in the middle at every size, and at the map's own
    // size within a third of a pixel of where it was.
    "  display: flex !important;",
    "  align-items: center !important;",
    "  justify-content: center !important;",
    "}",
    ".marker-cluster span { line-height: 1 !important; }",
    // From 2026.10 a cluster is a bubble - the first few symbols in a
    // rounded box on a tail, and a "+N" for the rest - rather than a disc
    // with the count. The same properties dress it: the colour lands on the
    // box and its tail, where the disc's used to land, and the count's
    // colour and font on the "+N". Every fallback is again the map's own.
    ".cluster-bubble, .cluster-bubble-tail {",
    "  background: var(--blitzer-cluster-background, var(--card-background-color, #fff)) !important;",
    "}",
    ".cluster-bubble .more {",
    "  color: var(--blitzer-cluster-color, var(--primary-text-color, #212121)) !important;",
    "  font-size: var(--blitzer-cluster-font-size, var(--ha-font-size-s)) !important;",
    "  font-weight: var(--blitzer-cluster-font-weight, var(--ha-font-weight-medium)) !important;",
    "  font-style: var(--blitzer-cluster-font-style, normal) !important;",
    "  text-decoration: var(--blitzer-cluster-text-decoration, none) !important;",
    "}",
    // The disc drawn over a bubble when "Shape of a group" says so - see
    // _styleClusters. Centred on the bubble's anchor: the box's bottom
    // middle plus the 9px the map lifts a floating marker by, which is the
    // cluster's own position. Sized and ringed like the disc the map drew
    // through 2026.9, and dressed by the same properties as that one.
    ".cluster-marker.blitzer-disc { position: relative; filter: none !important; }",
    ".cluster-marker.blitzer-disc .cluster-bubble,",
    ".cluster-marker.blitzer-disc .cluster-bubble-tail { display: none !important; }",
    ".cluster-marker.blitzer-disc::after {",
    "  content: attr(data-blitzer-count);",
    "  position: absolute;",
    "  left: 50%;",
    "  top: 100%;",
    "  transform: translate(-50%, calc(-50% + 9px));",
    "  box-sizing: border-box;",
    "  width: 36px;",
    "  height: 36px;",
    "  border-radius: 50%;",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  background: var(--blitzer-cluster-background, var(--primary-color));",
    "  box-shadow: 0 0 0 5px color-mix(in srgb, var(--blitzer-cluster-background, var(--primary-color)) 20%, transparent);",
    "  color: var(--blitzer-cluster-color, var(--text-primary-color));",
    "  font-size: var(--blitzer-cluster-font-size, var(--ha-font-size-m));",
    "  font-weight: var(--blitzer-cluster-font-weight, normal);",
    "  font-style: var(--blitzer-cluster-font-style, normal);",
    "  text-decoration: var(--blitzer-cluster-text-decoration, none);",
    "  line-height: 1;",
    "  cursor: pointer;",
    "}",
  ].join("\n");

  // Whether this Home Assistant's map card knows the "cluster" option -
  // 2026.10 is where it arrived. A version that cannot be read (an odd build,
  // a missing field) counts as new enough: better a switch that may do
  // nothing than one greyed out for no reason anyone can check.
  function mapClusterSwitchable(hass) {
    return haAtLeast(hass, 2026, 10);
  }

  // Whether this Home Assistant is the given release or later. A version
  // that cannot be read counts as new.
  function haAtLeast(hass, year, month) {
    const m = /^(\d+)\.(\d+)/.exec(String((hass && hass.config && hass.config.version) || ""));
    if (!m) return true;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return y > year || (y === year && mo >= month);
  }

  // What the editor's cluster settings put into those properties. Only the
  // ones set: an unset one is removed again, so a theme's value shows
  // through the moment the card's own is cleared.
  function clusterVars(config) {
    return {
      "--blitzer-cluster-background": config.cluster_color || "",
      "--blitzer-cluster-color": config.cluster_text_color || "",
      "--blitzer-cluster-font-size": config.cluster_font_size || "",
      "--blitzer-cluster-font-weight": config.cluster_bold ? "700" : "",
      "--blitzer-cluster-font-style": config.cluster_italic ? "italic" : "",
      "--blitzer-cluster-text-decoration": config.cluster_underline ? "underline" : "",
    };
  }

  // The subtitle line's icon has a colour and a size of its own, so it can be
  // played down against the words or picked out from them. Empty leaves both
  // to the stylesheet, where the icon takes the line's colour and exactly the
  // height of one of its capitals.
  // How much of an MDI icon's 24-unit box its drawing actually fills, and how
  // much empty space is left under it. Read off the shape itself in viewBox
  // units, so the answer is the same whatever size the icon is drawn at, and
  // cached per icon name - it never changes for a given icon.
  //
  // Worth measuring because it differs a lot: mdi:map-marker-radius fills 88%
  // of its box, mdi:information-outline 83%, mdi:check only 56%, and the
  // padding above and below is often uneven. Sizing the box alone would
  // therefore leave every icon a different height on screen next to the same
  // text, which is exactly the mismatch this is here to remove.
  const ICON_INK = new Map();

  function iconInk(el) {
    // The attribute, not the property: the head is rebuilt with innerHTML, so
    // on the first look the custom element has not been upgraded yet and
    // el.icon is still undefined. Keying the cache off that missed it every
    // redraw and fell through to the slow retry below - which is what made
    // the icon lag a size behind while somebody was typing one in.
    const name = el.getAttribute("icon") || el.icon;
    if (ICON_INK.has(name)) return ICON_INK.get(name);
    try {
      const inner = el.shadowRoot && el.shadowRoot.querySelector("ha-svg-icon");
      const svg = inner && inner.shadowRoot && inner.shadowRoot.querySelector("svg");
      if (!svg) return null;
      const view = Number((svg.getAttribute("viewBox") || "0 0 24 24").split(/\s+/)[3]) || 24;
      const box = svg.getBBox();
      if (!(box.height > 0)) return null;
      const ink = { fill: box.height / view, below: (view - (box.y + box.height)) / view };
      ICON_INK.set(name, ink);
      return ink;
    } catch (err) {
      // A shape we cannot measure keeps the stylesheet's plain cap-high box.
      return null;
    }
  }

  // Colour and size of one element's leading icon, by that element's prefix.
  //
  // The size is a font size, not a box size. The stylesheet sizes the icon at
  // one cap height of its own font, so setting this to what the line is set
  // to gives an icon exactly as tall as the line's capitals - which is what
  // "14px and 14px" is asking for. Writing the box directly instead would
  // make a 14px icon 4px taller than a 14px capital.
  function leadIconStyle(config, prefix) {
    const parts = [];
    const color = config[`${prefix}_icon_color`];
    const size = config[`${prefix}_icon_size`];
    if (color) parts.push(`color: ${color}`);
    if (size) parts.push(`font-size: ${size}`);
    return parts.join("; ");
  }

  // The minimal line's own symbol. Not the leading icon above: that one is
  // sized to a capital of the text it opens, which is what a line of prose
  // wants. Here the symbol stands beside a number twice the size of the word
  // under it, in a row that is centred rather than sitting on a baseline -
  // so it keeps the stylesheet's own box unless a size is asked for.
  function miniIconHtml(config, prefix) {
    const name = config[`${prefix}_icon`];
    if (!name) return "";
    const parts = [];
    const colour = config[`${prefix}_icon_color`];
    const size = config[`${prefix}_icon_size`];
    if (colour) parts.push(`color: ${colour}`);
    if (size) parts.push(`--mdc-icon-size: ${size}`, `width: ${size}`, `height: ${size}`);
    return `<ha-icon icon="${escapeHtml(name)}" style="${escapeHtml(parts.join("; "))}"></ha-icon>`;
  }

  // The markup for that icon, or "" when the element has none.
  function leadIconHtml(config, prefix) {
    const name = config[`${prefix}_icon`];
    if (!name) return "";
    return `<ha-icon class="fit-icon" icon="${escapeHtml(name)}" style="${escapeHtml(
      leadIconStyle(config, prefix)
    )}"></ha-icon>`;
  }

  // One of Home Assistant's own tap actions, carried out. Written here
  // rather than taken from a helper library because the card bundles
  // nothing: this is the whole of what the action selector can produce.
  //
  // Returns false for "there is no action here", which is what leaves the
  // card free to do its own thing instead - opening the pop-up.
  function runAction(node, hass, action, fallbackEntity) {
    if (!action || !action.action || action.action === "default") return false;
    switch (action.action) {
      case "none":
        return true;
      case "more-info":
      case "toggle": {
        // Neither says which entity when it is the card as a whole being
        // tapped, so the area's own total is what they fall back to.
        const entityId = action.entity || fallbackEntity;
        if (!entityId) return true;
        if (action.action === "toggle") {
          hass.callService("homeassistant", "toggle", { entity_id: entityId });
          return true;
        }
        node.dispatchEvent(
          new CustomEvent("hass-more-info", {
            detail: { entityId },
            bubbles: true,
            composed: true,
          })
        );
        return true;
      }
      case "navigate": {
        if (!action.navigation_path) return true;
        // The same two steps Home Assistant's own navigate() takes: change
        // the address, then tell the frontend it changed. Without the second
        // the address bar moves and the page does not.
        window.history.pushState(null, "", action.navigation_path);
        window.dispatchEvent(
          new CustomEvent("location-changed", { detail: { replace: false } })
        );
        return true;
      }
      case "url": {
        if (action.url_path) window.open(action.url_path, "_blank", "noopener");
        return true;
      }
      case "perform-action":
      case "call-service": {
        // Named "service" before the 2024 rename and "perform_action" after;
        // the selector writes whichever this frontend uses.
        const name = action.perform_action || action.service;
        if (!name || !name.includes(".")) return true;
        const [domain, service] = name.split(".", 2);
        hass.callService(
          domain,
          service,
          action.data || action.service_data || {},
          action.target
        );
        return true;
      }
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------ card
  class BlitzerCard extends HTMLElement {
    setConfig(config) {
      this._config = defaultConfig(config);
      this._filter = this._config.filter;
      this._onlyNew = this._config.only_new === true;
      this._onlyDelay = false;
      this._highlight = null;
      this._centred = false;
      this._newRows = new Set();
      this._delayRows = new Set();
      this._area = undefined;
      this._signature = undefined;
      this._mapKey = undefined;
      this._bounds = undefined;
      this._mapFitted = false;
      // Folded until someone asks otherwise. Reset here rather than on every
      // draw, so a list opened by hand stays open through the next poll.
      this._expanded = false;
      this._built = false;
      this._render();
    }

    set hass(hass) {
      const previous = this._hass;
      this._hass = hass;
      if (!this._config) return;
      // The embedded map keeps its own view state (pan, zoom, open popups),
      // so it is handed every hass even when nothing else needs redrawing.
      if (this._map) this._map.hass = hass;
      const langChanged = !previous || previous.language !== hass.language;
      const sig = signature(hass, this._areaId(), this._referenceEntity());
      if (this._built && !langChanged && sig === this._signature) return;
      this._signature = sig;
      this._render();
    }

    getCardSize() {
      if (!this._config) return 3;
      if (this._layout === "minimal") return 1;
      // What is actually drawn, not what is held: a folded list is as tall
      // as its fold.
      const rows = this._rows
        ? this._foldable && !this._expanded
          ? this._foldAt
          : this._rows.length
        : 3;
      return 2 + (this._wantsMap ? 4 : 0) + Math.min(rows, 8);
    }

    // What sizes the card can be given in a sections view. Answering at all
    // is what tells the layout editor that the card can be resized - without
    // it, it says so and offers only the coarse old sizing. The numbers are
    // columns of twelve and rows of 56px, and each format asks for the shape
    // it is: a tall stack, a wide pair of halves, or a single line.
    getGridOptions() {
      if (this._layout === "minimal") {
        return { columns: 6, rows: 1, min_columns: 3, min_rows: 1, max_rows: 2 };
      }
      if (this._layout === "landscape") {
        return { columns: 12, rows: 6, min_columns: 6, min_rows: 3 };
      }
      // With a map to fit above the list, the smallest useful card is taller
      // than one that is all list.
      return { columns: 12, rows: "auto", min_columns: 4, min_rows: this._wantsMap ? 4 : 2 };
    }

    static getConfigElement() {
      return document.createElement(EDITOR_TAG);
    }

    // Deliberately bare: defaultConfig fills the rest in on load, and writing
    // it all out would bury the two lines that actually say something.
    static getStubConfig() {
      return {};
    }

    // Which area is on screen. The pick is remembered per browser rather than
    // in the dashboard, because switching it is a private act - one person
    // looking at their commute must not repoint the card for everyone else.
    _areaId() {
      const areas = this._hass ? blitzerAreas(this._hass, this._config.areas) : [];
      if (!areas.length) return null;
      if (this._area && areas.some((a) => a.id === this._area)) return this._area;
      const stored = this._storage("area");
      if (stored && areas.some((a) => a.id === stored)) return stored;
      return areas[0].id;
    }

    _storageKey(what) {
      const scope = (this._config.areas || []).join(",") || "all";
      return `blitzer-card:${scope}:${what}`;
    }

    _storage(what, value) {
      try {
        if (value === undefined) return window.localStorage.getItem(this._storageKey(what));
        window.localStorage.setItem(this._storageKey(what), value);
      } catch (err) {
        // Private windows and "block site data" both throw here. Losing the
        // remembered pick is not worth breaking the card over.
      }
      return null;
    }

    // The skeleton is built once and then only its parts are refilled. The
    // map in the middle has to survive a redraw: recreating it would throw
    // away its pan and zoom and refetch every tile each time a report moves.
    _skeleton() {
      if (this._root) return;
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `
        <style>@layer blitzer-card { ${STYLE} }
               @layer blitzer-vars { ${variableCss()} }</style>
        <ha-card>
          <div class="head"></div>
          <div class="split">
            <div class="mapwrap"></div>
            <div class="listwrap"></div>
          </div>
          <div class="mini" hidden></div>
          <dialog class="pop">
            <div class="pop-head">
              <span class="pop-title"></span>
              <button type="button" class="pop-close">✕</button>
            </div>
            <div class="pop-traffic"></div>
            <div class="pop-body">
              <div class="pop-map"></div>
              <div class="pop-list"></div>
            </div>
          </dialog>
        </ha-card>`;
      this._root = this.shadowRoot.querySelector("ha-card");
      this._headEl = this._root.querySelector(".head");
      this._splitEl = this._root.querySelector(".split");
      this._mapEl = this._root.querySelector(".mapwrap");
      this._listEl = this._root.querySelector(".listwrap");
      this._miniEl = this._root.querySelector(".mini");
      this._popEl = this._root.querySelector(".pop");
      this._popEl.querySelector(".pop-close").addEventListener("click", () => this._popEl.close());
      // The dialog element itself fills the backdrop, so a click that lands
      // on it rather than on the panel inside is a click outside.
      this._popEl.addEventListener("click", (ev) => {
        if (ev.target === this._popEl) this._popEl.close();
      });
      // A map nobody is looking at should not go on fetching tiles. Watched on
      // the attribute rather than the "close" event, which does not reach us
      // here whichever way the dialog is closed.
      new MutationObserver(() => {
        if (!this._popEl.open) this._closePopMap();
      }).observe(this._popEl, { attributes: true, attributeFilter: ["open"] });
    }

    get _layout() {
      return (this._config && this._config.layout) || "portrait";
    }

    // What the card actually draws. The minimal format is one line and a
    // pop-up, so neither the map nor the list is drawn there, whatever their
    // own switches say - and everything hanging off them goes quiet with them.
    get _wantsMap() {
      return this._layout !== "minimal" && this._config.show_map !== false;
    }

    get _wantsList() {
      return this._layout !== "minimal" && this._config.show_list !== false;
    }

    // What a tap on the minimal line is configured to do, or nothing - in
    // which case the line does what it has always done and opens the pop-up.
    get _miniTapAction() {
      const action = this._config.mini_tap_action;
      return action && action.action && action.action !== "default" ? action : null;
    }

    // How many entries stand before the fold. A number typed to nothing, or
    // to something that is not one, folds after three rather than after
    // none - a list of no entries and a chevron says nothing at all.
    get _foldAt() {
      const many = Number.parseInt(this._config.collapse_after, 10);
      return Number.isFinite(many) && many > 0 ? many : 3;
    }

    // Whether this list folds at all: asked for, in the one format that can
    // grow downwards, and with more entries than the fold would leave
    // standing. Without the last condition a full list would carry a chevron
    // that opens nothing.
    get _foldable() {
      return (
        this._layout === "portrait" &&
        this._config.collapse_list === true &&
        (this._rows || []).length > this._foldAt
      );
    }

    get _following() {
      return !!(this._wantsMap && this._config.follow_map);
    }

    // The embedded map is listened to for two reasons: the list follows what
    // it shows, and distances are measured from where it is centred. Either
    // one is enough, and either one means a pan must not be undone by a refit.
    // Whether the view belongs to whoever is looking - because they panned
    // it, or clicked an entry to aim it. The card must not refit it then.
    get _keepsView() {
      return this._watchesMap || this._centred === true;
    }

    // Puts one report in the middle of the map and goes in close. Returns
    // false when there is no map to aim, so the click can fall back to the
    // details dialog.
    _focusMap(row) {
      if (!row || !this._handles) return false;
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
      try {
        // Aimed on purpose: the watch that keeps the route in view after its
        // first fit must not pull the map straight back.
        this._endRouteWatch("_routeSettle");
        this._handles.zoomTo(row.lat, row.lon, FOCUS_ZOOM);
      } catch (err) {
        return false;
      }
      this._centred = true;
      return true;
    }

    get _watchesMap() {
      return !!(
        this._wantsMap &&
        (this._config.follow_map || this._config.reference_mode === "map")
      );
    }

    // The entity distances are measured from, and only in the mode that
    // actually uses one - the other two must not redraw the card every time
    // some leftover tracker moves.
    _referenceEntity() {
      return this._config.reference_mode === "entity" ? this._config.reference : "";
    }

    // Where distances are measured from, or null for the integration's own
    // figure. The map's centre is only known once the map has reported it;
    // until then, and with the map switched off, this falls back to that
    // same figure rather than to no distance at all.
    _referencePoint() {
      if (this._config.reference_mode === "map") return this._mapCentre || null;
      return referencePoint(this._hass, this._referenceEntity());
    }

    _render() {
      if (!this._hass || !this._config) return;
      this._skeleton();
      const str = t(this._hass);
      const areas = blitzerAreas(this._hass, this._config.areas);

      if (!areas.length) {
        this._headEl.innerHTML = "";
        this._mapEl.innerHTML = "";
        this._listEl.innerHTML = `<div class="empty">${str.noAreas}</div>`;
        this._built = true;
        return;
      }

      const areaId = this._areaId();
      const area = areas.find((a) => a.id === areaId);
      // On a route the integration's figure is the way along the route from
      // its start, and that is what a route's markers show whatever is
      // picked under "Measure distance from": a straight line from the map's
      // centre says nothing about where on the trip a report is.
      const reference = isRouteArea(area) ? null : this._referencePoint();
      const all = reportsFor(this._hass, areaId, this._filter, reference, this._config.sort);
      this._allRows = all;
      this._total = all.length;
      // A highlight lives only as long as the report it points at.
      if (this._highlight && !all.some((r) => r.entityId === this._highlight)) {
        this._highlight = null;
      }

      // "List follows the map" narrows by what is visible; otherwise every
      // report of this area is a candidate and only `max` trims it.
      let pool = all;
      if (this._following && this._bounds) {
        pool = all.filter((r) => this._inBounds(r));
      }

      // Worked out once per redraw, off one clock reading, so the badge and
      // the row markers can never disagree about what is still new. Counted
      // before `max` trims anything: the badge is what one clicks to see the
      // new ones, so it must not hide a report the click would reveal.
      const now = new Date();
      // Switched off here rather than inside the check, so that "the card
      // does not mark" and "this half has no window" are the same thing to
      // everything downstream.
      const windows =
        this._config.show_new === false
          ? { controls: 0, hazards: 0 }
          : newWindows(this._hass, areaId);
      this._newRows = new Set(
        pool.filter((row) => isNewReport(row, windows, now)).map((r) => r.entityId)
      );
      // The jams that say what they cost, and what they cost together. Off
      // the same pool as the badge above, so both numbers answer for the
      // same reports - what is on this card, and while the list follows the
      // map, what is on screen.
      this._delayRows = new Set();
      this._delayTotal = 0;
      for (const row of this._config.show_delay === false ? [] : pool) {
        const minutes = delayMinutes(row);
        if (!minutes) continue;
        this._delayRows.add(row.entityId);
        this._delayTotal += minutes;
      }
      // Nothing left that costs time - the badge that would switch this back
      // off has gone with it, the same way "only new" lets go of itself.
      if (this._onlyDelay && !this._delayRows.size) this._onlyDelay = false;
      // Nothing new left to show - the badge that would switch this back off
      // has gone with it, so the card lets go of the filter itself rather
      // than stranding whoever set it on an empty list. Not when the card was
      // configured this way, though: showing everything would then be the
      // opposite of what the dashboard asked for.
      if (this._onlyNew && !this._newRows.size && this._config.only_new !== true) {
        this._onlyNew = false;
      }

      // One at a time: each badge narrows the card to what it counted, and
      // two narrowings at once would leave a card that can be empty with
      // both badges still standing on it.
      const candidates = this._onlyNew
        ? pool.filter((r) => this._newRows.has(r.entityId))
        : this._onlyDelay
          ? pool.filter((r) => this._delayRows.has(r.entityId))
          : pool;
      this._inView = this._following && this._bounds ? candidates.length : null;
      const limit = this._config.show_max ? this._config.max : 0;
      this._rows = limit > 0 ? candidates.slice(0, limit) : candidates;
      // While following, the map shows the whole area rather than the visible
      // slice of it - but "only new" is not about the viewport, so it applies
      // to the map either way.
      this._mapRows = this._following
        ? (this._onlyNew
            ? all.filter((r) => isNewReport(r, windows, now))
            : this._onlyDelay
              ? all.filter((r) => delayMinutes(r) > 0)
              : all)
        : this._rows;

      const minimal = this._layout === "minimal";
      this._root.dataset.layout = this._layout;
      this._applyBackground();
      this._miniEl.hidden = !minimal;
      this._headEl.hidden = minimal;
      this._splitEl.hidden = minimal;
      this._mapEl.hidden = !this._wantsMap;
      this._listEl.hidden = !this._wantsList;

      // _syncMap runs either way: in the minimal format it is what takes the
      // map down again, rather than leaving it fetching tiles out of sight.
      this._syncMap(areaId);
      if (minimal) {
        this._renderMini(str);
        if (this._popEl.open) this._fillPop(str);
        this._built = true;
        return;
      }
      this._renderHead(str, areas, area, areaId);
      this._renderList(str);
      this._built = true;
    }

    // The whole of the minimal format: the name on the left, what is new on
    // the right, and the line itself is the button that opens the rest.
    // The whole of the minimal format: two halves, each a button, each opening
    // the pop-up on exactly what it counts. Halves rather than words in a row,
    // because two numbers that lead somewhere different should look like two
    // places to press - and the right one carries the accent, since what is
    // new is the thing worth interrupting a glance for.
    _renderMini(str) {
      // A half counting nothing is not a place to press: there is no list to
      // show behind it and no map to draw, so it says its zero and stops
      // being a button.
      // A half counting nothing normally leads nowhere and stops being a
      // button. With a tap action set it leads somewhere regardless of the
      // count, so it stays one - and so does the total while the pop-up has
      // a map to show on its own, with the area drawn on it.
      const dead = (value, scope) =>
        !value && !this._miniTapAction && !(scope === "all" && this._popHasEmptyMap());
      // What is written is not always what decides whether there is anything
      // there: the delay part says "+22 min", and a string is never nought.
      const half = (what, scope, prefix, value, label, count = value) => {
        const style = elementStyle(this._config, prefix);
        // The fill goes on a layer of its own rather than on the button, for
        // the same reason the card's background does: an opacity set on the
        // button would take the number and the word down with it.
        const fill = [];
        const colour = this._config[`${prefix}_fill_color`];
        const half = { mini_new: "mini-new", mini_delay: "mini-delay" }[prefix] || "mini-total";
        if (colour) fill.push(`--blitzer-${half}-fill-color: ${colour}`);
        const percent = Number(this._config[`${prefix}_fill_opacity`]);
        if (Number.isFinite(percent) && percent !== 100) {
          fill.push(`--blitzer-${half}-fill-opacity: ${Math.max(0, Math.min(100, percent)) / 100}`);
        }
        // The word belongs to the same half as the number, so whatever is set
        // here reaches both - a colour that stopped at the digits would leave
        // half the half behind. Only the size stays with the number: giving
        // the word the same one would flatten the pair into one run of text,
        // and the difference between them is what makes the number the thing
        // one reads first.
        const wordStyle = style
          .split("; ")
          .filter((part) => !part.startsWith("font-size:"))
          .join("; ");
        return `<button type="button" class="mini-half ${what}${dead(count, scope) ? " empty" : ""}"
                 data-scope="${scope}"${dead(count, scope) ? " disabled" : ""}
                 style="${escapeHtml(fill.join("; "))}">
          ${miniIconHtml(this._config, prefix)}
          <span class="mini-value" style="${escapeHtml(style)}">${escapeHtml(
            String(value)
          )}</span>
          <span class="mini-label" style="${escapeHtml(wordStyle)}">${escapeHtml(
            label
          )}</span>
        </button>`;
      };
      // Each part on its own switch, and none stands in for another: with
      // all of them off the line is empty, which is what three switches set
      // to off asked for.
      const halves = [];
      if (this._config.mini_show_total !== false) {
        halves.push(
          half("total", "all", "mini", (this._allRows || []).length, str.miniLabelTotal)
        );
      }
      if (this._config.show_new !== false) {
        halves.push(
          half(this._newRows.size ? "new" : "new quiet", "new", "mini_new",
               this._newRows.size, str.miniLabelNew)
        );
      }
      // And what those reports cost in time. Drawn at nought too, quiet the
      // way the new part is: a line that gained and lost a third of itself
      // every time a jam cleared would move everything under it each time.
      if (this._config.show_delay !== false) {
        halves.push(
          half(this._delayTotal ? "delay" : "delay quiet", "delay", "mini_delay",
               str.delaySum(this._delayTotal), str.miniLabelDelay, this._delayTotal)
        );
      }
      // Three parts need the room two had; the words go first (see .mini.three).
      this._miniEl.classList.toggle("three", halves.length > 2);
      this._miniEl.innerHTML = halves.join("");
      for (const button of this._miniEl.querySelectorAll(".mini-half")) {
        button.addEventListener("click", () => {
          const sensor = totalSensor(this._hass, this._areaId());
          if (runAction(this, this._hass, this._miniTapAction, sensor && sensor.entity_id)) return;
          this._openPop(button.dataset.scope);
        });
      }
    }

    // The card's own background, as four custom properties the stylesheet
    // reads. Cleared first and only set while it is switched on, so turning
    // it off gives the theme its card back rather than leaving the last
    // colour behind.
    //
    // Which surface carries it depends on the format. The minimal format is
    // one line high - there is no room there for a picture, and a colour
    // behind two numbers is not what anyone means by a card background. Its
    // pop-up is the surface that has the room, so that is where it goes.
    // Set on the one and cleared from the other, never both: the pop-up sits
    // inside the card, so a value left on the card would be inherited into
    // it and drawn twice over.
    _applyBackground() {
      const card = this._layout === "minimal" ? this._popEl : this._root;
      const other = this._layout === "minimal" ? this._root : this._popEl;
      for (const surface of [card, other]) {
        if (!surface) continue;
        for (const name of ["color", "image", "size", "repeat", "opacity"]) {
          surface.style.removeProperty(`--blitzer-card-background-${name}`);
        }
      }
      if (!card || this._config.card_background !== true) return;
      if (this._config.card_background_color) {
        card.style.setProperty("--blitzer-card-background-color", this._config.card_background_color);
      }
      if (this._config.card_background_image) {
        card.style.setProperty(
          "--blitzer-card-background-image",
          `url("${this._config.card_background_image.replace(/"/g, "%22")}")`
        );
      }
      // Two properties per choice: how the image is scaled, and whether it
      // is laid out once or tiled. "Actual size" and "Repeat" differ in
      // nothing else.
      const fits = {
        cover: ["cover", "no-repeat"],
        contain: ["contain", "no-repeat"],
        auto: ["auto", "no-repeat"],
        repeat: ["auto", "repeat"],
      };
      const [size, repeat] = fits[this._config.card_background_size] || fits.cover;
      card.style.setProperty("--blitzer-card-background-size", size);
      card.style.setProperty("--blitzer-card-background-repeat", repeat);
      const percent = Number(this._config.card_background_opacity);
      const opacity = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 100;
      card.style.setProperty("--blitzer-card-background-opacity", String(opacity / 100));
    }

    // Fetch this area again, now. Which half is fetched follows the filter:
    // a card showing only hazards has no business spending a request on
    // cameras, and each half costs one of its own. Both at once go through
    // the combined action, which fetches them in one pass - on a route, one
    // request per point rather than one per point per half.
    //
    // The action is addressed to the config entry rather than to the device,
    // because that is what the integration registered it for. The device
    // knows its entry, so the card does not have to be told.
    async _refresh(button, areaId) {
      const device = this._hass && this._hass.devices && this._hass.devices[areaId];
      const entry = device && (device.config_entries || [])[0];
      if (!entry || button.disabled) return;
      const service =
        this._filter === "controls"
          ? "refresh_controls"
          : this._filter === "hazards"
            ? "refresh_hazards"
            : "refresh";
      button.disabled = true;
      button.classList.add("spinning");
      try {
        await this._hass.callService(DOMAIN, service, { config_entry_id: entry });
      } catch (err) {
        console.error("blitzer-card: refresh failed", err);
      } finally {
        // The button belongs to the head that drew it; a poll arriving mid
        // request replaces that head, and this one is then no longer on
        // screen. Guarded rather than assumed, so a redraw cannot leave a
        // button spinning that nobody can see any more.
        if (button.isConnected) {
          button.disabled = false;
          button.classList.remove("spinning");
        }
      }
    }

    _newReports() {
      return (this._allRows || []).filter((r) => this._newRows.has(r.entityId));
    }

    _delayReports() {
      return (this._allRows || []).filter((r) => this._delayRows.has(r.entityId));
    }

    // What the pop-up is about - decided by which of the numbers opened it.
    _popRows() {
      if (this._popScope === "all") return this._allRows || [];
      return this._popScope === "delay" ? this._delayReports() : this._newReports();
    }

    // The reports behind the line: the map on one side, the list on the other,
    // both drawn exactly as the card draws them - so every Layout setting for
    // the map and for a list entry holds in here too.
    _fillPop(str) {
      const rows = this._popRows();
      this._popRowsCache = rows;
      this._popListShown = undefined;
      // The card's own title, and the card's own "Hide" with it: this is the
      // same title shown somewhere else, not a second one.
      const popTitle = this._popEl.querySelector(".pop-title");
      popTitle.textContent =
        this._config.show_title === false ? "" : this._config.title || str.title;
      // The same wording and the same look: Layout -> General settles the
      // card title once, wherever it is shown.
      popTitle.setAttribute("style", elementStyle(this._config, "title"));
      this._popEl.querySelector(".pop-close").title = str.popClose;
      // With one of the two switched off the other has the pop-up to itself,
      // which the narrow layout has to be told - see .pop-body.solo.
      const wantsMap = this._config.show_map !== false;
      const wantsList = this._config.show_list !== false;
      this._popEl.querySelector(".pop-body").classList.toggle("solo", wantsMap !== wantsList);
      this._fillPopTrafficLine();
      this._fillPopList(str);
      this._syncPopMap(rows);
    }

    // The list on its own, so a highlight can redraw it without rebuilding the
    // map beside it.
    _fillPopList(str) {
      // With "List follows the map" on, only what the pop-up's map shows -
      // the same rule as in the card, against this map's viewport.
      const following = !!this._config.follow_map && this._popBounds;
      const rows = (this._popRowsCache || []).filter((row) => !following || this._popInBounds(row));
      const list = this._popEl.querySelector(".pop-list");
      // A move that changed nothing in view redraws nothing: the map's
      // resize echoes as a move too.
      const shown = rows.map((r) => r.entityId).join(",") + "|" + (following ? "f" : "") + "|" + this._highlight;
      if (shown === this._popListShown && list.children.length) return;
      this._popListShown = shown;
      // The card's own list switch answers for this one too - in the minimal
      // format it is the only list there is.
      list.hidden = this._config.show_list === false;
      if (list.hidden) {
        list.innerHTML = "";
        return;
      }
      list.innerHTML = rows.length
        ? `<div class="list${this._config.show_divider === false ? " no-divider" : ""}"
             style="${escapeHtml(dividerStyle(this._config))}">${rows
            .map((row) =>
              rowHtml(row, str, this._newRows.has(row.entityId), this._config,
                      this._highlight === row.entityId, "pop_new")
            )
            .join("")}</div>`
        : `<div class="empty" style="${escapeHtml(elementStyle(this._config, "no_reports"))}">${escapeHtml(
            this._config.no_reports_text ||
              (following && (this._popRowsCache || []).length
                ? str.nothingInView
                : this._popScope === "all"
                  ? str.nothing
                  : this._popScope === "delay"
                    ? str.noDelay
                    : str.noNew)
          )}</div>`;
      this._fitIcons();
      // The same click as in the card: it aims the map at the report, and
      // opens Home Assistant's details dialog where there is no map to aim.
      for (const el of list.querySelectorAll(".row")) {
        el.addEventListener("click", () => {
          const row = rows.find((r) => r.entityId === el.dataset.entity);
          if (this._config.center_on_click !== false && this._focusPopMap(row)) return;
          this.dispatchEvent(
            new CustomEvent("hass-more-info", {
              detail: { entityId: el.dataset.entity },
              bubbles: true,
              composed: true,
            })
          );
        });
      }
    }

    _focusPopMap(row) {
      if (!row || !this._popHandles) return false;
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
      try {
        this._endRouteWatch("_popRouteSettle");
        this._popHandles.zoomTo(row.lat, row.lon, FOCUS_ZOOM);
      } catch (err) {
        return false;
      }
      return true;
    }

    // The pop-up's own map. A second one of Home Assistant's map cards, built
    // and taken down with the pop-up rather than kept running out of sight.
    async _syncPopMap(rows) {
      const wrap = this._popEl.querySelector(".pop-map");
      const wanted = this._config.show_map !== false;
      wrap.hidden = !wanted;
      const ids = wanted ? rows.map((r) => r.entityId).sort() : [];
      const key = ids.join(",") + "|" + (this._config.map_cluster !== false) + "|" + (this._config.map_always !== false);
      if (!wanted || (!ids.length && this._config.map_always === false)) {
        wrap.innerHTML = "";
        this._popMap = undefined;
        this._popMapKey = key;
        return;
      }
      if (key === this._popMapKey && this._popMap) {
        this._popMap.hass = this._hass;
        this._styleMap(this._popMap);
        return;
      }
      this._popMapKey = key;
      const helpers = await window.loadCardHelpers();
      if (this._popMapKey !== key) return;
      // No ratio: the map fills its half of the pop-up.
      const card = await helpers.createCardElement({
        type: "map",
        ...(ids.length ? { entities: ids } : { geo_location_sources: [] }),
        auto_fit: true,
        ...(this._config.map_cluster === false ? { cluster: false } : {}),
      });
      if (this._popMapKey !== key) return;
      card.hass = this._hass;
      wrap.innerHTML = "";
      wrap.appendChild(card);
      this._popMap = card;
      this._watchMarkers(card, "_popObserver");
      this._attachPopMap(card);
    }

    // The pop-up map's own grip: a click on a report picks its entry out of
    // the list beside it, a click on the bare map lets it go again. The same
    // two rules as in the card, and switched by the same setting.
    _attachPopMap(card) {
      const tryAttach = (attempt) => {
        if (this._popMap !== card) return;
        const haMap = card.shadowRoot ? card.shadowRoot.querySelector("ha-map") : null;
        const h = mapHandles(haMap);
        if (!h) {
          window.setTimeout(() => tryAttach(attempt + 1), attempt < 40 ? 300 : 2000);
          return;
        }
        this._popHandles = h;
        this._popHaMap = haMap;
        this._paintPopRoute();
        this._paintArea(h, this._popRowsCache, "_popAreaDrawn", "_popAreaSettle");
        this._paintClosures(h, this._popRowsCache, "_popClosuresDrawn");
        this._onPopMove = () => {
          this._scheduleTraffic("pop");
          // The list beside the map follows what the map shows.
          try {
            this._popBounds = { contains: (point) => h.contains(point[0], point[1]) };
          } catch (err) {
            this._popBounds = undefined;
          }
          if (this._config.follow_map && this._hass) this._fillPopList(t(this._hass));
        };
        h.on("moveend", this._onPopMove);
        h.on("zoomend", this._onPopMove);
        this._scheduleTraffic("pop");
        this._onPopMarkerClick = (ev) => {
          if (this._config.map_highlight === false) return;
          const marker = ev.composedPath().find((n) => n && n.tagName === "HA-ENTITY-MARKER");
          const id = marker && (marker.entityId || marker.getAttribute("entity-id"));
          if (!id || !(this._popRowsCache || []).some((r) => r.entityId === id)) return;
          const bubble = marker.closest && marker.closest(".cluster-marker");
          if (bubble && bubble.getAttribute("role") !== "group") return;
          ev.stopPropagation();
          ev.preventDefault();
          this._highlight = this._highlight === id ? null : id;
          this._fillPopList(t(this._hass));
        };
        try {
          haMap.shadowRoot.addEventListener("click", this._onPopMarkerClick, true);
        } catch (err) {
          this._onPopMarkerClick = undefined;
        }
        this._onPopMapClick = () => {
          if (!this._highlight) return;
          this._highlight = null;
          this._fillPopList(t(this._hass));
        };
        if (h.kind === "leaflet") h.on("click", this._onPopMapClick);
        else haMap.addEventListener("map-clicked", this._onPopMapClick);
      };
      tryAttach(0);
    }

    _closePopMap() {
      if (this._popObserver) {
        try {
          this._popObserver.disconnect();
        } catch (err) {
          // Already gone with the map it was watching.
        }
        this._popObserver = undefined;
      }
      const h = this._popHandles;
      if (h && this._onPopMapClick) {
        try {
          if (h.kind === "leaflet") h.off("click", this._onPopMapClick);
          else if (this._popHaMap) this._popHaMap.removeEventListener("map-clicked", this._onPopMapClick);
        } catch (err) {
          // The instance went with the map.
        }
      }
      if (this._popHaMap && this._onPopMarkerClick) {
        try {
          this._popHaMap.shadowRoot.removeEventListener("click", this._onPopMarkerClick, true);
        } catch (err) {
          // Its shadow root went with it.
        }
      }
      if (h && this._onPopMove) {
        try {
          h.off("moveend", this._onPopMove);
          h.off("zoomend", this._onPopMove);
        } catch (err) {
          // The instance went with the map.
        }
      }
      this._onPopMove = undefined;
      this._popBounds = undefined;
      this._popListShown = undefined;
      this._popTrafficAt = undefined;
      this._popTrafficOn = undefined;
      this._endRouteWatch("_popRouteSettle");
      removeRoute(this._popRouteDrawn);
      this._popRouteDrawn = undefined;
      this._removeArea("_popAreaDrawn", "_popAreaSettle");
      this._removeClosures("_popClosuresDrawn");
      this._clearTraffic("pop");
      this._popHandles = undefined;
      this._popHaMap = undefined;
      this._onPopMapClick = undefined;
      this._onPopMarkerClick = undefined;
      const wrap = this._popEl ? this._popEl.querySelector(".pop-map") : null;
      if (wrap) wrap.innerHTML = "";
      this._popMap = undefined;
      this._popMapKey = undefined;
    }

    // Opened by one of the two numbers, and about exactly what that number
    // counted. Nothing opens on nothing: a pop-up that can only say "no
    // reports" is worse than the click doing nothing at all, and the same
    // goes for one with neither the map nor the list switched on.
    _openPop(scope) {
      if (!this._hass) return;
      const wanted = scope === "all" || scope === "delay" ? scope : "new";
      const rows =
        wanted === "all"
          ? this._allRows || []
          : wanted === "delay"
            ? this._delayReports()
            : this._newReports();
      if (!rows.length && !(wanted === "all" && this._popHasEmptyMap())) return;
      if (this._config.show_map === false && this._config.show_list === false) return;
      this._popScope = wanted;
      this._highlight = null;
      this._fillPop(t(this._hass));
      this._popEl.showModal();
    }

    // Whether the pop-up shows a map even with nothing reported: the map
    // switch on, and the map set to stay - see map_always.
    _popHasEmptyMap() {
      return this._config.show_map !== false && this._config.map_always !== false;
    }

    // The pop-up list's counterpart of _inBounds, against the pop-up's own
    // map.
    _popInBounds(row) {
      if (!this._popBounds) return true;
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
      try {
        return this._popBounds.contains([row.lat, row.lon]);
      } catch (err) {
        return true;
      }
    }

    _inBounds(row) {
      if (!this._bounds) return true;
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
      try {
        return this._bounds.contains([row.lat, row.lon]);
      } catch (err) {
        return true;
      }
    }

    _badgeText(str) {
      if (this._inView !== null && this._inView !== undefined) return str.countView(this._rows.length);
      if (this._rows.length < this._total) return str.countOf(this._rows.length, this._total);
      return str.count(this._rows.length);
    }

    _renderHead(str, areas, area, areaId) {
      const sensor = totalSensor(this._hass, areaId);
      const updated = updatedText(str, sensor && sensor.attributes.last_update);
      // The device's model field is what the integration puts the search
      // mode in; "Radius" is also what every entry made before the other two
      // existed carries, which is why it is the fallback rather than a case.
      const mode =
        isRouteArea(area)
          ? str.waypoints
          : area.model === "Tracker"
          ? str.tracker
          : str.radius;
      // Each part on its own switch; with all three off the line goes too,
      // rather than leaving an empty row under the title.
      const subText = this._config.show_sub === false ? "" : [
        this._config.sub_show_area === false ? "" : area.name,
        this._config.sub_show_mode === false ? "" : mode,
        this._config.sub_show_updated === false ? "" : updated,
      ]
        .filter(Boolean)
        .join(" · ");

      // Last on the line that says when the card last looked, because that is
      // the sentence it answers: asking for a fresh look. Drawn even with all
      // three parts of that line switched off - the line is then the button
      // alone, which is still a line worth having.
      const refresh =
        this._config.show_refresh === false || this._config.show_sub === false
          ? ""
          : `<button type="button" class="refresh" data-what="refresh"
                title="${escapeHtml(str.refreshNow)}">${
               leadIconHtml(this._config, "refresh")
             }</button>`;
      this._headEl.innerHTML = `
        <div class="head-left">
          <div class="title">
            ${this._config.show_title === false
              ? ""
              : `<span class="title-text" style="${escapeHtml(elementStyle(this._config, "title"))}">${escapeHtml(this._config.title || str.title)}</span>`}
            ${this._config.show_count !== false && this._rows.length
              ? `<span class="badge" style="${escapeHtml(elementStyle(this._config, "count"))}">${this._badgeText(str)}</span>`
              : ""}
            ${this._newRows.size
              ? `<button type="button" class="badge new" data-what="new-filter"
                    aria-pressed="${this._onlyNew ? "true" : "false"}"
                    title="${escapeHtml(this._onlyNew ? str.newFilterOff : str.newFilterOn)}"
                    style="${escapeHtml(elementStyle(this._config, "new"))}"
                 >${escapeHtml(str.newCount(this._newRows.size))}</button>`
              : ""}
            ${this._delayTotal
              ? `<button type="button" class="badge delay" data-what="delay-filter"
                    aria-pressed="${this._onlyDelay ? "true" : "false"}"
                    title="${escapeHtml(this._onlyDelay ? str.delayFilterOff : str.delayFilterOn)}"
                    style="${escapeHtml(elementStyle(this._config, "delay"))}"
                 >${escapeHtml(str.delaySum(this._delayTotal))}</button>`
              : ""}
          </div>
          ${subText || refresh
            ? `<div class="sub" style="${escapeHtml(elementStyle(this._config, "sub"))}">${
                leadIconHtml(this._config, "sub")
              }<span>${escapeHtml(subText)}</span>${refresh}</div>`
            : ""}
          ${this._trafficLineHtml(str)}
        </div>
        <div class="pickers">
          ${this._config.show_area_picker
            ? selectHtml("area", areas.map((a) => ({ value: a.id, label: a.name })), areaId,
                elementStyle(this._config, "area_select"))
            : ""}
          ${this._config.show_filter_picker
            ? selectHtml("filter", [
                { value: "all", label: str.filterAll },
                { value: "controls", label: str.filterControls },
                { value: "hazards", label: str.filterHazards },
              ], this._filter, elementStyle(this._config, "filter_select"))
            : ""}
        </div>`;

      const refreshButton = this._headEl.querySelector('[data-what="refresh"]');
      if (refreshButton) {
        refreshButton.addEventListener("click", () => this._refresh(refreshButton, areaId));
      }

      // The traffic flow's own switch and refresh. The switch is for the
      // moment - the option under Settings is what offers it at all.
      this._bindTrafficLine(this._headEl, "main");

      const newButton = this._headEl.querySelector('[data-what="new-filter"]');
      if (newButton) {
        newButton.addEventListener("click", () => {
          this._onlyNew = !this._onlyNew;
          if (this._onlyNew) this._onlyDelay = false;
          this._render();
        });
      }

      const delayButton = this._headEl.querySelector('[data-what="delay-filter"]');
      if (delayButton) {
        delayButton.addEventListener("click", () => {
          this._onlyDelay = !this._onlyDelay;
          if (this._onlyDelay) this._onlyNew = false;
          this._render();
        });
      }

      const areaSelect = this._headEl.querySelector('select[data-what="area"]');
      if (areaSelect) {
        areaSelect.addEventListener("change", (ev) => {
          this._area = ev.target.value;
          this._storage("area", this._area);
          // A different area is a different part of the world - whatever the
          // map was showing does not apply to it.
          this._bounds = undefined;
          this._mapFitted = false;
          this._signature = signature(this._hass, this._area, this._referenceEntity());
          this._render();
        });
      }
      const filterSelect = this._headEl.querySelector('select[data-what="filter"]');
      if (filterSelect) {
        filterSelect.addEventListener("change", (ev) => {
          this._filter = ev.target.value;
          this._storage("filter", this._filter);
          this._render();
        });
      }

      this._fitIcons();
    }

    // Sizes the subtitle line's icon so that its drawing - not its box - is
    // exactly one capital high and ends on the same baseline as the text.
    //
    // The stylesheet gets the box right on its own (see ha-icon.fit-icon), but a
    // box is not what one sees: every MDI icon leaves a different amount of
    // room around its drawing, so a cap-high box leaves a drawing that is
    // shorter than the capitals by a different amount per icon. This measures
    // that room once per icon and takes it back out.
    //
    // Runs after every redraw, since the font size, the icon and its own size
    // can all change underneath it, and retries while ha-icon is still
    // fetching the shape - it resolves the name asynchronously.
    _fitIcons(attempt = 0) {
      const icons = this._root ? [...this._root.querySelectorAll("ha-icon.fit-icon")] : [];
      if (!icons.length) return;
      let waiting = false;
      for (const icon of icons) if (!this._fitOneIcon(icon)) waiting = true;
      if (waiting && attempt < 20) {
        // The first few looks are a frame apart, so the one time this really
        // has to wait is not a visible jump either. After that the ratio is
        // cached and the whole thing runs straight through.
        window.setTimeout(() => this._fitIcons(attempt + 1), attempt < 6 ? 16 : 150);
      }
    }

    // True once this icon has been fitted; false while something it needs is
    // still missing.
    _fitOneIcon(icon) {
      // Two things have to be there before this can be worked out, and
      // neither is on the first look after a redraw: ha-icon resolves its
      // shape asynchronously, and the line has no measurable capital height
      // until it has been laid out. Both wait through the same retry - an
      // earlier version gave up silently on the second one, which is why the
      // icon kept the stylesheet's plain box while its size was being typed.
      const ink = iconInk(icon);
      const cap = ink ? this._capHeight(icon) : 0;
      if (!ink || !(cap > 0)) return false;
      const box = cap / ink.fill;
      icon.style.setProperty("--mdc-icon-size", `${box}px`);
      icon.style.width = `${box}px`;
      icon.style.height = `${box}px`;
      // The box's bottom edge rides the baseline; push it down by the empty
      // strip under the drawing so the drawing itself lands there instead.
      icon.style.transform = `translateY(${ink.below * box}px)`;
      return true;
    }

    // The height of a capital in the icon's own font - measured off a probe
    // rather than guessed at a ratio, because it is a property of the font
    // and follows any size set for the icon.
    _capHeight(icon) {
      try {
        const probe = document.createElement("span");
        probe.style.cssText =
          `position:absolute;visibility:hidden;width:0;height:1cap;font-size:${
            getComputedStyle(icon).fontSize
          }`;
        icon.parentElement.appendChild(probe);
        const cap = probe.getBoundingClientRect().height;
        probe.remove();
        return cap;
      } catch (err) {
        return 0;
      }
    }

    // Home Assistant's own map card, embedded rather than redrawn here. It is
    // maintained, themed and already draws Blitzer.de's symbols.
    //
    // What it is handed depends on which way round the two halves work:
    //
    //   - mirroring (default): exactly the listed reports, so the badge and
    //     the map can never tell two different stories.
    //   - following: every report of the area, because the list is narrowed
    //     by what the map shows - handing it the narrowed set instead would
    //     feed back on itself and collapse to nothing.
    //
    // An existing map is reconfigured rather than rebuilt when only the set of
    // reports changed: rebuilding would throw away its pan and zoom and
    // refetch every tile, which on a one-minute poll would be constant.
    async _syncMap(areaId) {
      if (!this._wantsMap) {
        if (this._map) {
          this._detachMap();
          this._unwatchMarkers();
          this._mapEl.innerHTML = "";
          this._map = undefined;
          this._mapKey = undefined;
        }
        return;
      }

      // Asked first, because it decides how the map is built: a route is
      // fitted to by this card, so Home Assistant's own fit to the markers
      // must not undo it on the next update.
      const route = this._config.map_route === false ? null : await this._routeFor(areaId);
      this._route = route;
      // A new colour or width is repainted in place; only the route itself
      // rebuilds the map, since it decides how the map is fitted.
      const routeStyle = `${this._config.route_color}|${this._config.route_width}`;
      const restyle = this._routeStyle !== routeStyle;
      this._routeStyle = routeStyle;
      const trafficStyle = `${this._config.traffic_width}|${this._config.traffic_opacity}`;
      if (this._trafficStyleSig !== trafficStyle) {
        this._trafficStyleSig = trafficStyle;
        this._restyleTraffic();
      }

      const shown = this._mapRows;
      const ids = (shown || []).map((r) => r.entityId).sort();
      const key =
        `${areaId}|${ids.join(",")}|${this._config.map_aspect_ratio}` +
        `|${this._following}|${this._watchesMap}|${this._layout}|${routeSig(route)}` +
        `|${this._config.map_cluster !== false}|${this._config.map_always !== false}`;
      if (key === this._mapKey && this._map) {
        this._map.hass = this._hass;
        // Hooks can be missing here for reasons other than a view switch -
        // the map card rebuilding its own insides, say. Both of these do
        // nothing when they are already in place.
        if (!this._handles) this._attachMap();
        else if (restyle) {
          this._paintRoute();
          this._paintArea();
        }
        this._watchMarkers();
        this._styleMap();
        this._fitScope();
        this._syncTrafficSwitch();
        return;
      }

      // Nothing to mark and no route to draw: no map - unless the map is
      // to stay regardless, which it does by default, showing the area as
      // it is set up. A route is a reason of its own either way - a short
      // commute is empty most of the day, and the map is what shows the
      // route (#3).
      if (!ids.length && !route && this._config.map_always === false) {
        this._detachMap();
        this._unwatchMarkers();
        this._mapEl.innerHTML = "";
        this._map = undefined;
        this._mapKey = key;
        return;
      }

      const mapConfig = {
        type: "map",
        // Home Assistant's map card refuses an empty entity list but takes a
        // list of geo_location sources, and an empty one of those is a map
        // of nothing - the base the route is painted on. Not this area's
        // own sources: the list is empty because of what the card is set to
        // show ("only new", say, or one half), and the area's markers would
        // reappear on the map regardless of that.
        ...(ids.length ? { entities: ids } : { geo_location_sources: [] }),
        // Only ever said when it is off: the map groups by default, and a
        // version from before the option simply does not see the key.
        ...(this._config.map_cluster === false ? { cluster: false } : {}),
        // While the card is listening to the map - following it, or measuring
        // from its centre - refitting on every data update would undo the pan
        // the person just made. It fits once, when the map first appears.
        auto_fit: route ? false : this._keepsView ? !this._mapFitted : true,
        // Side by side, the map has a height to fill - its half of the card -
        // so a ratio of its own would only fight it.
        ...(this._layout === "landscape"
          ? {}
          : { aspect_ratio: this._config.map_aspect_ratio }),
      };

      // Same card, new entities - keeps the Leaflet instance alive.
      if (this._map && this._mapKey && this._mapKey.startsWith(`${areaId}|`)) {
        try {
          this._map.setConfig(mapConfig);
          this._map.hass = this._hass;
          this._mapKey = key;
          this._mapFitted = true;
          this._attachMap();
          this._styleMap();
          this._fitScope();
          return;
        } catch (err) {
          // Fall through and build a fresh one.
        }
      }

      this._mapKey = key;
      const helpers = await window.loadCardHelpers();
      // Another redraw may have overtaken this one while the helpers loaded.
      if (this._mapKey !== key) return;
      const card = await helpers.createCardElement(mapConfig);
      if (this._mapKey !== key) return;
      card.hass = this._hass;
      this._detachMap();
      this._unwatchMarkers();
      this._mapEl.innerHTML = "";
      this._mapEl.appendChild(card);
      this._map = card;
      this._mapFitted = true;
      // A fresh map is fitted by Home Assistant, or to its route; a badge
      // already narrowing the card is picked up once the map is attached.
      this._fittedScope = "";
      this._attachMap();
      this._watchMarkers();
    }

    // Reaches into the embedded map's markers to drop the ring or the disc
    // behind each symbol.
    //
    // Like the viewport following below, this leans on Home Assistant
    // internals it does not own - `ha-map`, `ha-entity-marker` and that
    // element's own ".marker" class. Everything is therefore guarded: if the
    // shape ever changes, the markers simply keep Home Assistant's own look
    // instead of the card breaking.
    //
    // A stylesheet of its own goes into each marker's shadow root rather than
    // the class being patched globally: every other map in the installation
    // has to keep looking the way its own dashboard expects.
    // Everything the card restyles inside an embedded map - the one in the
    // card, or the one in the pop-up.
    _styleMap(card = this._map) {
      this._styleMapChrome(card);
      this._styleMarkers(card);
      this._styleClusters(card);
    }

    // The map's own furniture: the credit line OpenStreetMap and CARTO ask
    // for in return for their tiles, and the buttons Leaflet draws in the
    // corners.
    //
    // The credit never goes away. Collapsed it is an "i" in the corner that a
    // click opens - the smallest form OpenStreetMap allows, and only because
    // a card on a dashboard is the small display their guidance is about.
    // Open it is fine print rather than the white box Leaflet draws.
    _styleMapChrome(card = this._map) {
      try {
        const haMap = card && card.shadowRoot
          ? card.shadowRoot.querySelector("ha-map")
          : null;
        if (!haMap || !haMap.shadowRoot) return;
        let sheet = haMap.shadowRoot.querySelector("style[data-blitzer-chrome]");
        if (!sheet) {
          sheet = document.createElement("style");
          sheet.dataset.blitzerChrome = "";
          haMap.shadowRoot.appendChild(sheet);
        }
        const css = [
          ".leaflet-control-attribution {",
          "  background: none !important;",
          "  color: rgba(255, 255, 255, 0.6) !important;",
          "  font-size: 10px !important;",
          "  padding: 0 6px !important;",
          "  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);",
          "}",
          ".leaflet-control-attribution a { color: inherit !important; text-decoration: none !important; }",
          // Collapsed: the whole line at font-size 0, which takes the links
          // with it, and an "i" drawn in its place.
          ".leaflet-control-attribution {",
          "  box-sizing: border-box;",
          "  width: 18px; height: 18px;",
          "  padding: 0 !important;",
          "  border-radius: 999px !important;",
          "  background: rgba(90, 90, 90, 0.85) !important;",
          "  font-size: 0 !important;",
          "  overflow: hidden;",
          "  cursor: pointer;",
          "}",
          '.leaflet-control-attribution::before {',
          '  content: "i";',
          "  display: block;",
          "  width: 18px; height: 18px;",
          "  font: italic 600 11px/18px var(--paper-font-body1_-_font-family, sans-serif);",
          "  color: #fff;",
          "  text-align: center;",
          "  text-shadow: none;",
          "}",
          ".leaflet-control-attribution.blitzer-open {",
          "  width: auto; height: auto;",
          "  padding: 1px 8px !important;",
          "  border-radius: 10px !important;",
          "  font-size: 10px !important;",
          "  background: rgba(90, 90, 90, 0.85) !important;",
          "}",
          ".leaflet-control-attribution.blitzer-open::before { content: none; }",
          // 2026.10's MapLibre puts its markers inside the canvas container,
          // whose cursor is the map's own grabbing hand; Leaflet gave a
          // marker the pointing one, and a report one can click should keep
          // it. The host passes the cursor down into the marker's shadow.
          ".maplibregl-marker, .maplibregl-marker ha-entity-marker { cursor: pointer !important; }",
          // A click on a bubble zooms the map in to the reports in it - the
          // map's own doing, and what the discs did before 2026.10. The map
          // listens for it on the bubble, but each symbol in the bubble is
          // a marker with a click of its own, which opens that report's
          // details and goes no further - so a tap that lands on a symbol,
          // which is most of a bubble, never zoomed. While the bubble is
          // closed (the map marks it as a button) its symbols let the click
          // through to it; once the map has opened it into a group, because
          // zooming could not part them, each symbol is a target again.
          '.cluster-marker[role="button"] .cluster-bubble ha-entity-marker { pointer-events: none !important; }',
          CLUSTER_CSS,
          // The soft edge, drawn inside the map itself. Leaflet stacks its
          // drawing panes up to 700 and puts its buttons at 1000, so a layer
          // at 800 fades the tiles and the markers and leaves every button
          // and the credit untouched - which is why nothing has to be moved
          // out of the way. Two gradients, one per axis: each is the card's
          // own colour at its edges and clear in between, so together they
          // draw a 20px frame that thickens into the corners.
          this._config.map_fade === false
            ? ""
            : [
                // Leaflet stacks its buttons at 1000; MapLibre puts its
                // controls at 2 and everything it draws below, so the frame
                // goes to 1 there - over the map and the markers, under the
                // buttons, the same place as on Leaflet.
                ".leaflet-container::after, #map.maplibregl-map::after {",
                '  content: "";',
                "  position: absolute;",
                "  inset: 0;",
                "  pointer-events: none;",
                "  z-index: 800;",
                "  background:",
                "    linear-gradient(to bottom, " + FADE + " 0, transparent 20px,",
                "      transparent calc(100% - 20px), " + FADE + " 100%),",
                "    linear-gradient(to right, " + FADE + " 0, transparent 20px,",
                "      transparent calc(100% - 20px), " + FADE + " 100%);",
                "}",
                "#map.maplibregl-map::after { z-index: 1; }",
              ].join("\n"),
        ].join("\n");
        if (sheet.textContent !== css) sheet.textContent = css;
        for (const [name, value] of Object.entries(clusterVars(this._config))) {
          if (value) card.style.setProperty(name, value);
          else card.style.removeProperty(name);
        }

        // The map card draws itself as a card: a hairline border and a filled
        // background, on the ha-card inside its own shadow root - which this
        // card's stylesheet cannot reach. It has always been there; the mask
        // that used to make the soft edge simply faded it away with
        // everything else. Now that the fade is drawn inside the map, the
        // frame stands around it, so it has to go explicitly - a map melting
        // into the card cannot have a line drawn round it.
        let cardSheet = card.shadowRoot.querySelector("style[data-blitzer-chrome]");
        if (!cardSheet) {
          cardSheet = document.createElement("style");
          cardSheet.dataset.blitzerChrome = "";
          card.shadowRoot.appendChild(cardSheet);
        }
        const cardCss = this._config.map_fade === false
          ? ""
          : "ha-card { border: none !important; background: none !important; box-shadow: none !important; }";
        if (cardSheet.textContent !== cardCss) cardSheet.textContent = cardCss;

        const credit = haMap.shadowRoot.querySelector(".leaflet-control-attribution");
        if (credit && !credit.dataset.blitzerWired) {
          credit.dataset.blitzerWired = "1";
          credit.setAttribute("role", "button");
          credit.tabIndex = 0;
          credit.title = credit.textContent.trim();
          const toggle = (ev) => {
            // A click on one of the links inside is meant for the link.
            if (ev.target && ev.target.closest && ev.target.closest("a")) return;
            ev.preventDefault();
            ev.stopPropagation();
            credit.classList.toggle("blitzer-open");
          };
          credit.addEventListener("click", toggle);
          for (const link of credit.querySelectorAll("a")) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
          }
          credit.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") toggle(ev);
          });
        }
      } catch (err) {
        // The map's internals are not ours to rely on.
      }
    }

    _styleMarkers(card = this._map) {
      const css = markerCss(this._config);
      try {
        const haMap = card && card.shadowRoot
          ? card.shadowRoot.querySelector("ha-map")
          : null;
        if (!haMap || !haMap.shadowRoot) return;
        for (const marker of haMap.shadowRoot.querySelectorAll("ha-entity-marker")) {
          const root = marker.shadowRoot;
          if (!root) continue;
          let sheet = root.querySelector("style[data-blitzer]");
          if (!sheet) {
            if (!css) continue;
            sheet = document.createElement("style");
            sheet.dataset.blitzer = "";
            root.appendChild(sheet);
          }
          if (sheet.textContent !== css) sheet.textContent = css;
        }
      } catch (err) {
        // The map's internals are not ours to rely on.
      }
    }

    // The disc in place of 2026.10's bubble, when asked for. The bubble
    // stays the map's element - its click still zooms - and is only drawn
    // differently: its symbols and tail hidden, and the count put on it as
    // generated content, from a number worked out here. The map writes the
    // bubble's size and anchor for the symbols it holds, so the disc is
    // placed on the anchor point itself, not in the box - see CLUSTER_CSS.
    // Only a closed bubble: one the map has opened into a group, because
    // zooming could not part its reports, lists them, and that is what it
    // is for.
    _styleClusters(card = this._map) {
      try {
        const haMap = card && card.shadowRoot
          ? card.shadowRoot.querySelector("ha-map")
          : null;
        if (!haMap || !haMap.shadowRoot) return;
        const disc = this._config.cluster_style === "disc";
        for (const bubble of haMap.shadowRoot.querySelectorAll(".cluster-marker")) {
          const closed = bubble.getAttribute("role") !== "group";
          if (!disc || !closed) {
            bubble.classList.remove("blitzer-disc");
            delete bubble.dataset.blitzerCount;
            continue;
          }
          const shown = bubble.querySelectorAll("ha-entity-marker").length;
          const more = bubble.querySelector(".more");
          // "+N" for the rest, or "99+" once the map stops counting.
          const rest = more ? parseInt(more.textContent.replace(/[^0-9]/g, ""), 10) || 0 : 0;
          const capped = !!more && /\+$/.test(more.textContent.trim());
          bubble.dataset.blitzerCount = String(shown + rest) + (capped ? "+" : "");
          bubble.classList.add("blitzer-disc");
        }
      } catch (err) {
        // The map's internals are not ours to rely on.
      }
    }

    // Markers are rebuilt whenever the map pans, zooms or reclusters, so the
    // styling has to follow rather than being applied once.
    _watchMarkers(card = this._map, slot = "_markerObserver", attempt = 0) {
      if (this[slot]) return;
      const haMap = card && card.shadowRoot ? card.shadowRoot.querySelector("ha-map") : null;
      if (!haMap || !haMap.shadowRoot) {
        if (attempt < 10) window.setTimeout(() => this._watchMarkers(card, slot, attempt + 1), 300);
        return;
      }
      try {
        this[slot] = new MutationObserver(() => this._styleMap(card));
        this[slot].observe(haMap.shadowRoot, { childList: true, subtree: true });
        this._styleMap(card);
      } catch (err) {
        this[slot] = undefined;
      }
    }

    _unwatchMarkers() {
      if (this._markerObserver) {
        try {
          this._markerObserver.disconnect();
        } catch (err) {
          // Already gone with the map it was watching.
        }
      }
      this._markerObserver = undefined;
    }

    // The card's one grip on the embedded map: its Leaflet instance, to aim
    // and to be told where it is looking, and the clicks that land on it.
    //
    // `ha-map`'s Leaflet instance is not a documented interface - Home
    // Assistant can rearrange it at any time. Everything here is therefore
    // guarded: if it cannot be reached, the card simply keeps behaving as it
    // does without these options, rather than breaking.
    _attachMap() {
      if (!this._wantsMap || !this._map) return;
      this._detachMap();
      const map = this._map;
      const tryAttach = (attempt) => {
        // The map this was started for may have been replaced meanwhile.
        if (this._map !== map || this._handles) return;
        const haMap = map.shadowRoot ? map.shadowRoot.querySelector("ha-map") : null;
        const h = mapHandles(haMap);
        if (!h) {
          // 2026.10 loads its engine in a chunk of its own, after the map
          // element is there - a dozen seconds on a slow box, and longer
          // right after a restart. Quick for the first dozen seconds, then
          // every two, for as long as this map stands: nothing else asks
          // again, since the card only redraws when its data changes.
          window.setTimeout(() => tryAttach(attempt + 1), attempt < 40 ? 300 : 2000);
          return;
        }
        this._handles = h;
        this._haMap = haMap;
        this._paintRoute();
        this._paintArea();
        this._paintClosures();
        this._fitScope();
        this._scheduleTraffic("main");

        // A click on a report picks its entry out of the list. The marker's
        // own handler opens Home Assistant's details dialog, which would
        // cover the very list the highlight is in, so for our own reports
        // the click is caught on the way down and stopped there. Not inside
        // one of 2026.10's closed cluster bubbles, though: a tap there zooms
        // the map in, and that is the map's to handle (its symbols pass the
        // click on - see the stylesheet). In a bubble the map has opened
        // into a group, each symbol is a report of ours again.
        this._onMarkerClick = (ev) => {
          if (this._config.map_highlight === false) return;
          const marker = ev.composedPath().find((n) => n && n.tagName === "HA-ENTITY-MARKER");
          const id = marker && (marker.entityId || marker.getAttribute("entity-id"));
          if (!id || !(this._allRows || []).some((r) => r.entityId === id)) return;
          const bubble = marker.closest && marker.closest(".cluster-marker");
          if (bubble && bubble.getAttribute("role") !== "group") return;
          ev.stopPropagation();
          ev.preventDefault();
          this._highlight = this._highlight === id ? null : id;
          this._render();
        };
        try {
          haMap.shadowRoot.addEventListener("click", this._onMarkerClick, true);
        } catch (err) {
          this._onMarkerClick = undefined;
        }
        // A click on the bare map only ever means "somewhere else" - which
        // is what lets the highlight go. Leaflet keeps a marker's click to
        // itself; 2026.10's ha-map says so itself, as map-clicked.
        this._onMapClick = () => {
          if (!this._highlight) return;
          this._highlight = null;
          this._render();
        };
        if (h.kind === "leaflet") h.on("click", this._onMapClick);
        else haMap.addEventListener("map-clicked", this._onMapClick);

        // The viewport itself is only listened to when something reads it:
        // the list following the map, or distances measured from its centre.
        if (!this._watchesMap) return;
        // MapLibre's resize() fires moveend synchronously, moved or not
        // (Leaflet's invalidateSize never did), and a redraw of this card
        // can resize the map - the head gaining a badge is enough. Redrawn
        // straight from here, that was a loop: redraw -> resize -> moveend
        // -> redraw, until the stack ran out. So only a view that actually
        // changed counts, and the redraw it earns runs on its own turn.
        this._onMove = () => {
          let sig = "";
          try {
            // What _inBounds asks of it, answered by whichever map this is.
            this._bounds = { contains: (point) => h.contains(point[0], point[1]) };
            this._mapCentre = h.centre();
            const zoom = h.zoom();
            sig = this._mapCentre
              ? `${this._mapCentre.lat.toFixed(5)},${this._mapCentre.lon.toFixed(5)},${zoom}`
              : "";
          } catch (err) {
            this._bounds = undefined;
            this._mapCentre = undefined;
          }
          if (sig === this._viewSig) return;
          this._viewSig = sig;
          this._scheduleTraffic("main");
          if (this._moveRender) return;
          this._moveRender = window.setTimeout(() => {
            this._moveRender = undefined;
            this._render();
          }, 0);
        };
        h.on("moveend", this._onMove);
        h.on("zoomend", this._onMove);
        this._onMove();
      };
      tryAttach(0);
    }

    // An area's route, if it has one. Asked of the integration again only
    // when the area's total sensor changed - which is also what an edited
    // entry does when it reloads, the one moment its route can change.
    _routeFor(areaId) {
      const device = this._hass && this._hass.devices && this._hass.devices[areaId];
      const entryId = device && (device.config_entries || [])[0];
      if (!entryId || !this._hass.callWS) return Promise.resolve(null);
      const sensor = totalSensor(this._hass, areaId);
      const sig = entryId + "|" + (sensor ? sensor.last_changed : "");
      if (this._routeAsked !== sig) {
        this._routeAsked = sig;
        this._routePromise = this._hass
          .callWS({ type: "blitzer/route", config_entry_id: entryId })
          .then(
            (answer) => {
              // What an area entry searches instead of a route: its circle,
              // or the tracker it follows - for a map with nothing on it.
              this._areaShape = answer && !routeSig(answer) && answer.radius ? answer : null;
              return answer && routeSig(answer) ? answer : null;
            },
            // An older integration without the command, or no connection.
            () => {
              this._areaShape = null;
              return null;
            }
          );
      }
      return this._routePromise;
    }

    _entryIdFor(areaId) {
      const device = this._hass && this._hass.devices && this._hass.devices[areaId];
      return device ? (device.config_entries || [])[0] : undefined;
    }

    // ---- the traffic flow, fetched for the view while it is on screen -----
    //
    // Two maps can show it, the card's own and the pop-up's, each with a
    // layer, a timer and a memory of what it last asked for; "slot" names
    // which. Nothing here polls: a view is asked for once it has settled
    // after a move, again every few minutes while the card stays visible,
    // and not at all while the tab is hidden or the card is off the page.
    // Per map: the card's own, or the pop-up's - the minimal format has no
    // map of its own, and its pop-up's must not be judged by that.
    _trafficWanted(slot = "main") {
      return this._trafficOffered(slot) && this._trafficShown !== false;
    }

    // Whether the traffic flow is on offer at all: the option on, and a map
    // that can draw it. The line under the subtitle is drawn then, with its
    // switch; _trafficShown is that switch, undefined until it is touched.
    _trafficOffered(slot = "main") {
      const hasMap = slot === "pop" ? this._config.show_map !== false : this._wantsMap;
      return this._config.map_traffic === true && hasMap && haAtLeast(this._hass, 2026, 10);
    }

    // The line under the subtitle: the switch, when the flow was last
    // fetched, and a refresh of its own. Updated in place by
    // _renderTrafficLine as time passes and fetches come in.
    _trafficLineHtml(str, slot = "main") {
      if (!this._trafficOffered(slot)) return "";
      const on = this._trafficShown !== false;
      return `<div class="traffic-line" style="${escapeHtml(elementStyle(this._config, "sub"))}">
        <label class="traffic-switch" title="${escapeHtml(str.trafficSwitch)}">
          <input type="checkbox" data-what="traffic-switch"${on ? " checked" : ""}>
          <span class="track"></span>
        </label>
        <span class="traffic-text">${escapeHtml(this._trafficLineText(str, slot))}</span>
        ${on
          ? `<button type="button" class="refresh" data-what="traffic-refresh"
                title="${escapeHtml(str.trafficRefresh)}">${leadIconHtml(this._config, "refresh")}</button>`
          : ""}
      </div>`;
    }

    _trafficLineText(str, slot = "main") {
      if (this._trafficShown === false) return `${str.trafficLine} · ${str.trafficOff}`;
      const when = this[this._trafficSlot(slot).at];
      const at = when ? new Date(when).toISOString() : "";
      return `${str.trafficLine} · ${updatedText(str, at)}`;
    }

    // Both lines, each with its own map's time: the card's under the
    // subtitle, the pop-up's under its title.
    _renderTrafficLine() {
      if (!this._hass) return;
      const str = t(this._hass);
      const head = this._headEl && this._headEl.querySelector(".traffic-text");
      if (head) head.textContent = this._trafficLineText(str, "main");
      const pop = this._popEl && this._popEl.querySelector(".pop-traffic .traffic-text");
      if (pop) pop.textContent = this._trafficLineText(str, "pop");
    }

    // The line's switch and refresh, wherever the line was drawn.
    _bindTrafficLine(root, slot) {
      const trafficSwitch = root.querySelector('[data-what="traffic-switch"]');
      if (trafficSwitch) {
        trafficSwitch.addEventListener("change", () => {
          this._trafficShown = trafficSwitch.checked;
          this._syncTrafficSwitch();
          if (slot === "pop") this._fillPopTrafficLine();
          else this._render();
        });
      }
      const trafficRefresh = root.querySelector('[data-what="traffic-refresh"]');
      if (trafficRefresh) {
        trafficRefresh.addEventListener("click", async () => {
          if (trafficRefresh.disabled) return;
          trafficRefresh.disabled = true;
          trafficRefresh.classList.add("spinning");
          try {
            await this._askTraffic(slot, true, true);
          } finally {
            if (trafficRefresh.isConnected) {
              trafficRefresh.disabled = false;
              trafficRefresh.classList.remove("spinning");
            }
          }
        });
      }
    }

    // The pop-up's line, drawn whenever the pop-up is filled and whenever
    // its switch is turned.
    _fillPopTrafficLine() {
      const box = this._popEl && this._popEl.querySelector(".pop-traffic");
      if (!box || !this._hass) return;
      box.innerHTML = this._trafficLineHtml(t(this._hass), "pop");
      box.hidden = !box.firstElementChild;
      this._bindTrafficLine(box, "pop");
    }

    _trafficSlot(slot) {
      return slot === "pop"
        ? { handles: "_popHandles", layer: "_popTrafficLayer", debounce: "_popTrafficDebounce", timer: "_popTrafficTimer", asked: "_popTrafficAsked", last: "_popTrafficLast", at: "_popTrafficAt" }
        : { handles: "_handles", layer: "_trafficLayer", debounce: "_trafficDebounce", timer: "_trafficTimer", asked: "_trafficAsked", last: "_trafficLast", at: "_trafficAt" };
    }

    // The lines' width and opacity, from Layout -> Map.
    _trafficStyle() {
      const width = Number(this._config.traffic_width);
      const opacity = Number(this._config.traffic_opacity);
      return {
        width: Number.isFinite(width) && width > 0 ? width : 1.5,
        opacity: Number.isFinite(opacity) ? Math.max(0.1, Math.min(1, opacity / 100)) : 0.5,
      };
    }

    // A changed width or opacity is painted onto what was last fetched; no
    // request for a new look.
    _restyleTraffic() {
      for (const slot of ["main", "pop"]) {
        const keys = this._trafficSlot(slot);
        const last = this[keys.last];
        if (!last || !this[keys.layer]) continue;
        try {
          this[keys.layer].set(last.segments, last.zoom, { ...this._trafficStyle(), bridge: last.bridge });
        } catch (err) {
          // The map went away underneath.
        }
      }
    }

    _scheduleTraffic(slot) {
      const keys = this._trafficSlot(slot);
      if (!this._trafficWanted(slot)) {
        this._clearTraffic(slot);
        return;
      }
      window.clearTimeout(this[keys.debounce]);
      this[keys.debounce] = window.setTimeout(() => {
        this[keys.debounce] = undefined;
        this._askTraffic(slot);
      }, TRAFFIC_DEBOUNCE_MS);
    }

    // The switch was turned while the map stands: on asks, off clears.
    _syncTrafficSwitch() {
      const main = this._trafficWanted("main");
      if (main !== this._trafficOn) {
        this._trafficOn = main;
        this._scheduleTraffic("main");
      }
      if (this._popHandles) {
        const pop = this._trafficWanted("pop");
        if (pop !== this._popTrafficOn) {
          this._popTrafficOn = pop;
          this._scheduleTraffic("pop");
        }
      }
    }

    async _askTraffic(slot, refresh = false, force = false) {
      const keys = this._trafficSlot(slot);
      const h = this[keys.handles];
      if (!h || !this._trafficWanted(slot) || !this.isConnected) return;
      if (document.visibilityState === "hidden") return;
      const entryId = this._entryIdFor(this._areaId());
      if (!entryId || !this._hass || !this._hass.callWS || typeof h.bounds !== "function") return;
      let box;
      let zoom;
      try {
        box = h.bounds();
        zoom = Math.round(h.zoom() || 0);
      } catch (err) {
        return;
      }
      if (!box || !Number.isFinite(box.south) || !Number.isFinite(box.east)) return;
      // The same view asked for a moment ago is not asked for again - the
      // integration would answer from its cache anyway, but the round trip
      // is not worth making. A refresh from the timer asks regardless.
      const key = [box.south, box.west, box.north, box.east].map((v) => v.toFixed(3)).join(",") + "|" + zoom;
      const asked = this[keys.asked];
      if (!refresh && asked && asked.key === key && Date.now() - asked.at < TRAFFIC_REFRESH_MS) return;
      this[keys.asked] = { key, at: Date.now() };
      let answer;
      try {
        answer = await this._hass.callWS({
          type: "blitzer/traffic",
          config_entry_id: entryId,
          south: box.south,
          west: box.west,
          north: box.north,
          east: box.east,
          zoom,
          ...(force ? { force: true } : {}),
        });
      } catch (err) {
        // An older integration without the command, or no connection:
        // whatever is drawn stays, and the timer tries again later.
        this._armTrafficTimer(slot);
        return;
      }
      if (!this._trafficWanted(slot) || this[keys.handles] !== h) return;
      if (!answer || !answer.data) {
        // Too far out to be worth a whole country of road, or Blitzer.de
        // not answering: nothing new to draw. Zoomed out, what was drawn
        // for a closer view would be wrong, so it goes.
        if (answer && answer.reason === "too_large") this._dropTrafficLayer(slot);
        this._armTrafficTimer(slot);
        return;
      }
      if (!this[keys.layer]) {
        try {
          this[keys.layer] = h.traffic();
        } catch (err) {
          return;
        }
      }
      const segments = trafficSegments(answer.data, answer.box);
      const bridge = answer.along_route === true;
      this[keys.last] = { segments, zoom, bridge };
      this[keys.at] = Date.now() - (Number(answer.age) || 0) * 1000;
      this._renderTrafficLine();
      try {
        this[keys.layer].set(segments, zoom, { ...this._trafficStyle(), bridge });
      } catch (err) {
        // The map went away underneath.
      }
      this._armTrafficTimer(slot);
    }

    _armTrafficTimer(slot) {
      const keys = this._trafficSlot(slot);
      window.clearTimeout(this[keys.timer]);
      this[keys.timer] = window.setTimeout(() => {
        this[keys.timer] = undefined;
        this._askTraffic(slot, true);
      }, TRAFFIC_REFRESH_MS);
    }

    _dropTrafficLayer(slot) {
      const keys = this._trafficSlot(slot);
      if (this[keys.layer]) {
        try {
          this[keys.layer].remove();
        } catch (err) {
          // Its map is already gone.
        }
        this[keys.layer] = undefined;
      }
    }

    _clearTraffic(slot) {
      const keys = this._trafficSlot(slot);
      window.clearTimeout(this[keys.debounce]);
      window.clearTimeout(this[keys.timer]);
      this[keys.debounce] = undefined;
      this[keys.timer] = undefined;
      this[keys.asked] = undefined;
      this[keys.last] = undefined;
      this._dropTrafficLayer(slot);
    }

    _paintRoute() {
      removeRoute(this._routeDrawn);
      this._routeDrawn = undefined;
      const route = this._route;
      const h = this._handles;
      if (!route || !h) return;
      this._routeDrawn = drawRouteWith(
        h, route.points, routeColor(this, this._config.route_color), route.vias, this._config.route_width
      );
      // Fitted once per route, not on every redraw - a pan the person made
      // stays where they put it.
      const sig = routeSig(route);
      if (this._routeFitted !== sig) {
        this._routeFitted = sig;
        this._endRouteWatch("_routeSettle");
        this._routeSettle = fitRouteSettled(h, route.points);
      }
    }

    // Ends the watch that keeps the route in view after its first fit - see
    // fitRouteSettled - before the map is fitted to something else, or torn
    // down. Nothing to end is fine.
    _endRouteWatch(slot) {
      const end = this[slot];
      this[slot] = undefined;
      if (typeof end === "function") {
        try {
          end();
        } catch (err) {
          // The map went first.
        }
      }
    }

    // A badge narrows the card to what it counted - the new reports, or the
    // jams - and the map follows: switched on, it fits what is left, so the
    // one tailback the card now lists is also the one thing in view;
    // switched off, it goes back to the route, or to all of the area's
    // reports where there is no route. Only on the change itself: a pan
    // made in between stays where it was put.
    _fitScope() {
      const h = this._handles;
      if (!h) return;
      const scope = this._onlyNew ? "new" : this._onlyDelay ? "delay" : "";
      const fitted = this._fittedScope === undefined ? "" : this._fittedScope;
      if (scope === fitted) return;
      this._fittedScope = scope;
      // The map is about to be fitted on purpose; the route's own watch
      // must not pull it back.
      this._endRouteWatch("_routeSettle");
      const points = (this._mapRows || [])
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
        .map((r) => [r.lat, r.lon]);
      try {
        if (scope) {
          if (points.length) h.fit(points, { maxZoom: FOCUS_ZOOM });
        } else if (this._route) {
          h.fit(this._route.points);
        } else if (points.length) {
          h.fit(points, { maxZoom: FOCUS_ZOOM });
        } else {
          const circle = this._areaCircle();
          if (circle) h.fit(circle);
        }
      } catch (err) {
        // The map went away underneath; nothing to fit.
      }
    }

    // The circle an area entry searches, as points along its edge - from
    // the centre it was set up with, or from wherever its tracker is right
    // now. Null for a route entry, or before the integration has said.
    _areaCircle() {
      const shape = this._areaShape;
      if (!shape || !Number.isFinite(Number(shape.radius)) || Number(shape.radius) <= 0) return null;
      let lat;
      let lon;
      if (shape.tracker) {
        const state = this._hass && this._hass.states && this._hass.states[shape.tracker];
        lat = state && Number(state.attributes.latitude);
        lon = state && Number(state.attributes.longitude);
      } else if (Array.isArray(shape.center)) {
        lat = Number(shape.center[0]);
        lon = Number(shape.center[1]);
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const radius = Number(shape.radius);
      const dLat = radius / 111320;
      const dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
      const points = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * 2 * Math.PI;
        points.push([lat + dLat * Math.cos(t), lon + dLon * Math.sin(t)]);
      }
      return points;
    }

    // The area's circle on a map with nothing on it: a dashed line in the
    // route's colour, fitted into view once per area, the way a route is.
    // With reports on the map there is nothing to draw - they are what the
    // map shows, and Home Assistant fits them.
    _paintArea(h = this._handles, rows = this._mapRows, slot = "_areaDrawn", settleSlot = "_areaSettle") {
      this._removeArea(slot, settleSlot);
      if (!h || this._config.map_always === false || this._route) return;
      if ((rows || []).length) return;
      const circle = this._areaCircle();
      if (!circle) return;
      try {
        this[slot] = h.line(circle, {
          color: routeColor(this, this._config.route_color),
          width: 2,
          opacity: 0.8,
          dashed: true,
        });
        this[settleSlot] = fitRouteSettled(h, circle);
      } catch (err) {
        // The map went away underneath; nothing to draw on.
      }
    }

    _removeArea(slot, settleSlot) {
      this._endRouteWatch(settleSlot);
      if (this[slot]) {
        try {
          this[slot].remove();
        } catch (err) {
          // Its map is already gone.
        }
      }
      this[slot] = undefined;
    }

    async _paintPopRoute() {
      const h = this._popHandles;
      const route = this._config.map_route === false ? null : await this._routeFor(this._areaId());
      if (!route || !h || this._popHandles !== h) return;
      removeRoute(this._popRouteDrawn);
      this._popRouteDrawn = drawRouteWith(
        h, route.points, routeColor(this, this._config.route_color), route.vias, this._config.route_width
      );
      this._endRouteWatch("_popRouteSettle");
      this._popRouteSettle = fitRouteSettled(h, route.points);
    }

    // The stretch of road each official closure on the map closes, as a
    // band under its symbol: the dark red Blitzer.de's own map uses, with a
    // white dashed centre the way it stripes them. Drawn for the reports
    // the map shows, so it follows every filter the symbols follow, and
    // redrawn whenever the map is attached - which is whenever that set
    // changes, since the set is part of the map's key.
    _paintClosures(h = this._handles, rows = this._mapRows, slot = "_closuresDrawn") {
      this._removeClosures(slot);
      if (!h || this._config.map_closures === false) return;
      const drawn = [];
      for (const row of rows || []) {
        const encoded = row.isHazard && row.state.attributes.closure_polyline;
        if (typeof encoded !== "string" || !encoded) continue;
        let points;
        try {
          points = decodePolyline(encoded);
        } catch (err) {
          continue;
        }
        if (points.length < 2) continue;
        try {
          drawn.push(h.line(points, { color: CLOSURE_COLOR, width: 6, opacity: 0.8 }));
          drawn.push(h.line(points, { color: "#ffffff", width: 2, opacity: 0.9, dashed: true }));
        } catch (err) {
          // The map went away underneath; nothing to draw on.
        }
      }
      this[slot] = drawn;
    }

    _removeClosures(slot) {
      for (const item of this[slot] || []) {
        try {
          item.remove();
        } catch (err) {
          // Its map is already gone.
        }
      }
      this[slot] = undefined;
    }

    _detachMap() {
      const h = this._handles;
      if (h && this._onMove) {
        try {
          h.off("moveend", this._onMove);
          h.off("zoomend", this._onMove);
        } catch (err) {
          // The map went away underneath us; nothing left to detach from.
        }
      }
      if (h && this._onMapClick) {
        try {
          if (h.kind === "leaflet") h.off("click", this._onMapClick);
          else if (this._haMap) this._haMap.removeEventListener("map-clicked", this._onMapClick);
        } catch (err) {
          // Same again - the instance is already gone.
        }
      }
      if (this._haMap && this._onMarkerClick) {
        try {
          this._haMap.shadowRoot.removeEventListener("click", this._onMarkerClick, true);
        } catch (err) {
          // Its shadow root went with it.
        }
      }
      this._endRouteWatch("_routeSettle");
      removeRoute(this._routeDrawn);
      this._routeDrawn = undefined;
      this._removeArea("_areaDrawn", "_areaSettle");
      this._removeClosures("_closuresDrawn");
      this._clearTraffic("main");
      if (this._moveRender) {
        window.clearTimeout(this._moveRender);
        this._moveRender = undefined;
      }
      this._viewSig = undefined;
      this._handles = undefined;
      this._haMap = undefined;
      this._onMove = undefined;
      this._onMapClick = undefined;
      this._onMarkerClick = undefined;
      this._mapCentre = undefined;
    }

    disconnectedCallback() {
      this._detachMap();
      this._unwatchMarkers();
      if (this._onVisibility) {
        document.removeEventListener("visibilitychange", this._onVisibility);
        this._onVisibility = undefined;
      }
      if (this._trafficTick) {
        window.clearInterval(this._trafficTick);
        this._trafficTick = undefined;
      }
      this._clearTraffic("pop");
    }

    // Switching between the views of a dashboard takes the card out of the
    // document and puts the same element back a moment later - so everything
    // disconnectedCallback tore out has to be hooked up again here.
    //
    // Nothing else does it: the redraw that follows finds the map card and
    // its entities unchanged and returns early. Without this the markers keep
    // Home Assistant's own ring and disc, because the observer that restyles
    // each freshly drawn one is gone; the viewport is never read again, so
    // the count goes on reporting whatever was in view before the switch;
    // and clicks on the map stop meaning anything.
    connectedCallback() {
      // The traffic flow is fetched only while someone can see it: a tab
      // coming back to the front asks again, a tab going to the back is
      // left alone by the timer.
      if (!this._onVisibility) {
        this._onVisibility = () => {
          if (document.visibilityState !== "visible") return;
          this._scheduleTraffic("main");
          if (this._popHandles) this._scheduleTraffic("pop");
        };
        document.addEventListener("visibilitychange", this._onVisibility);
      }
      if (!this._trafficTick) {
        this._trafficTick = window.setInterval(() => this._renderTrafficLine(), 60000);
      }
      // The very first insertion happens before there is a map to hook into.
      if (!this._map) return;
      this._attachMap();
      this._watchMarkers();
    }

    _renderList(str) {
      if (!this._wantsList) {
        this._listEl.innerHTML = "";
        return;
      }
      // A wording of one's own replaces both sentences: whoever writes one
      // means it to be what the card says when it has nothing to show.
      const emptyText =
        this._config.no_reports_text ||
        (this._following && this._bounds && this._total ? str.nothingInView : str.nothing);
      // Folded, only the first few are drawn - the rest are not built at all
      // rather than built and hidden, so a hundred entries behind the fold
      // cost nothing until they are asked for.
      const folded = this._foldable && !this._expanded;
      const shown = folded ? this._rows.slice(0, this._foldAt) : this._rows;
      this._listEl.innerHTML =
        (this._rows.length
          ? `<div class="list${this._config.show_divider === false ? " no-divider" : ""}"
             style="${escapeHtml(dividerStyle(this._config))}">${shown
              .map((row) =>
                rowHtml(row, str, this._newRows.has(row.entityId), this._config, this._highlight === row.entityId)
              )
              .join("")}</div>`
          : `<div class="empty" style="${escapeHtml(elementStyle(this._config, "no_reports"))}">${escapeHtml(emptyText)}</div>`) +
        (this._foldable
          ? `<button type="button" class="fold" aria-expanded="${folded ? "false" : "true"}"
                     title="${escapeHtml(folded ? str.foldOpen(this._rows.length - this._foldAt) : str.foldClose)}">
               <ha-icon icon="mdi:chevron-${folded ? "down" : "up"}"></ha-icon>
             </button>`
          : "");

      const fold = this._listEl.querySelector(".fold");
      if (fold) {
        fold.addEventListener("click", () => {
          this._expanded = !this._expanded;
          this._renderList(str);
        });
      }

      this._fitIcons();

      this._listEl.querySelectorAll(".row").forEach((el) => {
        el.addEventListener("click", () => {
          // With a map to aim, that is what a click on an entry means. Where
          // there is none - or the setting is off - it opens Home Assistant's
          // own details dialog, which is what the click has always done.
          const row = (this._rows || []).find((r) => r.entityId === el.dataset.entity);
          if (this._config.center_on_click !== false && this._focusMap(row)) return;
          this.dispatchEvent(
            new CustomEvent("hass-more-info", {
              detail: { entityId: el.dataset.entity },
              bubbles: true,
              composed: true,
            })
          );
        });
      });
    }
  }

  // ---------------------------------------------------------------- editor
  //
  // The Annuals card's editor, field for field: two collapsible super-panels,
  // three tabs each, "Allgemein" first in both. The markup and styling are
  // copied rather than reinvented so the three integrations read as one
  // product - a plain styled <input> where Annuals uses one, an HA picker only
  // where a plain input cannot do the job.
  const SUPER_GROUPS = [
    { key: "settings", icon: "mdi:tune", groups: ["general", "content", "rows"] },
    { key: "layout", icon: "mdi:view-dashboard-outline", groups: ["display", "map", "list"] },
  ];

  const GROUPS = [
    { key: "general", icon: "mdi:cog" },
    { key: "content", icon: "mdi:filter-variant" },
    // Two tabs called "Liste": what an entry says, under Settings, and how it
    // looks, under Layout. Their keys have to differ, since the key is what
    // decides which body gets built.
    { key: "rows", icon: "mdi:format-list-bulleted" },
    { key: "display", icon: "mdi:eye-outline" },
    { key: "map", icon: "mdi:map" },
    { key: "list", icon: "mdi:format-list-bulleted" },
  ];

  // Annuals' own palette, in its own order, so a colour picked in one card can
  // be named the same way in the other.
  const PRESET_COLORS = [
    { key: "default", labelKey: "presetDefault", value: "" },
    { key: "primary", labelKey: "presetPrimary", value: "var(--primary-color)" },
    { key: "accent", labelKey: "presetAccent", value: "var(--accent-color)" },
    { key: "red", labelKey: "presetRed", value: "#f44336" },
    { key: "pink", labelKey: "presetPink", value: "#e91e63" },
    { key: "purple", labelKey: "presetPurple", value: "#9c27b0" },
    { key: "deep_purple", labelKey: "presetDeepPurple", value: "#673ab7" },
    { key: "indigo", labelKey: "presetIndigo", value: "#3f51b5" },
    { key: "blue", labelKey: "presetBlue", value: "#2196f3" },
    { key: "light_blue", labelKey: "presetLightBlue", value: "#03a9f4" },
    { key: "cyan", labelKey: "presetCyan", value: "#00bcd4" },
    { key: "teal", labelKey: "presetTeal", value: "#009688" },
    { key: "green", labelKey: "presetGreen", value: "#4caf50" },
    { key: "light_green", labelKey: "presetLightGreen", value: "#8bc34a" },
    { key: "lime", labelKey: "presetLime", value: "#cddc39" },
    { key: "yellow", labelKey: "presetYellow", value: "#ffeb3b" },
    { key: "amber", labelKey: "presetAmber", value: "#ffc107" },
    { key: "orange", labelKey: "presetOrange", value: "#ff9800" },
    { key: "deep_orange", labelKey: "presetDeepOrange", value: "#ff5722" },
    { key: "brown", labelKey: "presetBrown", value: "#795548" },
    { key: "grey", labelKey: "presetGrey", value: "#9e9e9e" },
    { key: "blue_grey", labelKey: "presetBlueGrey", value: "#607d8b" },
  ];

  // Every piece of the card Layout -> General can restyle, in the order the
  // card itself reads: the empty-list line that stands in for the whole list,
  // then the head - title, its badges, and the two dropdowns and the subtitle
  // line beneath them.
  //
  // `fallback` is what each element actually renders in when nothing is set
  // (see STYLE), so a swatch previews the real theme colour rather than
  // falling back to white.
  const DESIGN_ELEMENTS = {
    title: {
      label: "edElTitle",
      help: "edElTitleHelp",
      colorHelp: "edTitleColorHelp",
      fontHelp: "edTitleFontHelp",
      fallback: "var(--primary-text-color)",
      // Nothing left to style once the title is not drawn at all. Kept in
      // the minimal format, where the pop-up wears this same title.
      hidden: (config) => config.show_title === false,
    },
    // Straight after the title: the card's other piece of fixed wording, and
    // the one it falls back to when there is nothing to list.
    no_reports: {
      label: "edElNothing",
      help: "edElNothingHelp",
      colorHelp: "edNothingColorHelp",
      fontHelp: "edNothingFontHelp",
      fallback: "var(--secondary-text-color)",
      hidden: (config) => config.layout === "minimal",
    },
    // The minimal format's own four, and the only ones it offers besides
    // the title: everything below answers for a head, a subtitle or a picker
    // that one line does not draw. Read top down the way the format is - the
    // three parts of the line, then the one thing its pop-up shows that the
    // line behind it cannot.
    mini: {
      label: "edElMiniTotal",
      help: "edElMiniTotalHelp",
      // "Colour" on its own would be the second one in this block. Named for
      // what it actually colours, and put where the rest of the type is.
      colorLabel: "edFontColor",
      colorLast: true,
      colorHelp: "edMiniTotalColorHelp",
      fontHelp: "edMiniTotalFontHelp",
      fallback: "var(--primary-text-color)",
      icon: {
        key: "mini_icon",
        label: "edSubIcon",
        help: "edMiniIconHelp",
        color: {
          key: "mini_icon_color",
          label: "edSubIconColor",
          help: "edMiniIconColorHelp",
          fallback: "var(--secondary-text-color)",
        },
        size: { key: "mini_icon_size", label: "edSubIconSize", help: "edMiniIconSizeHelp" },
      },
      // No "show background" switch in front of it: this half has a fill
      // already, and what is being set here is which one - not whether.
      // The swatch previews the card behind it, which is what one sees
      // through an empty field.
      extra: {
        key: "mini_fill_color",
        label: "edMiniBg",
        help: "edMiniBgHelp",
        fallback: "var(--ha-card-background, var(--card-background-color))",
      },
      opacity: {
        key: "mini_fill_opacity",
        label: "edMiniBgOpacity",
        help: "edMiniBgOpacityHelp",
      },
      hidden: (config) =>
        config.layout !== "minimal" || config.mini_show_total === false,
    },
    mini_new: {
      label: "edElMiniNew",
      help: "edElMiniNewHelp",
      colorLabel: "edFontColor",
      colorLast: true,
      colorHelp: "edMiniNewColorHelp",
      fontHelp: "edMiniNewFontHelp",
      // The accent the half is drawn in, so an untouched swatch shows the
      // colour that is actually there rather than a plain white.
      fallback: "var(--blitzer-new-background, var(--accent-color, #ff9800))",
      icon: {
        key: "mini_new_icon",
        label: "edSubIcon",
        help: "edMiniIconHelp",
        color: {
          key: "mini_new_icon_color",
          label: "edSubIconColor",
          help: "edMiniIconColorHelp",
          fallback: "var(--blitzer-new-background, var(--accent-color, #ff9800))",
        },
        size: { key: "mini_new_icon_size", label: "edSubIconSize", help: "edMiniIconSizeHelp" },
      },
      extra: {
        key: "mini_new_fill_color",
        label: "edMiniBg",
        help: "edMiniBgHelp",
        fallback: "var(--ha-card-background, var(--card-background-color))",
      },
      opacity: {
        key: "mini_new_fill_opacity",
        label: "edMiniBgOpacity",
        help: "edMiniBgOpacityHelp",
      },
      hidden: (config) => config.layout !== "minimal" || config.show_new === false,
    },
    // And the third part, arranged like the second. Its own switch is the
    // one that draws the head's badge in the other formats: one setting for
    // what the jams cost, wherever the format puts it.
    mini_delay: {
      label: "edElMiniDelay",
      help: "edElMiniDelayHelp",
      colorLabel: "edFontColor",
      colorLast: true,
      colorHelp: "edMiniDelayColorHelp",
      fontHelp: "edMiniDelayFontHelp",
      // The red the part is drawn in, so an untouched swatch shows what is
      // actually there - the same colour the badge wears in a head.
      fallback: "var(--blitzer-delay-background, var(--error-color, #db4437))",
      icon: {
        key: "mini_delay_icon",
        label: "edSubIcon",
        help: "edMiniIconHelp",
        color: {
          key: "mini_delay_icon_color",
          label: "edSubIconColor",
          help: "edMiniIconColorHelp",
          fallback: "var(--blitzer-delay-background, var(--error-color, #db4437))",
        },
        size: { key: "mini_delay_icon_size", label: "edSubIconSize", help: "edMiniIconSizeHelp" },
      },
      extra: {
        key: "mini_delay_fill_color",
        label: "edMiniBg",
        help: "edMiniBgHelp",
        fallback: "var(--ha-card-background, var(--card-background-color))",
      },
      opacity: {
        key: "mini_delay_fill_opacity",
        label: "edMiniBgOpacity",
        help: "edMiniBgOpacityHelp",
      },
      hidden: (config) => config.layout !== "minimal" || config.show_delay === false,
    },
    pop_new: {
      label: "edElPopNew",
      help: "edElPopNewHelp",
      colorHelp: "edPopNewColorHelp",
      fontHelp: "edPopNewFontHelp",
      fallback: "var(--blitzer-new-color, #fff)",
      bgToggle: {
        key: "pop_new_background",
        label: "edPopNewBackground",
        help: "edPopNewBackgroundHelp",
      },
      extra: {
        key: "pop_new_background_color",
        label: "edPopNewBg",
        help: "edPopNewBgHelp",
        fallback: "var(--blitzer-new-background, var(--accent-color, #ff9800))",
      },
      // No list in the pop-up, no entries to tag.
      hidden: (config) =>
        config.layout !== "minimal" ||
        config.show_new === false ||
        config.show_list === false,
    },
    count: {
      label: "edElCount",
      help: "edElCountHelp",
      colorHelp: "edCountColorHelp",
      fontHelp: "edCountFontHelp",
      fallback: "var(--blitzer-count-color, var(--secondary-text-color))",
      bgToggle: { key: "count_background", label: "edCountBackground", help: "edCountBackgroundHelp" },
      extra: {
        key: "count_background_color",
        label: "edCountBg",
        help: "edCountBgHelp",
        fallback: "var(--blitzer-count-background, var(--secondary-background-color))",
      },
      // A badge in the head, and the minimal format has no head - nor is
      // there anything to draw once it is switched off.
      hidden: (config) =>
        config.layout === "minimal" || config.show_count === false,
    },
    // The one pair with a second colour each: the pill behind them, shown
    // only while "Show background" is on - Annuals' own badge arrangement.
    new: {
      label: "edElNew",
      help: "edElNewHelp",
      colorHelp: "edNewColorHelp",
      fontHelp: "edNewFontHelp",
      fallback: "var(--blitzer-new-color, #fff)",
      bgToggle: { key: "new_background", label: "edNewBackground", help: "edNewBackgroundHelp" },
      extra: {
        key: "new_background_color",
        label: "edNewBg",
        help: "edNewBgHelp",
        fallback: "var(--blitzer-new-background, var(--accent-color, #ff9800))",
      },
      // Follows the marker itself: with the marking switched off there is no
      // NEW badge and no NEW tag to give a look to. In the minimal format
      // neither is drawn here - the pop-up's tag has an element of its own.
      hidden: (config) => config.show_new === false || config.layout === "minimal",
    },
    // Its neighbour, and the same arrangement: a colour, a pill behind it
    // and the font the two share. Its own defaults are the theme's error
    // colour, which is what a badge about lost time renders in.
    delay: {
      label: "edElDelay",
      help: "edElDelayHelp",
      colorHelp: "edDelayColorHelp",
      fontHelp: "edDelayFontHelp",
      fallback: "var(--blitzer-delay-color, #fff)",
      bgToggle: { key: "delay_background", label: "edDelayBackground", help: "edDelayBackgroundHelp" },
      extra: {
        key: "delay_background_color",
        label: "edDelayBg",
        help: "edDelayBgHelp",
        fallback: "var(--blitzer-delay-background, var(--error-color, #db4437))",
      },
      // Follows its own switch, and the format: the badge is drawn in the
      // head, which the minimal format does not have.
      hidden: (config) => config.show_delay === false || config.layout === "minimal",
    },
    area_select: {
      label: "edElAreaPicker",
      help: "edElAreaPickerHelp",
      colorHelp: "edAreaPickerColorHelp",
      fontHelp: "edAreaPickerFontHelp",
      fallback: "var(--primary-text-color)",
      bgToggle: {
        key: "area_select_background",
        label: "edAreaPickerBackground",
        help: "edAreaPickerBackgroundHelp",
      },
      extra: {
        key: "area_select_background_color",
        label: "edAreaPickerBg",
        help: "edAreaPickerBgHelp",
        fallback: "var(--card-background-color)",
      },
      hidden: (config) =>
        config.show_area_picker === false || config.layout === "minimal",
    },
    sub: {
      label: "edElSub",
      help: "edElSubHelp",
      colorHelp: "edSubColorHelp",
      fontHelp: "edSubFontHelp",
      fallback: "var(--secondary-text-color)",
      // Its own icon first, with a colour and a size that do not follow the
      // words - left to right, the way the line itself reads. What the line
      // says is a question of content and lives under Settings -> General.
      icon: {
        key: "sub_icon",
        label: "edSubIcon",
        help: "edSubIconHelp",
        color: {
          key: "sub_icon_color",
          label: "edSubIconColor",
          help: "edSubIconColorHelp",
          fallback: "var(--secondary-text-color)",
        },
        size: { key: "sub_icon_size", label: "edSubIconSize", help: "edSubIconSizeHelp" },
      },
      // Gone with the line it describes - and the minimal format draws none.
      hidden: (config) => config.show_sub === false || config.layout === "minimal",
    },
    // Straight after the line it stands at the end of. Nothing but a symbol,
    // so it has no colour or typeface of its own beyond the symbol's.
    refresh: {
      label: "edElRefresh",
      help: "edElRefreshHelp",
      noColor: true,
      noFont: true,
      icon: {
        key: "refresh_icon",
        label: "edSubIcon",
        help: "edRefreshIconHelp",
        color: {
          key: "refresh_icon_color",
          label: "edRefreshColor",
          help: "edRefreshColorHelp",
          fallback: "var(--secondary-text-color)",
        },
        size: { key: "refresh_icon_size", label: "edRefreshSize", help: "edRefreshSizeHelp" },
      },
      hidden: (config) =>
        config.show_refresh === false ||
        config.show_sub === false ||
        config.layout === "minimal",
    },
    // Everything a list entry is made of, in the order it is drawn.
    highlight: {
      label: "edElHighlight",
      help: "edElHighlightHelp",
      // A backing, not a word on the card: one colour, no typeface, and it
      // is the background rather than the text that is being set.
      noColor: true,
      noFont: true,
      extra: {
        key: "highlight_color",
        label: "edHighlightBg",
        help: "edHighlightBgHelp",
        fallback: "rgba(var(--rgb-primary-color, 3, 169, 244), 0.22)",
      },
      tab: "map",
      hidden: (config) => config.map_highlight === false,
    },
    divider: {
      label: "edElDivider",
      help: "edElDividerHelp",
      colorHelp: "edDividerColorHelp",
      fallback: "var(--divider-color)",
      plainSize: { key: "divider_width", label: "edDividerWidth", help: "edDividerWidthHelp" },
      choice: {
        key: "divider_style",
        label: "edDividerStyle",
        help: "edDividerStyleHelp",
        options: [
          { value: "solid", label: "lineStyleSolid" },
          { value: "dashed", label: "lineStyleDashed" },
          { value: "dotted", label: "lineStyleDotted" },
        ],
      },
      noFont: true,
      tab: "list",
      hidden: (config) => config.show_divider === false,
    },
    row_picture: {
      label: "edElPicture",
      help: "edElPictureHelp",
      plainSize: { key: "row_picture_size", label: "edPictureSize", help: "edPictureSizeHelp" },
      // A drawing of Blitzer.de's own - nothing here to colour or to set in
      // a typeface, only how big it is.
      noColor: true,
      noFont: true,
      tab: "list",
      hidden: (config) => config.show_row_picture === false,
    },
    line1: {
      label: "edElLine1",
      help: "edElLine1Help",
      colorHelp: "edLine1ColorHelp",
      fontHelp: "edLine1FontHelp",
      fallback: "var(--primary-text-color)",
      // No icon of its own: the entry already opens with Blitzer.de's own
      // drawing, and a second symbol on the same line says nothing more.
      tab: "list",
      hidden: (config) => config.show_row_line1 === false,
    },
    line2: {
      label: "edElLine2",
      help: "edElLine2Help",
      colorHelp: "edLine2ColorHelp",
      fontHelp: "edLine2FontHelp",
      fallback: "var(--secondary-text-color)",
      icon: {
        key: "line2_icon",
        label: "edSubIcon",
        help: "edSubIconHelp",
        color: { key: "line2_icon_color", label: "edSubIconColor", help: "edSubIconColorHelp", fallback: "var(--secondary-text-color)" },
        size: { key: "line2_icon_size", label: "edSubIconSize", help: "edSubIconSizeHelp" },
      },
      tab: "list",
      hidden: (config) => config.show_row_line2 === false,
    },
    extra: {
      label: "edElExtra",
      help: "edElExtraHelp",
      colorHelp: "edExtraColorHelp",
      fontHelp: "edExtraFontHelp",
      fallback: "var(--secondary-text-color)",
      icon: {
        key: "extra_icon",
        label: "edSubIcon",
        help: "edSubIconHelp",
        color: { key: "extra_icon_color", label: "edSubIconColor", help: "edSubIconColorHelp", fallback: "var(--secondary-text-color)" },
        size: { key: "extra_icon_size", label: "edSubIconSize", help: "edSubIconSizeHelp" },
      },
      tab: "list",
      hidden: (config) => config.show_row_extra === false,
    },
    chip: {
      label: "edElChip",
      help: "edElChipHelp",
      colorHelp: "edChipColorHelp",
      fontHelp: "edChipFontHelp",
      fallback: "var(--secondary-text-color)",
      bgToggle: { key: "chip_background", label: "edChipBackground", help: "edChipBackgroundHelp" },
      extra: {
        key: "chip_background_color",
        label: "edChipBg",
        help: "edChipBgHelp",
        fallback: "var(--blitzer-row-chip-background, rgba(128, 128, 128, 0.12))",
      },
      tab: "list",
      hidden: (config) =>
        config.show_row_reported === false && config.show_row_confirmed === false,
    },
    stars: {
      label: "edElStars",
      help: "edElStarsHelp",
      plainSize: { key: "stars_size", label: "edStarsSize", help: "edStarsSizeHelp" },
      colorHelp: "edStarsColorHelp",
      fallback: "var(--blitzer-row-stars-color, var(--primary-text-color))",
      // Shapes, not words: a colour and a size, but no typeface.
      noFont: true,
      tab: "list",
      hidden: (config) => config.show_row_stars === false,
    },
    filter_select: {
      label: "edElFilterPicker",
      help: "edElFilterPickerHelp",
      colorHelp: "edFilterPickerColorHelp",
      fontHelp: "edFilterPickerFontHelp",
      fallback: "var(--primary-text-color)",
      bgToggle: {
        key: "filter_select_background",
        label: "edFilterPickerBackground",
        help: "edFilterPickerBackgroundHelp",
      },
      extra: {
        key: "filter_select_background_color",
        label: "edFilterPickerBg",
        help: "edFilterPickerBgHelp",
        fallback: "var(--card-background-color)",
      },
      hidden: (config) =>
        config.show_filter_picker === false || config.layout === "minimal",
    },
  };

  class BlitzerCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = defaultConfig(config);
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    _emit() {
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: pruneDefaults(this._config) },
          bubbles: true,
          composed: true,
        })
      );
    }

    _set(key, value) {
      this._config = { ...this._config, [key]: value };
      this._emit();
      this._syncValues();
    }

    // An open colour menu is closed by anything that says "not this": a
    // click that lands somewhere else, or Escape. Without these the only way
    // out was the button the menu had just covered, which is not where
    // anybody looks - and a menu left standing over the form reads as a form
    // that has stopped working.
    //
    // On the window rather than on our own root, because a click on the card
    // preview beside the form never reaches the form at all, and while it is
    // going down rather than coming back up, so that nothing can swallow it
    // on the way.
    connectedCallback() {
      if (!this._onOutsideClick) {
        this._onOutsideClick = (ev) => this._closeMenus(ev.composedPath());
        this._onMenuEscape = (ev) => {
          // Only when one of ours is open. Otherwise Escape still belongs to
          // the dialog around us, and closing that is what it should do.
          //
          // Both halves are needed: stopPropagation keeps Home Assistant out
          // of it, and preventDefault is what keeps the dialog itself open -
          // a dialog closes on Escape by the browser's own doing rather than
          // by a listener anybody can stop.
          if (ev.key !== "Escape" || !this._closeMenus([])) return;
          ev.stopPropagation();
          ev.preventDefault();
        };
      }
      window.addEventListener("pointerdown", this._onOutsideClick, true);
      window.addEventListener("keydown", this._onMenuEscape, true);
    }

    disconnectedCallback() {
      window.removeEventListener("pointerdown", this._onOutsideClick, true);
      window.removeEventListener("keydown", this._onMenuEscape, true);
    }

    // Closes every open colour menu except the one the event happened
    // inside, and says whether it closed anything. The exception is what
    // leaves the button its own toggle and a preset its own click: both
    // happen inside the menu's own .preset-select, which handles them.
    //
    // Read off composedPath() rather than the target, since the target of a
    // click inside a shadow root is retargeted to the host on the way out.
    _closeMenus(path) {
      if (!this.shadowRoot) return false;
      let closed = false;
      for (const menu of this.shadowRoot.querySelectorAll(".preset-menu")) {
        if (menu.hidden || path.includes(menu.parentElement)) continue;
        menu.hidden = true;
        closed = true;
      }
      return closed;
    }

    // Accordion: opening one panel closes the other, as in Annuals. Both start
    // closed, so the form opens as two lines rather than a wall of fields.
    _toggleSuper(key) {
      this.shadowRoot.querySelectorAll(".super-panel").forEach((panel) => {
        panel.classList.toggle(
          "open",
          panel.dataset.super === key && !panel.classList.contains("open")
        );
      });
    }

    _selectTab(superKey, groupKey) {
      const panel = this.shadowRoot.querySelector(`.super-panel[data-super="${superKey}"]`);
      if (!panel) return;
      panel.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.key === groupKey);
      });
      panel.querySelectorAll(".group-body").forEach((body) => {
        body.hidden = body.dataset.group !== groupKey;
      });
    }

    _groupText(key, str) {
      return {
        general: str.edGroupGeneral,
        content: str.edGroupContent,
        rows: str.edGroupRows,
        display: str.edGroupDisplay,
        map: str.edGroupMap,
        list: str.edGroupList,
      }[key];
    }

    _hasFocus(el) {
      return !!el && this.shadowRoot.activeElement === el;
    }

    // Annuals' own row: label line with its "i", then the control inside a
    // .field-input-row.
    _fieldRow(label, tooltip, inner, sub) {
      const row = document.createElement("div");
      row.className = sub ? "field-row sub-field-row" : "field-row";
      // No "i" where there is nothing to say: an anchor with an empty tooltip
      // still draws its icon and opens an empty box on hover.
      row.innerHTML = `
        <div class="field-label">
          <span class="label-text"></span>
          ${tooltip
            ? `<span class="tooltip-anchor" data-tooltip="">
                 <ha-icon icon="mdi:information-outline"></ha-icon>
               </span>`
            : ""}
        </div>
        <div class="field-input-row"></div>`;
      row.querySelector(".label-text").textContent = label;
      const anchor = row.querySelector(".tooltip-anchor");
      if (anchor) anchor.dataset.tooltip = tooltip;
      if (inner) row.querySelector(".field-input-row").appendChild(inner);
      return row;
    }

    // Names the indented block below it and carries no control of its own -
    // the heading a design block gets in Annuals. Here it doubles as the
    // block's own handle: one element's settings are eight rows, and three
    // of them stacked is a long scroll to reach the third.
    // `collapsible` false gives a plain heading: the Content tab's two blocks
    // are always open, and a chevron there would promise a fold that is not
    // there.
    _groupLabelRow(label, tooltip, collapsible = true) {
      const row = this._fieldRow(label, tooltip, null);
      row.classList.add("group-label-row");
      row.querySelector(".field-input-row").remove();
      if (!collapsible) {
        row.classList.add("plain-label-row");
        return row;
      }

      const chevron = document.createElement("ha-icon");
      chevron.className = "design-chevron";
      chevron.icon = "mdi:chevron-down";
      row.querySelector(".field-label").appendChild(chevron);

      row.tabIndex = 0;
      row.setAttribute("role", "button");
      // Reading the "i" must not fold the block away underneath the cursor.
      row.querySelector(".tooltip-anchor").addEventListener("click", (ev) => ev.stopPropagation());
      const toggle = () => {
        const block = row.closest(".design-element");
        if (!block) return;
        const open = !block.classList.contains("open");
        // One at a time, the way the two big panels above already behave.
        block.parentElement.querySelectorAll(".design-element").forEach((el) => {
          el.classList.toggle("open", el === block && open);
          const head = el.querySelector(".group-label-row");
          if (head) head.setAttribute("aria-expanded", el === block && open ? "true" : "false");
        });
      };
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        toggle();
      });
      row.setAttribute("aria-expanded", "false");
      return row;
    }

    _textInput(key, placeholder) {
      const input = document.createElement("input");
      input.type = "text";
      input.dataset.field = key;
      input.placeholder = placeholder || "";
      input.addEventListener("input", () => this._set(key, input.value));
      return input;
    }

    _numberInput(key, min, max, step) {
      const input = document.createElement("input");
      input.type = "number";
      input.dataset.field = key;
      input.min = min;
      input.max = max;
      if (step) input.step = step;
      input.addEventListener("input", () => {
        const value = step ? Number.parseFloat(input.value) : Number.parseInt(input.value, 10);
        this._set(key, Number.isFinite(value) ? value : min);
      });
      return input;
    }

    _select(key, options) {
      const select = document.createElement("select");
      select.dataset.field = key;
      for (const option of options) {
        const el = document.createElement("option");
        el.value = option.value;
        el.textContent = option.label;
        select.appendChild(el);
      }
      select.addEventListener("change", () => this._set(key, select.value));
      return select;
    }

    // Only where a plain input cannot do the job - picking a device or an
    // entity needs Home Assistant's own picker.
    _picker(key, selector) {
      const control = document.createElement("ha-selector");
      control.selector = selector;
      control.dataset.key = key;
      // Every option here is optional; without this the pickers draw the
      // asterisk that means "you have to fill this in".
      control.required = false;
      control.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._set(key, ev.detail.value);
      });
      return control;
    }

    // A switch with its label beside it, as in the Annuals editor - not a
    // labelled row with a control below, because a switch reads as one line.
    // `invert` drives a "Hide" switch off a "show" config key, the way
    // Annuals' own Hide-title toggle does, so no config key had to be flipped.
    _toggleRow(key, label, tooltip, invert) {
      const row = document.createElement("div");
      row.className = "toggle-row";
      row.innerHTML = `
        <label class="toggle">
          <input type="checkbox" data-toggle="${key}"${invert ? ' data-invert="1"' : ""}>
          <span class="track"></span>
        </label>
        <span class="toggle-label"></span>
        ${tooltip
          ? `<span class="tooltip-anchor" data-tooltip="">
               <ha-icon icon="mdi:information-outline"></ha-icon>
             </span>`
          : ""}`;
      row.querySelector(".toggle-label").textContent = label;
      const anchor = row.querySelector(".tooltip-anchor");
      if (anchor) anchor.dataset.tooltip = tooltip;
      row.querySelector("input").addEventListener("change", (ev) =>
        this._set(key, invert ? !ev.target.checked : ev.target.checked)
      );
      return row;
    }

    // The card's own background: a switch, a colour, an image with an upload
    // and a preview, how that image meets the edges, and how much of both
    // comes through. Built by hand rather than from DESIGN_ELEMENTS - that
    // table describes a run of text, and none of this is one - but wearing
    // the same collapsible block so it folds with its neighbours.
    _backgroundBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "card_background";
      block.appendChild(this._groupLabelRow(str.edElCardBg, str.edElCardBgHelp));

      const on = this._toggleRow("card_background", str.edCardBgEnable, str.edCardBgEnableHelp);
      on.classList.add("sub-field-row", "sub-toggle-row");
      block.appendChild(on);

      // Everything below the switch describes a background that is not being
      // drawn until it is on, so it waits until then. Kept in the DOM rather
      // than rebuilt, so the wiring survives being switched off and on.
      const wanted = [];
      const add = (row) => { wanted.push(row); block.appendChild(row); };
      add(this._colorRow("card_background_color", str.edCardBgColor, str.edCardBgColorHelp, str));

      const image = this._textInput("card_background_image", str.edCardBgImagePlaceholder);
      const upload = document.createElement("button");
      upload.type = "button";
      upload.className = "upload-btn";
      upload.title = str.edCardBgUpload;
      upload.innerHTML = `<ha-icon icon="mdi:upload"></ha-icon>`;
      const imageRow = this._fieldRow(str.edCardBgImage, str.edCardBgImageHelp, image, true);
      imageRow.querySelector(".field-input-row").appendChild(upload);
      const preview = document.createElement("div");
      preview.className = "bg-image-preview";
      preview.dataset.bgPreview = "";
      preview.hidden = true;
      preview.innerHTML = `<img alt=""><button type="button" class="bg-image-clear"
        title="${escapeHtml(str.edCardBgClear)}"><ha-icon icon="mdi:close"></ha-icon></button>`;
      imageRow.appendChild(preview);
      add(imageRow);

      add(this._fieldRow(str.edCardBgSize, str.edCardBgSizeHelp,
        this._select("card_background_size", [
          { value: "cover", label: str.bgSizeCover },
          { value: "contain", label: str.bgSizeContain },
          { value: "auto", label: str.bgSizeAuto },
          { value: "repeat", label: str.bgSizeRepeat },
        ]), true));

      // A number that is a percentage says so inside the field, the way
      // Annuals writes one - a label reading "(%)" is a second thing to read
      // where the field can say it itself.
      const opacity = document.createElement("div");
      opacity.className = "unit-input-wrap";
      opacity.appendChild(this._numberInput("card_background_opacity", 0, 100));
      const suffix = document.createElement("span");
      suffix.className = "unit-suffix";
      suffix.textContent = "%";
      opacity.appendChild(suffix);
      add(this._fieldRow(str.edCardBgOpacity, str.edCardBgOpacityHelp, opacity, true));

      for (const row of wanted) row.dataset.withCardBg = "";

      // Uploads go through Home Assistant's own image endpoint - the one its
      // dashboard and area pickers use - so what comes back is an ordinary
      // /api/image/serve URL that the text field can hold like any other.
      const setImage = (value) => {
        this._set("card_background_image", value);
        // Picking an image is the clearest way of saying it should be shown.
        // Without this, an upload lands in a background that is switched off
        // and nothing appears to have happened.
        if (value && this._config.card_background !== true) this._set("card_background", true);
        this._syncValues();
      };
      upload.addEventListener("click", () => this._uploadBackground(setImage));
      preview.querySelector(".bg-image-clear").addEventListener("click", () => setImage(""));
      return block;
    }

    // The route line: its colour and its width, in a collapsible block of
    // their own like the card background. The block answers to "Show the
    // route on the map" under Settings -> General and hides with it.
    _routeBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "route";
      block.dataset.withRoute = "";
      block.appendChild(this._groupLabelRow(str.edElRoute, str.edElRouteHelp));
      block.appendChild(this._colorRow("route_color", str.edRouteColor, str.edRouteColorHelp, str));
      const width = document.createElement("div");
      width.className = "unit-input-wrap";
      width.appendChild(this._numberInput("route_width", 1, 12));
      const suffix = document.createElement("span");
      suffix.className = "unit-suffix";
      suffix.textContent = "px";
      width.appendChild(suffix);
      block.appendChild(this._fieldRow(str.edRouteWidth, str.edRouteWidthHelp, width, true));
      return block;
    }

    // The traffic flow's lines: width and opacity. Answers to "Show the
    // traffic flow" under Settings -> General, the way the route block
    // answers to the route switch.
    _trafficBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "traffic";
      block.dataset.withTraffic = "";
      block.appendChild(this._groupLabelRow(str.edElTraffic, str.edElTrafficHelp));
      const width = document.createElement("div");
      width.className = "unit-input-wrap";
      width.appendChild(this._numberInput("traffic_width", 0.5, 10, 0.1));
      const px = document.createElement("span");
      px.className = "unit-suffix";
      px.textContent = "px";
      width.appendChild(px);
      block.appendChild(this._fieldRow(str.edTrafficWidth, str.edTrafficWidthHelp, width, true));
      const opacity = document.createElement("div");
      opacity.className = "unit-input-wrap";
      opacity.appendChild(this._numberInput("traffic_opacity", 10, 100));
      const pct = document.createElement("span");
      pct.className = "unit-suffix";
      pct.textContent = "%";
      opacity.appendChild(pct);
      block.appendChild(this._fieldRow(str.edTrafficOpacity, str.edTrafficOpacityHelp, opacity, true));
      return block;
    }

    // The cluster discs: the disc's colour and the count's, in a collapsible
    // block of their own. The block answers to "Group nearby reports" just
    // above it and hides with it; empty keeps the theme's colours.
    _clusterBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "cluster";
      block.dataset.withCluster = "";
      block.appendChild(this._groupLabelRow(str.edElCluster, str.edElClusterHelp));
      // Bubble or disc - only a choice from 2026.10, so it is greyed out
      // before that the same way the grouping switch is.
      const styleRow = this._fieldRow(
        str.edClusterStyle,
        str.edClusterStyleHelp,
        this._select("cluster_style", [
          { value: "bubble", label: str.clusterStyleBubble },
          { value: "disc", label: str.clusterStyleDisc },
        ]),
        true
      );
      styleRow.dataset.needsCluster = "";
      block.appendChild(styleRow);
      block.appendChild(this._colorRow("cluster_color", str.edClusterColor, str.edClusterColorHelp, str));
      block.appendChild(
        this._colorRow("cluster_text_color", str.edClusterTextColor, str.edClusterTextColorHelp, str)
      );
      // The count's size and style - the font row every text element has,
      // less the capitals switch: a number has none.
      const row = this._fieldRow(str.edClusterFont, str.edClusterFontHelp, null, true);
      const slot = row.querySelector(".field-input-row");
      const size = document.createElement("input");
      size.type = "text";
      size.dataset.field = "cluster_font_size";
      size.placeholder = str.edFontPlaceholder;
      size.addEventListener("input", () => this._set("cluster_font_size", size.value));
      slot.appendChild(size);
      const toggles = document.createElement("div");
      toggles.className = "field-toggles";
      for (const [attr, text] of [
        ["bold", str.edBold],
        ["italic", str.edItalic],
        ["underline", str.edUnderline],
      ]) {
        const group = document.createElement("div");
        group.className = "toggle-group";
        group.innerHTML = `
          <label class="toggle">
            <input type="checkbox" data-toggle="cluster_${attr}">
            <span class="track"></span>
          </label>
          <span class="toggle-label toggle-label-${attr}"></span>`;
        group.querySelector(".toggle-label").textContent = text;
        group.querySelector("input").addEventListener("change", (ev) =>
          this._set(`cluster_${attr}`, ev.target.checked)
        );
        toggles.appendChild(group);
      }
      slot.appendChild(toggles);
      block.appendChild(row);
      return block;
    }

    // The file input is created on document.body rather than kept in this
    // shadow root: inside the dialog, the native file picker handing focus
    // back is read as a click outside it, and the whole editor closes before
    // the pick is even delivered.
    async _uploadBackground(setImage) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.cssText = "position: fixed; opacity: 0; pointer-events: none";
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file || !this._hass) return;
        const body = new FormData();
        body.append("file", file);
        try {
          const response = await fetch("/api/image/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${this._hass.auth.data.access_token}` },
            body,
          });
          if (!response.ok) throw new Error(`upload failed: ${response.status}`);
          const result = await response.json();
          setImage(`/api/image/serve/${result.id}/original`);
        } catch (err) {
          console.error("blitzer-card: background image upload failed", err);
        }
      });
      input.click();
    }

    // A switch that rides on another row's label line instead of taking a
    // row of its own, right aligned. The arrangement "Show background"
    // already has on a colour row, and what "Hide" wants against the field
    // it empties: the two are one setting, and a row of their own made them
    // read as two.
    _inlineToggle(key, label, tooltip, invert) {
      const group = this._toggleRow(key, label, tooltip, invert);
      group.className = "toggle-group inline-toggle";
      return group;
    }

    // Preset dropdown, free-text field and native colour square, in that
    // order - Annuals' colour row exactly.
    // `bgToggle` puts a switch of its own on the row's second line, right
    // aligned - the way Annuals hangs "Show background" off the badge's own
    // colour row rather than giving it a row of its own.
    _colorRow(key, label, tooltip, str, bgToggle) {
      const row = this._fieldRow(label, tooltip, null, true);
      const slot = row.querySelector(".field-input-row");
      slot.innerHTML = `
        <div class="preset-select" data-preset-for="${key}">
          <button type="button" class="preset-btn">
            <span class="preset-swatch"></span>
            <span class="preset-name"></span>
            <ha-icon icon="mdi:menu-down"></ha-icon>
          </button>
          <div class="preset-menu" hidden></div>
        </div>
        <input type="text" data-color-text="${key}">
        <input type="color" data-color="${key}">`;

      const menu = slot.querySelector(".preset-menu");
      for (const preset of PRESET_COLORS) {
        const item = document.createElement("div");
        item.className = "preset-item";
        item.innerHTML = `<span class="preset-swatch"></span><span class="preset-item-name"></span>`;
        const swatch = item.querySelector(".preset-swatch");
        swatch.style.background = preset.value || "transparent";
        if (!preset.value) swatch.style.boxShadow = "inset 0 0 0 2px var(--divider-color, #ccc)";
        item.querySelector(".preset-item-name").textContent = str[preset.labelKey] || preset.key;
        item.addEventListener("click", () => {
          this._set(key, preset.value);
          menu.hidden = true;
        });
        menu.appendChild(item);
      }

      const select = slot.querySelector(".preset-select");
      select.querySelector(".preset-btn").addEventListener("click", (ev) => {
        ev.stopPropagation();
        const isOpen = !menu.hidden;
        this.shadowRoot.querySelectorAll(".preset-menu").forEach((m) => (m.hidden = true));
        if (!isOpen) {
          // The edit dialog scrolls internally and clips this menu well before
          // the browser viewport does, so measure against the nearest actual
          // scrolling ancestor - and on every open, since both the scroll
          // offset and the button's position move between opens.
          //
          // Whichever side has more room wins, and the menu is then capped to
          // that room. Opening upward on its own was not enough: near the top
          // of the dialog the menu simply ran off the other end instead, with
          // its first entries out of reach.
          const rect = select.getBoundingClientRect();
          const box = this._scrollAncestorRect();
          const below = box.bottom - rect.bottom - 8;
          const above = rect.top - box.top - 8;
          const up = above > below;
          menu.classList.toggle("menu-up", up);
          menu.style.maxHeight = `${Math.max(120, Math.min(260, up ? above : below))}px`;
        }
        menu.hidden = isOpen;
      });

      const textInput = slot.querySelector(`input[data-color-text="${key}"]`);
      const colorInput = slot.querySelector(`input[data-color="${key}"]`);
      textInput.placeholder = str.edColorPlaceholder;
      textInput.addEventListener("input", () => this._set(key, textInput.value));
      colorInput.addEventListener("input", () => this._set(key, colorInput.value));

      if (bgToggle) {
        const group = document.createElement("div");
        group.className = "toggle-group";
        group.innerHTML = `
          <label class="toggle">
            <input type="checkbox" data-toggle="${bgToggle.key}">
            <span class="track"></span>
          </label>
          <span class="toggle-label"></span>
          <span class="tooltip-anchor" data-tooltip="">
            <ha-icon icon="mdi:information-outline"></ha-icon>
          </span>`;
        group.querySelector(".toggle-label").textContent = str[bgToggle.label];
        const help = str[bgToggle.help];
        const anchor = group.querySelector(".tooltip-anchor");
        if (help) anchor.dataset.tooltip = help;
        else anchor.remove();
        group.querySelector("input").addEventListener("change", (ev) =>
          this._set(bgToggle.key, ev.target.checked)
        );
        slot.appendChild(group);
      }
      return row;
    }

    // Size field with Bold/Italic/Uppercase/Underline beside it, then letter
    // spacing on its own indented line underneath.
    _fontRows(key, label, tooltip, str) {
      const rows = document.createElement("div");
      const row = this._fieldRow(label, tooltip, null, true);
      const slot = row.querySelector(".field-input-row");

      const size = document.createElement("input");
      size.type = "text";
      size.dataset.field = `${key}_font_size`;
      size.placeholder = str.edFontPlaceholder;
      size.addEventListener("input", () => this._set(`${key}_font_size`, size.value));
      slot.appendChild(size);

      const toggles = document.createElement("div");
      toggles.className = "field-toggles";
      for (const [attr, text] of [
        ["bold", str.edBold],
        ["italic", str.edItalic],
        ["uppercase", str.edUppercase],
        ["underline", str.edUnderline],
      ]) {
        const group = document.createElement("div");
        group.className = "toggle-group";
        group.innerHTML = `
          <label class="toggle">
            <input type="checkbox" data-toggle="${key}_${attr}">
            <span class="track"></span>
          </label>
          <span class="toggle-label toggle-label-${attr}"></span>`;
        group.querySelector(".toggle-label").textContent = text;
        group.querySelector("input").addEventListener("change", (ev) =>
          this._set(`${key}_${attr}`, ev.target.checked)
        );
        toggles.appendChild(group);
      }
      slot.appendChild(toggles);
      rows.appendChild(row);

      const spacing = this._fieldRow(
        str.edLetterSpacing,
        str.edLetterSpacingHelp,
        this._textInput(`${key}_letter_spacing`, str.edLetterSpacingPlaceholder),
        true
      );
      spacing.classList.add("sub-field-row-nested");
      rows.appendChild(spacing);
      return rows;
    }

    // The Card title block under Layout -> General: its own heading, then
    // colour, font and letter spacing indented beneath it. Hidden as a whole
    // when the title is switched off in Settings -> General, so there is
    // nothing to style for something that is not drawn.
    _designElement(prefix, el, str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = prefix;
      block.appendChild(this._groupLabelRow(str[el.label], str[el.help]));
      // A plain measurement of its own - the rule's width, the symbol's size,
      // the stars' size. Elements that are not text have this instead of the
      // font block below. Width first, then style, then colour: Annuals' own
      // order for a line.
      if (el.plainSize) {
        block.appendChild(
          this._fieldRow(
            str[el.plainSize.label],
            str[el.plainSize.help],
            this._textInput(el.plainSize.key, str.edFontPlaceholder),
            true
          )
        );
      }
      // A dropdown of its own - the rule's line style is the one setting here
      // that is a choice rather than a measurement.
      if (el.choice) {
        block.appendChild(
          this._fieldRow(
            str[el.choice.label],
            str[el.choice.help],
            this._select(
              el.choice.key,
              el.choice.options.map((o) => ({ value: o.value, label: str[o.label] }))
            ),
            true
          )
        );
      }
      if (el.icon) {
        block.appendChild(
          this._fieldRow(str[el.icon.label], str[el.icon.help], this._picker(el.icon.key, { icon: {} }), true)
        );
        if (el.icon.color) {
          block.appendChild(
            this._colorRow(el.icon.color.key, str[el.icon.color.label], str[el.icon.color.help], str)
          );
        }
        if (el.icon.size) {
          block.appendChild(
            this._fieldRow(
              str[el.icon.size.label],
              str[el.icon.size.help],
              this._textInput(el.icon.size.key, str.edFontPlaceholder),
              true
            )
          );
        }
      }
      for (const part of el.parts || []) {
        const row = this._toggleRow(part.key, str[part.label], str[part.help]);
        row.classList.add("sub-field-row", "sub-toggle-row");
        block.appendChild(row);
      }
      const colorRow = el.noColor
        ? null
        : this._colorRow(
            `${prefix}_color`,
            str[el.colorLabel] || str.edColor,
            str[el.colorHelp],
            str,
            el.bgToggle
          );
      // Normally the element's own colour comes first and a background
      // colour hangs off it. Where the block has a fill of its own instead,
      // the fill leads and the type - colour and font together - follows.
      if (colorRow && !el.colorLast) block.appendChild(colorRow);
      if (el.extra) {
        block.appendChild(this._colorRow(el.extra.key, str[el.extra.label], str[el.extra.help], str));
      }
      // How much of that colour comes through. A percentage, so the unit
      // goes inside the field the way the card background's does.
      if (el.opacity) {
        const wrap = document.createElement("div");
        wrap.className = "unit-input-wrap";
        wrap.appendChild(this._numberInput(el.opacity.key, 0, 100));
        const suffix = document.createElement("span");
        suffix.className = "unit-suffix";
        suffix.textContent = "%";
        wrap.appendChild(suffix);
        block.appendChild(
          this._fieldRow(str[el.opacity.label], str[el.opacity.help], wrap, true)
        );
      }
      if (colorRow && el.colorLast) block.appendChild(colorRow);
      // Only what carries text gets a font.
      if (!el.noFont) {
        block.appendChild(this._fontRows(prefix, str.edFont, str[el.fontHelp], str));
      }
      return block;
    }

    // Stands in for a tab's settings while the part of the card they describe
    // is switched off, so the tab is still there to be found - just with the
    // one thing to do first. `kind` is what has to be switched on: "list" or
    // "map", which is also how _syncValues knows when to show the note.
    // Stands in for a tab whose part of the card is switched off - in the
    // minimal format that part is the pop-up's map, and the switch that puts
    // it back is in the same place either way.
    _offNote(kind, str) {
      const note = document.createElement("div");
      note.className = "off-note";
      note.dataset.off = kind;
      note.textContent = kind === "map" ? str.edMapOff : str.edListOff;
      return note;
    }

    // One half of a row in the Content tab: a heading and the rows that belong
    // under it - switches that offer a choice, the choice itself, and anything
    // hanging off one of them. Controls come wrapped in _bareRow.
    _contentBlock(label, tooltip, rows) {
      const block = document.createElement("div");
      block.className = "content-block";
      block.appendChild(this._groupLabelRow(label, tooltip, false));
      for (const row of rows) if (row) block.appendChild(row);
      return block;
    }

    // A control on a line of its own. No label beside it: inside a content
    // block the block's own heading is the label.
    _bareRow(control) {
      const row = this._fieldRow("", "", control);
      row.querySelector(".field-label").remove();
      return row;
    }

    _buildGroup(groupKey, str) {
      const body = document.createElement("div");
      body.className = "group-body";
      body.dataset.group = groupKey;

      if (groupKey === "general") {
        // First, because it decides what the card is before anything else
        // here decides how it looks.
        body.appendChild(
          this._fieldRow(str.edLayout, str.edLayoutHelp,
            this._select("layout", [
              { value: "portrait", label: str.layoutPortrait },
              { value: "landscape", label: str.layoutLandscape },
              { value: "minimal", label: str.layoutMinimal },
            ]))
        );
        // "Hide" sits on the title's own label line rather than on a row of
        // its own: it is not a second setting but the same one, saying that
        // whatever the field below holds is not to be drawn.
        const titleRow = this._fieldRow(
          str.edTitle, str.edTitleHelp, this._textInput("title", str.title)
        );
        titleRow
          .querySelector(".field-label")
          .appendChild(
            this._inlineToggle("show_title", str.edHideTitle, str.edHideTitleHelp, true)
          );
        body.appendChild(titleRow);
        // Straight behind the title, because in the minimal format the two
        // are the whole of what the card is: a line one taps, and the words
        // its pop-up wears. Home Assistant's own action picker rather than
        // one of ours, so that what this card offers is what every other card
        // offers, down to the wording.
        const tap = this._fieldRow(str.edMiniTap, str.edMiniTapHelp,
          this._picker("mini_tap_action", {
            ui_action: {
              actions: ["more-info", "navigate", "url", "perform-action", "toggle", "none"],
            },
          }));
        tap.dataset.withMinimal = "";
        body.appendChild(tap);
        // Straight after the title pair, since it is the card's other piece of
        // fixed wording - the one it falls back to when the area turns out
        // empty. Never in the minimal format: a number of nothing opens no
        // pop-up, so there is nowhere left for this wording to appear.
        const nothing = this._fieldRow(
          str.edNothing, str.edNothingHelp, this._textInput("no_reports_text", str.nothing)
        );
        nothing.dataset.withoutMinimal = "";
        body.appendChild(nothing);
        // Then which of the numbers are shown at all - how much there is,
        // and how much of it is new - in the order the head reads them.
        // The first of the two is a different switch per format and only
        // ever one of them is offered: the badge beside the title where
        // there is a head, the left half of the line where there is not.
        const count = this._toggleRow("show_count", str.edShowCount, str.edShowCountHelp);
        count.dataset.withoutMinimal = "";
        body.appendChild(count);
        const miniTotal = this._toggleRow("mini_show_total", str.edMiniTotal, str.edMiniTotalHelp);
        miniTotal.dataset.withMinimal = "";
        body.appendChild(miniTotal);

        body.appendChild(this._toggleRow("show_new", str.edShowNew, str.edShowNewHelp));

        // Under it, because the two stand next to each other wherever they
        // are drawn: the badges beside the title in a head, the second and
        // third part of the line where there is none.
        body.appendChild(this._toggleRow("show_delay", str.edShowDelay, str.edShowDelayHelp));

        // The line under the title: whether it is drawn at all, then each of
        // the three things it can say, indented beneath that. The minimal
        // format draws no such line, so it is not offered one.
        const sub = this._toggleRow("show_sub", str.edShowSub, str.edShowSubHelp);
        sub.dataset.withoutMinimal = "";
        body.appendChild(sub);
        for (const part of [
          { key: "sub_show_area", label: "edSubArea", help: "edSubAreaHelp" },
          { key: "sub_show_mode", label: "edSubMode", help: "edSubModeHelp" },
          { key: "sub_show_updated", label: "edSubUpdated", help: "edSubUpdatedHelp" },
          // Last of them, where it is drawn: after the moment the card last
          // looked comes the way to make it look again.
          { key: "show_refresh", label: "edShowRefresh", help: "edShowRefreshHelp" },
        ]) {
          const row = this._toggleRow(part.key, str[part.label], str[part.help]);
          row.classList.add("sub-field-row", "sub-toggle-row");
          row.dataset.withSub = "";
          body.appendChild(row);
        }
        // Whether there is a map at all. Its looks stay under Layout -> Map,
        // and "the list follows it" is a property of the list.
        body.appendChild(this._toggleRow("show_map", str.edShowMap, str.edShowMapHelp));
        // Whether the map stays while there is nothing to put on it.
        const alwaysRow = this._toggleRow("map_always", str.edMapAlways, str.edMapAlwaysHelp);
        alwaysRow.classList.add("sub-field-row", "sub-toggle-row");
        alwaysRow.dataset.withMap = "";
        body.appendChild(alwaysRow);
        // Whether a route entry's route is drawn on it - indented under the
        // map switch, since without a map there is nothing to draw it on.
        // Its looks are under Layout -> Map.
        const routeRow = this._toggleRow("map_route", str.edMapRoute, str.edMapRouteHelp);
        routeRow.classList.add("sub-field-row", "sub-toggle-row");
        routeRow.dataset.withMap = "";
        body.appendChild(routeRow);
        // And an official closure's stretch of road, drawn the same way.
        const closuresRow = this._toggleRow("map_closures", str.edMapClosures, str.edMapClosuresHelp);
        closuresRow.classList.add("sub-field-row", "sub-toggle-row");
        closuresRow.dataset.withMap = "";
        body.appendChild(closuresRow);
        // And Blitzer.de's traffic flow on the roads, fetched for the view
        // while the card is on screen. Drawn into the map's own engine, so
        // it needs 2026.10's map, like the grouping switch.
        const trafficRow = this._toggleRow("map_traffic", str.edMapTraffic, str.edMapTrafficHelp);
        trafficRow.classList.add("sub-field-row", "sub-toggle-row");
        trafficRow.dataset.withMap = "";
        trafficRow.dataset.needsCluster = "";
        body.appendChild(trafficRow);
        body.appendChild(this._toggleRow("show_list", str.edShowList, str.edShowListHelp));
        // Last, because it is the one setting here that is about the map and
        // the list together rather than about either on its own.
        const highlight = this._toggleRow("map_highlight", str.edMapHighlight, str.edMapHighlightHelp);
        highlight.dataset.withMap = "";
        body.appendChild(highlight);
      }

      if (groupKey === "content") {
        // The two things a card is pointed at - where it looks and what it
        // keeps - side by side and equally wide, each read top to bottom:
        // what it is, whether the card offers the choice, and the choice.
        const pair = document.createElement("div");
        pair.className = "content-pair";
        pair.appendChild(
          this._contentBlock(str.edAreas, str.edAreasHelp, [
            this._toggleRow("show_area_picker", str.edAreaPicker, str.edAreaPickerHelp),
            this._bareRow(
              this._picker("areas", { device: { multiple: true, filter: { integration: DOMAIN } } })
            ),
          ])
        );
        pair.appendChild(
          this._contentBlock(str.edGroupContentFilter, str.edFilterHelp, [
            this._toggleRow("show_filter_picker", str.edFilterPicker, str.edFilterPickerHelp),
            this._bareRow(
              this._select("filter", [
                { value: "all", label: str.filterAll },
                { value: "controls", label: str.filterControls },
                { value: "hazards", label: str.filterHazards },
              ])
            ),
          ])
        );
        body.appendChild(pair);
        // And underneath, laid out the same way: where distances are counted
        // from, and how many reports survive. Filtering too - both decide what
        // the card holds, not how it looks.
        const pair2 = document.createElement("div");
        pair2.className = "content-pair";
        // Only one of the three ways of measuring names an entity, so the
        // picker for it hangs off the choice rather than standing beside it.
        const refEntity = this._bareRow(
          this._picker("reference", {
            entity: { filter: [{ domain: "person" }, { domain: "device_tracker" }, { domain: "zone" }] },
          })
        );
        refEntity.dataset.withRefEntity = "";
        pair2.appendChild(
          this._contentBlock(str.edReference, str.edReferenceHelp, [
            this._bareRow(
              this._select("reference_mode", [
                { value: "area", label: str.refModeArea },
                { value: "map", label: str.refModeMap },
                { value: "entity", label: str.refModeEntity },
              ])
            ),
            refEntity,
          ])
        );
        // The number belongs to the switch above it: there is nothing to cap
        // the list at while the cap is off.
        const maxNumber = this._bareRow(this._numberInput("max", 1, 100));
        maxNumber.dataset.withMax = "";
        // Both of these trim a list, and the minimal format has none: its
        // two numbers count what the area has, and its pop-up shows exactly
        // what the number that opened it counted.
        const reports = this._contentBlock(str.edGroupContentReports, str.edGroupContentReportsHelp, [
          this._toggleRow("only_new", str.edOnlyNew, str.edOnlyNewHelp),
          this._toggleRow("show_max", str.edMax, str.edMaxHelp),
          maxNumber,
        ]);
        reports.dataset.withoutMinimal = "";
        pair2.appendChild(reports);
        body.appendChild(pair2);
      }

      // What a list entry is made of - the behaviour of the list, not its
      // looks, which live under Layout -> List.
      if (groupKey === "rows") {
        body.appendChild(this._offNote("list", str));
        // First, because it decides what the list is before anything else
        // here decides what one entry of it says.
        body.appendChild(
          this._fieldRow(str.edSort, str.edSortHelp,
            this._select("sort", [
              { value: "distance", label: str.sortDistance },
              { value: "newest", label: str.sortNewest },
              { value: "oldest", label: str.sortOldest },
            ]))
        );
        // What a click on an entry does comes next: it is the one thing here
        // that answers for the list as a whole rather than for a part of it.
        const centre = this._toggleRow("center_on_click", str.edCenterOnClick, str.edCenterOnClickHelp);
        // Nothing to aim without a map.
        centre.dataset.withMap = "";
        body.appendChild(centre);
        const follow = this._toggleRow("follow_map", str.edFollowMap, str.edFollowMapHelp);
        // There is nothing to follow without a map. In the minimal format
        // the map is the pop-up's, and the list beside it follows that one.
        follow.dataset.withViewport = "";
        body.appendChild(follow);
        body.appendChild(this._toggleRow("show_divider", str.edDivider, str.edDividerHelp));
        // Then how much of the list stands before it folds. Only the portrait
        // format: side by side the list already has a height of its own to
        // scroll in, and the minimal format has no list on the card at all.
        const fold = this._toggleRow("collapse_list", str.edCollapse, str.edCollapseHelp);
        fold.dataset.withPortrait = "";
        body.appendChild(fold);
        // The number belongs to the switch above it, the same way the cap on
        // the list does: nothing to count to while the fold is off.
        const foldAfter = this._fieldRow(
          str.edCollapseAfter, str.edCollapseAfterHelp, this._numberInput("collapse_after", 1, 100)
        );
        foldAfter.dataset.withPortrait = "";
        foldAfter.dataset.withFold = "";
        body.appendChild(foldAfter);

        // Laid out the way an entry is: the symbol on the left, and beside it
        // the three lines, then the chips and the stars along the bottom. One
        // sees where a switch will take effect instead of reading a list.
        const shape = document.createElement("div");
        shape.className = "row-shape";
        shape.innerHTML = `<div class="row-shape-pic"></div><div class="row-shape-body"></div>`;
        const pic = shape.querySelector(".row-shape-pic");
        const rowBody = shape.querySelector(".row-shape-body");
        pic.appendChild(this._toggleRow("show_row_picture", str.edRowPicture, str.edRowPictureHelp));

        rowBody.appendChild(this._toggleRow("show_row_line1", str.edRowLine1, str.edRowLine1Help));
        const inner = document.createElement("div");
        inner.className = "row-shape-sub";
        inner.appendChild(this._toggleRow("show_row_distance", str.edRowDistance, str.edRowDistanceHelp));
        inner.appendChild(this._toggleRow("show_row_speed", str.edRowSpeed, str.edRowSpeedHelp));
        rowBody.appendChild(inner);

        rowBody.appendChild(this._toggleRow("show_row_line2", str.edRowLine2, str.edRowLine2Help));
        rowBody.appendChild(this._toggleRow("show_row_extra", str.edRowExtra, str.edRowExtraHelp));

        const chips = document.createElement("div");
        chips.className = "row-shape-chips";
        // None of the three carries an "i": their names say what they are, and
        // three icons is what stops them sharing one line.
        chips.appendChild(this._toggleRow("show_row_reported", str.edRowReported, ""));
        chips.appendChild(this._toggleRow("show_row_confirmed", str.edRowConfirmed, ""));
        chips.appendChild(this._toggleRow("show_row_closure", str.edRowClosure, ""));
        chips.appendChild(this._toggleRow("show_row_stars", str.edRowStars, ""));
        rowBody.appendChild(chips);

        body.appendChild(shape);
      }

      if (groupKey === "display" || groupKey === "list") {
        if (groupKey === "list") body.appendChild(this._offNote("list", str));
        // First of all, because it is the only thing here that answers for
        // the whole card rather than for one piece of it.
        if (groupKey === "display") body.appendChild(this._backgroundBlock(str));

        // The card's own head lives under Layout -> General, everything a
        // list entry is made of under Layout -> List.
        const wanted = groupKey === "list" ? "list" : undefined;
        for (const [prefix, el] of Object.entries(DESIGN_ELEMENTS)) {
          if (el.tab !== wanted) continue;
          body.appendChild(this._designElement(prefix, el, str));
        }
      }

      if (groupKey === "map") {
        body.appendChild(this._offNote("map", str));
        body.appendChild(
          (() => {
            const row = this._fieldRow(str.edAspect, str.edAspectHelp,
              this._select("map_aspect_ratio", [
                { value: "21:9", label: str.aspectPanorama },
                { value: "16:9", label: str.aspectWide },
                { value: "3:2", label: str.aspect32 },
                { value: "4:3", label: str.aspect43 },
                { value: "1:1", label: str.aspectSquare },
                { value: "3:4", label: str.aspectTall },
              ]));
            // Only the portrait format draws the map to a ratio. Side by side
            // it fills its half instead, and the minimal format has no map at
            // all - so there is nothing here to answer for.
            row.dataset.withRatio = "";
            return row;
          })()
        );
        body.appendChild(
          this._toggleRow("map_marker_border", str.edMarkerBorder, str.edMarkerBorderHelp)
        );
        body.appendChild(
          this._toggleRow("map_marker_background", str.edMarkerBackground, str.edMarkerBackgroundHelp)
        );
        body.appendChild(this._toggleRow("map_fade", str.edMapFade, str.edMapFadeHelp));
        body.appendChild(this._routeBlock(str));
        body.appendChild(this._trafficBlock(str));
        // Whether nearby reports are gathered into discs at all, and then
        // the discs' looks, which answer to this switch.
        const clusterRow = this._toggleRow("map_cluster", str.edMapCluster, str.edMapClusterHelp);
        clusterRow.dataset.withMap = "";
        clusterRow.dataset.needsCluster = "";
        body.appendChild(clusterRow);
        body.appendChild(this._clusterBlock(str));
        // What a click on the map does to the list is set here too, since it
        // is the map that decides which entry is meant.
        for (const [prefix, el] of Object.entries(DESIGN_ELEMENTS)) {
          if (el.tab !== "map") continue;
          body.appendChild(this._designElement(prefix, el, str));
        }
      }

      return body;
    }

    _render() {
      if (!this._hass || !this._config) return;
      const str = t(this._hass);

      if (!this.shadowRoot) this.attachShadow({ mode: "open" });

      if (!this.shadowRoot.querySelector(".super-panel")) {
        this.shadowRoot.innerHTML = `<style>${EDITOR_STYLE}</style>`;
        for (const superGroup of SUPER_GROUPS) {
          const panel = document.createElement("div");
          panel.className = "super-panel";
          panel.dataset.super = superGroup.key;
          panel.innerHTML = `
            <div class="super-header">
              <div class="super-icon"><ha-icon icon="${superGroup.icon}"></ha-icon></div>
              <div class="super-text">
                <span class="super-title"></span>
                <span class="super-subtitle"></span>
              </div>
              <ha-icon class="super-chevron" icon="mdi:chevron-down"></ha-icon>
            </div>
            <div class="super-body">
              <div class="tabs"></div>
              <div class="super-content"></div>
            </div>`;
          panel.querySelector(".super-title").textContent =
            superGroup.key === "settings" ? str.edPanelSettings : str.edPanelLayout;
          panel.querySelector(".super-subtitle").textContent =
            superGroup.key === "settings" ? str.edPanelSettingsDesc : str.edPanelLayoutDesc;
          panel
            .querySelector(".super-header")
            .addEventListener("click", () => this._toggleSuper(superGroup.key));

          const tabsEl = panel.querySelector(".tabs");
          const contentEl = panel.querySelector(".super-content");
          for (const groupKey of superGroup.groups) {
            const group = GROUPS.find((g) => g.key === groupKey);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tab";
            btn.dataset.key = groupKey;
            btn.innerHTML = `<ha-icon icon="${group.icon}"></ha-icon><span></span>`;
            btn.querySelector("span").textContent = this._groupText(groupKey, str);
            btn.addEventListener("click", () => this._selectTab(superGroup.key, groupKey));
            tabsEl.appendChild(btn);
            contentEl.appendChild(this._buildGroup(groupKey, str));
          }
          this.shadowRoot.appendChild(panel);
          this._selectTab(superGroup.key, superGroup.groups[0]);
        }
      }

      this._prepareTooltips();
      this._syncValues();
    }

    // Every "i" carries its text in a real element, floating above the icon on
    // hover - the Annuals editor's tooltip, which is the reference for this.
    //
    // Annuals gets it right with CSS alone: left-aligned above the icon by
    // default, and right-aligned (opening leftward) for the anchors its layout
    // puts near the right edge - `.toggle-group`, and the right-hand column of
    // a split row. The same two rules are below.
    //
    // An element rather than Annuals' ::after, for one reason only: a
    // pseudo-element's box cannot be measured, so the rule above can be
    // written but never checked. This one can, and _placeTooltip below is the
    // safety net that catches an anchor the CSS rules do not know about.
    _prepareTooltips() {
      for (const anchor of this.shadowRoot.querySelectorAll(".tooltip-anchor")) {
        let tip = anchor.querySelector(".tip");
        if (!tip) {
          tip = document.createElement("span");
          tip.className = "tip";
          anchor.appendChild(tip);
          anchor.addEventListener("pointerenter", () => this._placeTooltip(anchor));
        }
        tip.textContent = anchor.dataset.tooltip || "";
      }
    }

    // Keeps the tooltip inside the editor's own column.
    //
    // The column, not the dialog: the dialog is twice as wide because the card
    // preview sits beside the form, so a tooltip can be well inside the dialog
    // and still lie across the preview. That is what a check against the
    // dialog missed.
    //
    // And inside everything that clips it top to bottom (see _clipRect): below
    // the icon when there is no room above it, which is where a long tooltip
    // on a row near the top of the dialog's form column used to lose its
    // first lines.
    //
    // Overlapping the rows behind it is not a fault - it is what a floating
    // tooltip does, in Annuals as here. Being cut off is.
    _placeTooltip(anchor) {
      const tip = anchor.querySelector(".tip");
      if (!tip) return;
      tip.style.cssText = "";
      tip.classList.remove("tip-right", "tip-down");
      const pane = this.getBoundingClientRect();
      const box = this._clipRect(anchor);
      let rect = tip.getBoundingClientRect();
      const left = Math.max(pane.left, box.left) + 4;
      const right = Math.min(pane.right, box.right) - 4;

      // Right-aligned to the icon when opening rightward would run past the
      // column - the same flip Annuals makes in CSS, decided by measurement so
      // that a row it has no rule for is covered too.
      if (rect.right > right) {
        tip.classList.add("tip-right");
        rect = tip.getBoundingClientRect();
      }
      // Still outside the column on either side - a wide tooltip on a narrow
      // column, or an "i" that itself sits at or past the column's edge, the
      // way a long switch label pushes it at 290px - so move it in by hand, as
      // far as the column's width allows.
      const maxLeft = right - rect.width;
      if (rect.left < left || rect.left > maxLeft) {
        const target = Math.max(left, Math.min(rect.left, maxLeft));
        tip.style.left = `${target - anchor.getBoundingClientRect().left}px`;
        tip.style.right = "auto";
        rect = tip.getBoundingClientRect();
      }
      // Below the icon when there is no room above it. A tooltip too tall for
      // either side takes the side that cuts less - a short window, or, on a
      // narrow screen, a panel's last rows scrolled up to the top of the
      // dialog, with that panel's own bottom edge just below them.
      if (rect.top < box.top + 4) {
        tip.classList.add("tip-down");
        const below = tip.getBoundingClientRect();
        const cutAbove = box.top + 4 - rect.top;
        const cutBelow = below.bottom - (box.bottom - 4);
        if (cutBelow > 0 && cutBelow > cutAbove) tip.classList.remove("tip-down");
      }
    }

    // The area a tooltip can be seen in: the window, narrowed by every
    // ancestor that clips its content - whether or not it scrolls right now.
    // The dialog's form column clips a tooltip above its top edge just the
    // same when the open tab is short enough to fit, and taking only a
    // container that overflowed (_scrollAncestorRect, which the colour menus
    // still use) let a tooltip be measured against the window and cut off
    // anyway.
    //
    // Walked from the anchor, not from this editor: the panel the "i" sits in
    // has overflow hidden for its rounded corners, and it lies inside this
    // shadow root, where a walk that starts at the host never looks. And
    // through the slot an element is shown in, not to its light-DOM parent:
    // the form column is slotted into ha-dialog, whose own scrolling body -
    // the one that scrolls when the preview is stacked below the form on a
    // narrow screen - only exists in ha-dialog's shadow root.
    _clipRect(anchor) {
      const nextUp = (node) =>
        node.assignedSlot ||
        node.parentElement ||
        (node.getRootNode() && node.getRootNode().host) ||
        null;
      const box = { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
      for (let node = nextUp(anchor); node && node !== document.documentElement; node = nextUp(node)) {
        const style = getComputedStyle(node);
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const r = node.getBoundingClientRect();
        box.top = Math.max(box.top, r.top);
        box.bottom = Math.min(box.bottom, r.bottom);
        box.left = Math.max(box.left, r.left);
        box.right = Math.min(box.right, r.right);
      }
      return box;
    }

    // Walks out of this editor's own shadow root to find the dialog container
    // that actually clips a dropdown - its bottom edge, not the window's.
    _scrollAncestorRect() {
      const nextUp = (node) =>
        node.parentElement || (node.getRootNode() && node.getRootNode().host) || null;
      let node = nextUp(this);
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
          return node.getBoundingClientRect();
        }
        node = nextUp(node);
      }
      return { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
    }

    // Resolves a theme variable or colour name to the hex the native colour
    // square needs. Probed against the document, not this shadow root: the
    // sync can run before the editor is in the DOM, and getComputedStyle on a
    // detached node resolves nothing - the swatch would fall back to white.
    _resolveToHex(value) {
      if (!value) return null;
      if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
      const probe = document.createElement("span");
      probe.style.display = "none";
      probe.style.color = value;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      const parts = rgb.match(/[\d.]+/g);
      if (!parts || parts.length < 3) return null;
      const hex = (n) =>
        Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, "0");
      return `#${hex(parts[0])}${hex(parts[1])}${hex(parts[2])}`;
    }

    _syncColorRow(key, value, fallback, str) {
      const textInput = this.shadowRoot.querySelector(`input[data-color-text="${key}"]`);
      const colorInput = this.shadowRoot.querySelector(`input[data-color="${key}"]`);
      if (!colorInput) return;
      if (!this._hasFocus(textInput)) textInput.value = value;
      colorInput.value = this._resolveToHex(value || fallback) || "#ffffff";

      const select = this.shadowRoot.querySelector(`.preset-select[data-preset-for="${key}"]`);
      const preset = PRESET_COLORS.find((p) => p.value === value);
      const swatch = select.querySelector(".preset-btn .preset-swatch");
      swatch.style.background = value || "transparent";
      swatch.style.boxShadow = value
        ? "inset 0 0 0 1px rgba(0, 0, 0, 0.15)"
        : "inset 0 0 0 2px var(--divider-color, #ccc)";
      select.querySelector(".preset-name").textContent = preset
        ? str[preset.labelKey]
        : str.presetCustom;
    }

    // Whether the card this editor is editing draws a map at all. One switch
    // for both places it can be drawn: under the head, or in the minimal
    // format's pop-up.
    _wantsMapHere() {
      return this._config.show_map !== false;
    }

    // Values are pushed into the already-built controls rather than the form
    // being rebuilt: rebuilding would close whichever panel is open and drop
    // the focus out of the field being typed into.
    _syncValues() {
      if (!this.shadowRoot || !this._config) return;
      const str = t(this._hass);
      this.shadowRoot.querySelectorAll("ha-selector").forEach((el) => {
        el.hass = this._hass;
        const value = this._config[el.dataset.key];
        if (value !== el.value) el.value = value;
      });
      this.shadowRoot.querySelectorAll("input[data-field], select[data-field]").forEach((el) => {
        const value = this._config[el.dataset.field];
        const next = value === undefined || value === null ? "" : String(value);
        // A value the dropdown has no entry for - one written by hand in the
        // YAML - is given one, rather than the field falling blank and the
        // next change quietly overwriting what somebody chose.
        if (el.tagName === "SELECT" && next && ![...el.options].some((o) => o.value === next)) {
          const extra = document.createElement("option");
          extra.value = next;
          extra.textContent = next;
          el.appendChild(extra);
        }
        if (el.value !== next && !this._hasFocus(el)) el.value = next;
      });
      this.shadowRoot.querySelectorAll("input[data-toggle]").forEach((el) => {
        const on = this._config[el.dataset.toggle] === true;
        el.checked = el.dataset.invert ? !on : on;
      });
      // With the list or the map switched off, the tabs that set them up keep
      // only the note saying so - the tabs themselves stay, or the setting
      // would be unfindable. Two tabs belong to the list, one to the map.
      //
      // This sweep goes first because it touches every row of those tabs at
      // once; the rules for single rows below then have the last word. The
      // other way round, this one silently unhid a row they had just hidden -
      // which is what left "List follows the map" showing with no map.
      // In the minimal format these tabs answer for the pop-up rather than
      // for the card - and by the same two switches, which is why there is
      // nothing to tell apart here any more.
      const minimal = this._config.layout === "minimal";
      const tabOff = {
        rows: this._config.show_list === false,
        list: this._config.show_list === false,
        map: this._config.show_map === false,
      };
      this.shadowRoot.querySelectorAll(".off-note").forEach((note) => {
        note.hidden = !tabOff[note.dataset.off];
      });
      for (const key of Object.keys(tabOff)) {
        const body = this.shadowRoot.querySelector(`.group-body[data-group="${key}"]`);
        if (!body) continue;
        for (const child of body.children) {
          if (child.classList.contains("off-note")) continue;
          child.hidden = tabOff[key];
        }
      }
      // Each of these assigns rather than ORs, so a row comes back when its
      // own reason for hiding goes away - but a row inside a tab that is off
      // as a whole stays hidden.
      const inOffTab = (el) => {
        const body = el.closest(".group-body");
        return !!body && tabOff[body.dataset.group] === true;
      };
      // Nothing to pick from a line that is not drawn - and the minimal
      // format draws none.
      this.shadowRoot.querySelectorAll("[data-with-sub]").forEach((row) => {
        row.hidden = minimal || this._config.show_sub === false || inOffTab(row);
      });
      // Nothing to aim without a map.
      this.shadowRoot.querySelectorAll("[data-with-map]").forEach((row) => {
        row.hidden = !this._wantsMapHere() || inOffTab(row);
      });
      // Following needs a map whose viewport the list is tied to: the
      // card's, or in the minimal format the pop-up's.
      this.shadowRoot.querySelectorAll("[data-with-viewport]").forEach((row) => {
        row.hidden = !this._wantsMapHere() || inOffTab(row);
      });
      // The settings only the minimal format has, and the ones it has no
      // use for.
      this.shadowRoot.querySelectorAll("[data-with-minimal]").forEach((row) => {
        row.hidden = !minimal;
      });
      this.shadowRoot.querySelectorAll("[data-without-minimal]").forEach((row) => {
        row.hidden = minimal;
      });
      // Only one of the three ways of measuring names an entity.
      this.shadowRoot.querySelectorAll("[data-with-ref-entity]").forEach((row) => {
        row.hidden = this._config.reference_mode !== "entity" || inOffTab(row);
      });
      // The card background: its own colour swatch, its preview, and the
      // four rows that only mean something once it is switched on.
      this._syncColorRow(
        "card_background_color",
        this._config.card_background_color || "",
        "var(--ha-card-background, var(--card-background-color))",
        str
      );
      const bgPreview = this.shadowRoot.querySelector("[data-bg-preview]");
      if (bgPreview) {
        const src = this._config.card_background_image || "";
        bgPreview.hidden = !src;
        if (src) bgPreview.querySelector("img").src = src;
      }
      this.shadowRoot.querySelectorAll("[data-with-card-bg]").forEach((row) => {
        row.hidden = this._config.card_background !== true;
      });
      // Two settings the portrait format alone has a use for.
      this.shadowRoot.querySelectorAll("[data-with-portrait]").forEach((row) => {
        row.hidden = (this._config.layout || "portrait") !== "portrait" || inOffTab(row);
      });
      // And no number to type while nothing is folded away.
      this.shadowRoot.querySelectorAll("[data-with-fold]").forEach((row) => {
        row.hidden =
          this._config.collapse_list !== true ||
          (this._config.layout || "portrait") !== "portrait" ||
          inOffTab(row);
      });
      // A ratio is only ever drawn in the portrait format.
      this.shadowRoot.querySelectorAll("[data-with-ratio]").forEach((row) => {
        row.hidden = (this._config.layout || "portrait") !== "portrait" || inOffTab(row);
      });
      // The route's looks answer to the switch that draws it.
      this.shadowRoot.querySelectorAll("[data-with-route]").forEach((row) => {
        row.hidden = this._config.map_route === false || !this._wantsMapHere() || inOffTab(row);
      });
      // The traffic flow's lines answer to its own switch.
      this.shadowRoot.querySelectorAll("[data-with-traffic]").forEach((row) => {
        row.hidden = this._config.map_traffic !== true || !this._wantsMapHere() || inOffTab(row);
      });
      // And the discs' looks to the switch that draws them.
      this.shadowRoot.querySelectorAll("[data-with-cluster]").forEach((row) => {
        row.hidden = this._config.map_cluster === false || !this._wantsMapHere() || inOffTab(row);
      });
      // The switch itself needs a map that knows the option - Home Assistant
      // 2026.10 or newer. On an older one it stays where it is, greyed out,
      // with its tooltip saying why: a switch that simply vanished would
      // send anyone who read about it looking for it.
      const switchable = mapClusterSwitchable(this._hass);
      this.shadowRoot.querySelectorAll("[data-needs-cluster]").forEach((row) => {
        row.classList.toggle("disabled", !switchable);
        const control = row.querySelector("input[data-toggle], select[data-field]");
        if (control) control.disabled = !switchable;
      });
      this._syncColorRow("route_color", this._config.route_color || "", "var(--primary-color)", str);
      // What the colour falls back to is what the map draws without one: the
      // primary colour on the disc through 2026.9, the card background on the
      // bubble from 2026.10.
      this._syncColorRow(
        "cluster_color",
        this._config.cluster_color || "",
        haAtLeast(this._hass, 2026, 10) && this._config.cluster_style !== "disc"
          ? "var(--card-background-color)"
          : "var(--primary-color)",
        str
      );
      this._syncColorRow(
        "cluster_text_color", this._config.cluster_text_color || "", "var(--text-primary-color)", str
      );
      // No number to type while the list is not capped at all.
      this.shadowRoot.querySelectorAll("[data-with-max]").forEach((row) => {
        row.hidden = this._config.show_max !== true || inOffTab(row);
      });
      for (const [prefix, el] of Object.entries(DESIGN_ELEMENTS)) {
        if (!el.noColor) {
          this._syncColorRow(`${prefix}_color`, this._config[`${prefix}_color`] || "", el.fallback, str);
        }
        if (el.extra) {
          this._syncColorRow(el.extra.key, this._config[el.extra.key] || "", el.extra.fallback, str);
        }
        if (el.icon && el.icon.color) {
          this._syncColorRow(
            el.icon.color.key,
            this._config[el.icon.color.key] || "",
            el.icon.color.fallback,
            str
          );
        }
        // A background colour only means anything while there is a
        // background. The row is hidden rather than removed, so its wiring
        // survives being switched off and on again.
        if (el.bgToggle && el.extra) {
          const input = this.shadowRoot.querySelector(`input[data-color="${el.extra.key}"]`);
          const row = input && input.closest(".field-row");
          if (row) row.style.display = this._config[el.bgToggle.key] === false ? "none" : "";
        }
        // A block whose element the card does not draw at all has nothing to
        // offer, so it goes rather than sitting there doing nothing - and the
        // whole of Layout -> List goes with the list itself.
        const block = this.shadowRoot.querySelector(`[data-design="${prefix}"]`);
        if (block) {
          block.hidden =
            (el.hidden ? el.hidden(this._config) : false) || tabOff[el.tab] === true;
        }
      }
    }
  }

  const EDITOR_STYLE = `
    /* Every row in this editor is given an explicit display - flex, grid -
       and any of those beats the browser's own [hidden] { display: none } on
       specificity. So the .hidden property, which the sync uses to put a
       setting away, silently did nothing. This one line makes it mean what it
       says, for every rule here and every one added later. */
    [hidden] { display: none !important; }
    .super-panel {
      border: 2px solid rgba(128, 128, 128, 0.4);
      border-radius: 12px;
      margin-bottom: 16px;
      background-color: var(--card-background-color, #1c1c1c);
      overflow: hidden;
    }
    .super-header {
      display: grid;
      grid-template-columns: 36px 1fr 16px;
      align-items: center;
      gap: 0 10px;
      padding: 14px 16px;
      background-color: rgba(255, 255, 255, 0.05);
      cursor: pointer;
    }
    .super-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background-color: rgba(74, 144, 217, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary-color);
      flex-shrink: 0;
    }
    .super-icon ha-icon { --mdc-icon-size: 18px; }
    .super-text { display: flex; flex-direction: column; min-width: 0; }
    .super-title {
      font-size: 15px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--primary-text-color, #e1e1e1);
    }
    .super-subtitle {
      font-size: 11px;
      color: var(--secondary-text-color, #9b9b9b);
    }
    .super-chevron {
      --mdc-icon-size: 16px;
      color: var(--secondary-text-color);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      justify-self: end;
    }
    .super-panel.open .super-chevron { transform: rotate(180deg); }
    .super-body { display: none; padding: 0 16px 16px; }
    .super-panel.open .super-body { display: block; }
    .tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2px;
      padding: 4px;
      margin: 6px 0 16px;
      background: rgba(127, 127, 127, 0.1);
      border-radius: 10px;
    }
    .tab {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px 10px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--secondary-text-color);
      font: inherit;
      font-weight: 400;
      font-size: 11.5px;
      letter-spacing: 0.46px;
      text-transform: uppercase;
      cursor: pointer;
      transition: 0.2s;
    }
    .tab ha-icon { --mdc-icon-size: 13px; flex-shrink: 0; }
    .tab.active {
      background: var(--card-background-color, #1c1c1c);
      color: var(--primary-color);
      font-weight: 600;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    }
    .field-row { margin-bottom: 16px; }
    .field-label {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin-bottom: 6px;
      font-size: 0.9em;
      font-weight: 500;
    }
    .field-input-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      row-gap: 8px;
      gap: 8px;
    }
    .field-input-row input[type="text"],
    .field-input-row input[type="number"],
    .field-input-row select {
      flex: 1;
      min-width: 0;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid var(--divider-color, #e0e0e0);
      background: var(--card-background-color, transparent);
      color: inherit;
      font: inherit;
    }
    .field-input-row select { cursor: pointer; }
    .field-input-row ha-selector { flex: 1; min-width: 0; }
    /* Home Assistant's own pickers draw themselves as a filled box with an
       underline, which sits oddly beside this editor's plain bordered fields.
       They read three inheritable variables for it, so handing them our own
       values is enough to make them match - no reaching into their shadow
       roots. Their inner row keeps Home Assistant's fixed 56px height. */
    .field-input-row ha-selector {
      --ha-color-form-background: transparent;
      --ha-color-border-neutral-loud: transparent;
      --ha-border-radius-sm: 4px;
      display: block;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      background: var(--card-background-color, transparent);
    }
    /* The two halves of the Content tab, equally wide and each read top to
       bottom. They fall under one another once the pane is too narrow for
       two dropdowns side by side. */
    .content-pair {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0 16px;
      margin-bottom: 8px;
    }
    .content-block { min-width: 0; }
    .content-block .group-label-row { margin-bottom: 8px; }
    .content-block .toggle-row { margin-bottom: 10px; }
    /* Stands in for a tab's settings while the list is off. */
    .off-note {
      margin: 4px 0 8px;
      padding: 10px 12px;
      border-radius: 6px;
      border-left: 3px solid var(--primary-color);
      background: rgba(127, 127, 127, 0.12);
      color: var(--secondary-text-color);
      font-size: 0.9em;
      line-height: 1.4;
    }
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      margin-bottom: 16px;
    }
    .toggle {
      position: relative;
      display: inline-block;
      width: 30px;
      height: 16px;
      flex-shrink: 0;
      cursor: pointer;
    }
    .toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
    .toggle .track {
      position: absolute;
      inset: 0;
      background: var(--disabled-text-color, #ccc);
      border-radius: 20px;
      transition: 0.2s;
    }
    .toggle .track::before {
      content: "";
      position: absolute;
      width: 12px;
      height: 12px;
      left: 2px;
      top: 2px;
      background: #fff;
      border-radius: 50%;
      transition: 0.2s;
    }
    .toggle input:checked + .track { background: var(--primary-color); }
    .toggle input:checked + .track::before { transform: translateX(14px); }
    /* A switch this Home Assistant cannot act on: still there, still
       explained by its "i", but plainly not for turning. */
    .toggle-row.disabled .toggle { cursor: default; }
    .toggle-row.disabled .toggle .track,
    .toggle-row.disabled .toggle-label { opacity: 0.45; }
    .toggle-label {
      font-size: 0.85em;
      color: var(--secondary-text-color);
    }
    /* Anchored on a plain span rather than the ha-icon itself: Annuals found
       Chromium paints a tooltip generated on a shadow-hosting element in a way
       that does not reliably stack above the rows behind it. */
    .tooltip-anchor { position: relative; display: flex; cursor: help; }
    .tooltip-anchor ha-icon { --mdc-icon-size: 16px; opacity: 0.6; }
    .tip {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      z-index: 20;
      width: max-content;
      max-width: 220px;
      padding: 6px 10px;
      border-radius: 6px;
      background-color: #383838;
      opacity: 1;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      font-size: 12px;
      font-weight: 400;
      text-transform: none;
      letter-spacing: normal;
      white-space: normal;
      text-align: left;
      visibility: hidden;
      pointer-events: none;
    }
    .tooltip-anchor:hover .tip { visibility: visible; }
    /* Annuals' own two rules, for the places its layout - and ours - puts an
       "i" close to the right edge: open right-aligned, expanding leftward,
       instead of the usual left-aligned opening. */
    .toggle-group .tip { left: auto; right: 0; }
    .row-shape-body .tip { left: auto; right: 0; }
    .tip.tip-right { left: auto; right: 0; }
    .tip.tip-down { bottom: auto; top: calc(100% + 6px); }
    /* Marks a row as a dependent sub-option of the block above it -
       indented, smaller, with a left border, so it reads as belonging to
       that block rather than as a peer field. */
    .sub-field-row {
      margin: -8px 0 16px 20px;
      padding-left: 12px;
      border-left: 2px solid var(--divider-color, #e0e0e0);
    }
    /* A sub-row inside a sub-row: the letter-spacing line under an already
       indented font row. */
    .sub-field-row-nested { margin-left: 32px; }
    .sub-field-row .field-label { font-size: 0.8em; }
    .sub-field-row .field-label ha-icon,
    .sub-field-row .tooltip-anchor ha-icon { --mdc-icon-size: 14px; }
    .sub-field-row .field-input-row input[type="text"] {
      padding: 6px 8px;
      font-size: 0.85em;
    }
    .sub-field-row .field-input-row input[type="color"] { width: 28px; height: 28px; }
    /* Home Assistant's own icon picker is the one control here that is not a
       plain input, and it draws itself at full height - shrunk to match the
       smaller rows it sits among. */
    .sub-field-row .field-input-row ha-selector { --mdc-typography-subtitle1-font-size: 0.85em; }
    .sub-field-row .preset-btn { padding: 4px 6px; font-size: 0.8em; max-width: 110px; }
    .sub-field-row .preset-btn .preset-swatch { width: 14px; height: 14px; }
    /* Names the indented block that follows it and has no control of its
       own, so the gap a field row leaves for one would just be a hole. The
       first row under it has to give back .sub-field-row's -8px pull, which
       exists to tuck a sub-row under its parent field and here would tuck
       the heading away. */
    .group-label-row {
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    .group-label-row + .sub-field-row { margin-top: 0; }
    .group-label-row { cursor: pointer; }
    .group-label-row.plain-label-row { cursor: default; }
    .group-label-row:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    .design-chevron {
      --mdc-icon-size: 16px;
      margin-left: auto;
      color: var(--secondary-text-color);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .design-element.open .design-chevron { transform: rotate(180deg); }
    /* Folded away, heading and all its rows - the heading stays, so the tab
       reads as a list of what can be styled rather than a wall of fields.
       A row the sync has hidden for its own reason keeps its inline
       display:none and stays hidden when the block is opened. */
    .design-element:not(.open) .sub-field-row { display: none; }
    /* A switch used as a sub-row keeps the indent and the rule of the field
       rows around it, but not their bottom gap - they stack as one list. */
    .sub-toggle-row { display: flex; }
    .design-element:not(.open) .sub-toggle-row { display: none; }
    /* The list settings, arranged the way a list entry is drawn: the symbol
       in its own column, everything else beside it, and the three labels that
       sit side by side under an entry side by side here too. */
    .row-shape {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px 12px;
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px dashed var(--divider-color, #444);
    }
    .row-shape .toggle-row { margin-bottom: 10px; }
    .row-shape-sub {
      margin: -4px 0 10px 20px;
      padding-left: 12px;
      border-left: 2px solid var(--divider-color, #e0e0e0);
    }
    .row-shape-sub .toggle-row { margin-bottom: 6px; }
    /* Three across, the way they sit under an entry. A grid rather than a
       wrapping row, so the third one keeps its place in the narrow editor
       pane instead of dropping to a line of its own. */
    /* Three across, the way they sit under an entry. A grid rather than a
       wrapping row: at the dialog's width the three of them do not fit on one
       line on their own, and a grid keeps the third in place instead of
       dropping it to a line of its own. */
    .row-shape-chips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 6px; }
    .row-shape-chips .toggle-row { gap: 6px; }
    .row-shape-chips .toggle-label { white-space: normal; }
    .row-shape-chips .toggle-row { margin-bottom: 0; }
    .design-element { margin-bottom: 20px; }
    .design-element:not(.open) { margin-bottom: 8px; }
    .design-element:not(.open) .group-label-row { margin-bottom: 0; }
    /* Each style switch labels itself in the style it turns on, so the row
       shows what the switches do without reading a word of it. */
    .toggle-label-bold { font-weight: 700; }
    .toggle-label-italic { font-style: italic; }
    .toggle-label-uppercase { text-transform: uppercase; }
    .toggle-label-underline { text-decoration: underline; }
    /* A switch that belongs to the row above it - "Show background" under a
       colour row - takes a line of its own at the row's right end rather
       than squeezing in beside the colour controls. */
    .field-input-row > .toggle-group { flex-basis: 100%; justify-content: flex-end; margin-top: 4px; }
    .field-input-row > .field-toggles {
      flex-basis: 100%;
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      row-gap: 8px;
      gap: 16px;
      white-space: nowrap;
    }
    .toggle-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    /* The image row: a square button beside the field, and under it the
       picture itself with a way to take it off again. Annuals' own. */
    .upload-btn { display: flex; align-items: center; justify-content: center;
                  width: 36px; height: 36px; flex-shrink: 0; border-radius: 6px;
                  border: 1px solid var(--divider-color, #e0e0e0);
                  background: var(--card-background-color, transparent);
                  color: inherit; cursor: pointer; }
    .upload-btn:hover { background: var(--secondary-background-color, rgba(0, 0, 0, 0.05)); }
    .upload-btn ha-icon { --mdc-icon-size: 18px; }
    .bg-image-preview { position: relative; display: inline-block; margin-top: 8px;
                        width: fit-content; }
    .bg-image-preview img { display: block; max-width: 100%; max-height: 120px;
                            border-radius: 6px; border: 1px solid var(--divider-color, #e0e0e0); }
    .bg-image-clear { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px;
                      border-radius: 50%; border: none; background: rgba(0, 0, 0, 0.6);
                      color: #fff; display: flex; align-items: center;
                      justify-content: center; cursor: pointer; }
    .bg-image-clear ha-icon { --mdc-icon-size: 14px; }
    /* A number whose unit belongs inside the field rather than in its label. */
    .unit-input-wrap { position: relative; flex: 1; min-width: 0; display: flex; }
    .unit-input-wrap input[type="number"] { width: 100%; padding-right: 32px; }
    .unit-suffix { position: absolute; top: 50%; right: 10px; transform: translateY(-50%);
                   color: var(--secondary-text-color); font-size: 0.9em;
                   pointer-events: none; }
    /* On a label line, pushed to the far end of it. The label itself is a
       wrapping flex row, so on a column too narrow to hold both the switch
       drops to its own line rather than squeezing the heading. */
    .field-label > .inline-toggle { margin-left: auto; font-weight: 400; }
    .field-input-row input[type="color"] {
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: none;
      cursor: pointer;
      flex-shrink: 0;
    }
    /* border:none only removes the frame around the control; the coloured
       area inside is a separate shadow part the browser draws with its own
       grey frame and padding. At 28px that frame mutes the colour enough
       that the swatch no longer reads as what the card renders. */
    .field-input-row input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
    .field-input-row input[type="color"]::-webkit-color-swatch {
      /* A hairline of our own in its place: a swatch showing the card's
         background - the grouped reports' default from 2026.10 - would
         otherwise vanish into the dialog it sits in. */
      border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.4));
      border-radius: 6px;
    }
    .preset-select { position: relative; flex-shrink: 0; }
    .preset-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      background: var(--card-background-color, transparent);
      color: inherit;
      font: inherit;
      font-size: 0.85em;
      cursor: pointer;
      max-width: 130px;
    }
    .preset-btn .preset-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      text-align: left;
    }
    .preset-btn ha-icon { --mdc-icon-size: 16px; opacity: 0.6; flex-shrink: 0; }
    .preset-swatch {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      flex-shrink: 0;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
    }
    .preset-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: 10;
      /* The height set on opening is the room measured between the button
         and the edge of whatever is scrolling. Without this the padding and
         the border are added on top of it and the menu ends up ten pixels
         taller than the room it was given - enough to have its last entry
         cut off by that edge in a short dialog. */
      box-sizing: border-box;
      max-height: 260px;
      overflow-y: auto;
      background: var(--card-background-color, #1c1c1c);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      min-width: 170px;
      padding: 4px;
    }
    /* Applied when there is no room below the button - rows near the bottom
       of the scrollable dialog open upward instead of being clipped by it. */
    .preset-menu.menu-up {
      top: auto;
      bottom: calc(100% + 4px);
    }
    .preset-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .preset-item:hover { background: var(--secondary-background-color, rgba(0, 0, 0, 0.06)); }
  `;

  // ------------------------------------------------------------------ view
  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
    );
  }

  function selectHtml(what, options, selected, style) {
    const opts = options
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}"${o.value === selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("");
    return `<select data-what="${what}" style="${escapeHtml(style || "")}">${opts}</select>`;
  }

  // The rule between two entries, as CSS variables the list's own rule reads.
  // Written on the list rather than on every row, so one declaration serves
  // however many rows there happen to be.
  function dividerStyle(config) {
    const parts = [];
    if (config.divider_color) parts.push(`--blitzer-divider-color: ${config.divider_color}`);
    if (config.divider_width) parts.push(`--blitzer-divider-width: ${config.divider_width}`);
    if (config.divider_style) parts.push(`--blitzer-divider-style: ${config.divider_style}`);
    return parts.join("; ");
  }

  // One report. The summary is split the way the Markdown card splits it:
  // everything after the em dash is Blitzer.de's own free text and gets a
  // line of its own, and the last "·" segment is the address.
  // `newPrefix` is which element the NEW tag takes its look from: the card's
  // own list uses the head's NEW marker, so that a card marks one thing one
  // way; the minimal format's pop-up has no head to match and answers to an
  // element of its own.
  function rowHtml(row, str, isNew, config, highlighted, newPrefix = "new") {
    const a = row.state.attributes;
    const summary = a.summary || a.friendly_name || "";
    const head = summary.split(" — ")[0];
    const extra = summary.split(" — ").slice(1).join(" — ");
    const parts = head.split(" · ");
    const place = parts.length > 1 ? parts[parts.length - 1] : "";
    let whatParts = parts.length > 1 ? parts.slice(0, -1) : [head];
    // The speed a control enforces is the last "·" segment of the summary,
    // where there is one - "Ampel- & Geschwindigkeitsblitzer · 50 km/h". Only
    // that shape is dropped, so a summary without one loses nothing.
    if (config.show_row_speed === false && whatParts.length > 1 && /^\d+\s*km\/h$/.test(whatParts[whatParts.length - 1].trim())) {
      whatParts = whatParts.slice(0, -1);
    }
    const what = whatParts.join(" · ");
    const distance =
      config.show_row_distance !== false && Number.isFinite(row.distance)
        ? `${row.distance} ${row.unit}`
        : "";

    const chips = [
      config.show_row_reported === false ? "" : reportedText(str, a.created),
      config.show_row_confirmed === false ? "" : confirmedText(str, a.confirmed),
      ...(config.show_row_closure === false ? [] : closureChips(str, a)),
    ].filter(Boolean);
    const stars = config.show_row_stars === false ? "" : starsHtml(row, config);

    const line = (prefix, inner) =>
      `<div class="${prefix}" style="${escapeHtml(elementStyle(config, prefix))}">${leadIconHtml(
        config,
        prefix
      )}<span>${inner}</span></div>`;

    return `
      <div class="row${highlighted ? " hl" : ""}" data-entity="${escapeHtml(row.entityId)}"${highlighted && config.highlight_color ? ` style="background: ${escapeHtml(config.highlight_color)}"` : ""}>
        ${config.show_row_picture === false || !a.entity_picture
          ? ""
          : `<div class="pic"><img src="${escapeHtml(a.entity_picture)}" alt="" style="${escapeHtml(
              config.row_picture_size ? `width: ${config.row_picture_size}; height: ${config.row_picture_size}` : ""
            )}"></div>`}
        <div class="body">
          ${config.show_row_line1 === false
            ? ""
            : line(
                "line1",
                `<b>${escapeHtml(distance)}</b>${distance ? " · " : ""}${escapeHtml(what)}${
                  isNew
                    ? `<span class="new-tag" style="${escapeHtml(elementStyle(config, newPrefix))}">${escapeHtml(str.newLabel)}</span>`
                    : ""
                }`
              )}
          ${config.show_row_line2 === false || !place ? "" : line("line2", escapeHtml(place))}
          ${config.show_row_extra === false || !extra ? "" : line("extra", escapeHtml(extra))}
          ${chips.length || stars
            ? `<div class="chips">${chips
                .map(
                  (c) =>
                    `<span class="chip" style="${escapeHtml(elementStyle(config, "chip"))}">${escapeHtml(c)}</span>`
                )
                .join("")}${stars}</div>`
            : ""}
        </div>
      </div>`;
  }

  // Where each element of DESIGN_ELEMENTS is drawn. Naming one here is the
  // whole of what it takes for every setting that element has to be reachable
  // as a custom property as well - variableCss below reads the settings
  // themselves off DESIGN_ELEMENTS, so the two cannot drift apart.
  //
  // Three elements are missing on purpose: the rule between entries, the
  // highlight behind a picked one and the card background are custom
  // properties already, under the same names.
  const ELEMENT_CSS = {
    title: { name: "title", selector: ".title-text, .pop-title" },
    no_reports: { name: "no-reports", selector: ".empty" },
    mini: {
      name: "mini-total",
      selector: ".mini-half.total .mini-value, .mini-half.total .mini-label",
      icon: ".mini-half.total ha-icon",
    },
    mini_new: {
      name: "mini-new",
      selector: ".mini-half.new .mini-value, .mini-half.new .mini-label",
      icon: ".mini-half.new ha-icon",
    },
    mini_delay: {
      name: "mini-delay",
      selector: ".mini-half.delay .mini-value, .mini-half.delay .mini-label",
      icon: ".mini-half.delay ha-icon",
    },
    pop_new: { name: "pop-new", selector: ".pop-list .new-tag" },
    count: { name: "count", selector: ".badge:not(.new)" },
    // The head badge and the tag in the card's own list, which is what this
    // element has always been both of. The pop-up's tag is pop_new above.
    new: { name: "new", selector: ".badge.new, .listwrap .new-tag" },
    delay: { name: "delay", selector: ".badge.delay" },
    area_select: { name: "area-select", selector: 'select[data-what="area"]' },
    filter_select: { name: "filter-select", selector: 'select[data-what="filter"]' },
    sub: { name: "sub", selector: ".sub", icon: ".sub .fit-icon" },
    refresh: { name: "refresh", icon: ".refresh .fit-icon" },
    row_picture: { name: "row-picture", selector: ".pic img", size: ["width", "height"] },
    line1: { name: "row-line1", selector: ".line1" },
    line2: { name: "row-line2", selector: ".line2", icon: ".line2 .fit-icon" },
    extra: { name: "row-extra", selector: ".extra", icon: ".extra .fit-icon" },
    chip: { name: "row-chip", selector: ".chip" },
    stars: { name: "row-stars", selector: ".stars", size: ["font-size"] },
  };

  // Every look a text element can be given, as the CSS property it sets.
  const LOOK_PROPS = [
    "font-size",
    "font-weight",
    "font-style",
    "text-transform",
    "text-decoration",
    "letter-spacing",
  ];

  // One rule per element, giving each of its settings a custom property.
  // `revert-layer` is what makes this safe to add to a finished card: with
  // the property unset the declaration rolls back to the layer below, which
  // is the card's own stylesheet, so nothing changes look until somebody
  // sets one. A setting made in the editor is written as an inline style and
  // beats both - card setting, then variable, then the card's own default.
  //
  // Named --blitzer-<element>-<css-property> throughout: the element as the
  // editor names its block, the property as CSS spells it, never abbreviated.
  function variableCss() {
    const rules = [];
    for (const [key, el] of Object.entries(DESIGN_ELEMENTS)) {
      const where = ELEMENT_CSS[key];
      if (!where) continue;
      const v = (prop) => `var(--blitzer-${where.name}-${prop}, revert-layer)`;
      const decls = [];
      if (!el.noColor) decls.push(`color: ${v("color")}`);
      if (!el.noFont) for (const prop of LOOK_PROPS) decls.push(`${prop}: ${v(prop)}`);
      // Only a background that is drawn behind the words themselves. The
      // minimal line's two halves also carry a fill, but that one sits on a
      // layer of its own and has its own pair of properties.
      const bg = el.bgToggle || (el.extra && el.extra.key.endsWith("_background_color"));
      if (bg) decls.push(`background: ${v("background")}`);
      for (const prop of where.size || []) decls.push(`${prop}: ${v("size")}`);
      if (decls.length) rules.push(`${where.selector} { ${decls.join("; ")}; }`);
      if (el.icon && where.icon) {
        rules.push(
          `${where.icon} { color: ${v("icon-color")}; font-size: ${v("icon-size")};` +
            ` width: ${v("icon-size")}; height: ${v("icon-size")}; }`
        );
      }
    }
    return rules.join("\n    ");
  }

  const STYLE = `
    /* Every part of this card carries its own display, which beats the
       browser's own [hidden] rule - so a hidden part would keep its box and,
       being a flex item with height:100%, take the whole card with it. */
    [hidden] { display: none !important; }
    /* Home Assistant hands a resized card a fixed height, which the card
       fills. What gives way inside it is the list: it scrolls, rather than
       the card spilling out of its cell. Where no height is imposed - a
       masonry view, or the automatic row count - all of this resolves back
       to the height the contents want. */
    :host { display: block; height: 100%; }
    ha-card { padding: 12px 16px 8px; display: flex; flex-direction: column;
              height: 100%; box-sizing: border-box; overflow: hidden;
              container-type: inline-size; position: relative; }
    /* The card's own background on a layer of its own, behind everything
       the card draws and in front of the one the theme gives it. Its own
       layer because of the opacity: set on the card itself it would fade
       the text with it, and a half-faded list is not what "a background at
       70%" means. */
    ha-card::before {
      content: "";
      position: absolute;
      inset: 0;
      background-color: var(--blitzer-card-background-color, transparent);
      background-image: var(--blitzer-card-background-image, none);
      background-size: var(--blitzer-card-background-size, cover);
      background-repeat: var(--blitzer-card-background-repeat, no-repeat);
      background-position: center;
      opacity: var(--blitzer-card-background-opacity, 1);
      pointer-events: none;
      z-index: 0;
    }
    /* Everything the card draws sits above that layer. A positioned
       pseudo-element paints over plain in-flow children whatever their
       order, so each of the three has to say where it belongs. */
    .head, .split, .mini { position: relative; z-index: 1; }
    .split { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    /* The list is what gives way when the card is short: it takes whatever
       is left and scrolls. The map gives way too, but only down to a height
       that is still a map - squeezed to a few pixels it reads as a fault,
       and a card that small is one the layout editor will not hand out
       anyway (see getGridOptions). */
    .listwrap { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
    .mapwrap { flex: 0 1 auto; position: relative; }
    /* The soft edge itself is drawn inside the map rather than over it - see
       _styleMapChrome. From out here it would lie across the map's own
       buttons as well, which is what made them have to move out of its way. */
    .mapwrap:not(:empty) { min-height: 120px; }
    /* Side by side, in halves. The map fills its half rather than keeping a
       ratio, and the list scrolls in the other. */
    ha-card[data-layout="landscape"] .split { flex-direction: row; gap: 12px; margin-top: 12px; }
    ha-card[data-layout="landscape"] .mapwrap,
    ha-card[data-layout="landscape"] .listwrap { flex: 1 1 0; min-width: 0; }
    ha-card[data-layout="landscape"] .mapwrap:not(:empty) { margin-top: 0; }
    ha-card[data-layout="landscape"] .mapwrap > * { height: 100%; }
    ha-card[data-layout="landscape"] .mapwrap ha-card { height: 100%; }
    /* One line, and the line is the button. */
    ha-card[data-layout="minimal"] { padding: 0; }
    /* Two or three parts, each a button: how much there is, how much of it is
       new, and what the jams among it cost. The parts after the first carry a
       colour, so what interrupts a glance is what the eye lands on - and each
       is plainly a place to press rather than a run of text. */
    .mini { display: flex; width: 100%; height: 100%; min-height: 48px;
            border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; }
    .mini-half { flex: 1 1 0; min-width: 0; display: flex; align-items: center;
                 justify-content: center; gap: 8px; padding: 0 8px;
                 background: none; border: none; font: inherit; cursor: pointer;
                 color: var(--primary-text-color); position: relative; }
    /* A fill of the half's own, on its own layer so that its opacity leaves
       the number and the word alone. Transparent until a colour is set, so
       what the stylesheet draws below it stands until then. */
    .mini-half::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .mini-half.total::before {
      background: var(--blitzer-mini-total-fill-color, transparent);
      opacity: var(--blitzer-mini-total-fill-opacity, 1);
    }
    .mini-half.new::before {
      background: var(--blitzer-mini-new-fill-color, transparent);
      opacity: var(--blitzer-mini-new-fill-opacity, 1);
    }
    .mini-half.delay::before {
      background: var(--blitzer-mini-delay-fill-color, transparent);
      opacity: var(--blitzer-mini-delay-fill-opacity, 1);
    }
    /* Two parts are one half each. Three are not three thirds: what the
       jams cost is a good deal wider than a count, and an equal share of a
       narrow card cuts it off. Each part then takes what it needs first
       and shares out what is left, so the line divides by its contents. */
    .mini.three .mini-half { flex: 1 1 auto; }
    .mini-half > * { position: relative; z-index: 1; }
    .mini-half:hover { background: rgba(127, 127, 127, 0.1); }
    .mini-half:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
    .mini-half ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; flex: none;
                         display: flex; align-items: center; justify-content: center;
                         line-height: 0; color: var(--secondary-text-color); }
    .mini-value { font-size: 20px; font-weight: 500; line-height: 1.2; }
    .mini-label { font-size: 14px; color: var(--secondary-text-color);
                  white-space: nowrap; }
    /* The tint is mixed from whatever colour the new marker actually has, so a
       theme that owns its accent keeps it here too. The flat value first is
       what a browser without color-mix falls back to. */
    /* The accent this half wears is two settings now, not a rule here - see
       mini_new_fill_color and its opacity. What stays is the colour of
       what stands on it, which is a different thing from the fill. */
    .mini-half.new ha-icon,
    .mini-half.new .mini-value { color: var(--blitzer-new-background, var(--accent-color, #ff9800)); }
    .mini-half.new .mini-label { color: #c08324; }
    @supports (color: color-mix(in srgb, red 10%, transparent)) {
      .mini-half.new .mini-label {
        color: color-mix(in srgb,
               var(--blitzer-new-background, var(--accent-color, #ff9800)) 70%,
               var(--secondary-text-color));
      }
    }
    /* The third part wears the badge's red for the reason the second wears
       the accent: the colour is what it says, not decoration. The fill is
       two settings of its own (see mini_delay_fill_color); this is what
       stands on it. */
    .mini-half.delay ha-icon,
    .mini-half.delay .mini-value { color: var(--blitzer-delay-background, var(--error-color, #db4437)); }
    .mini-half.delay .mini-label { color: #b8564c; }
    @supports (color: color-mix(in srgb, red 10%, transparent)) {
      .mini-half.delay .mini-label {
        color: color-mix(in srgb,
               var(--blitzer-delay-background, var(--error-color, #db4437)) 70%,
               var(--secondary-text-color));
      }
    }
    /* "+1 h 35 min" is one thing to read, not three. */
    .mini-half.delay .mini-value { white-space: nowrap; }
    /* With nothing new there is nothing to interrupt a glance for, so the
       accent stands down until there is - the fill with it. */
    .mini-half.new.quiet::before,
    .mini-half.delay.quiet::before { background: none; }
    .mini-half.new.quiet ha-icon,
    .mini-half.new.quiet .mini-value,
    .mini-half.new.quiet .mini-label,
    .mini-half.delay.quiet ha-icon,
    .mini-half.delay.quiet .mini-value,
    .mini-half.delay.quiet .mini-label { color: var(--secondary-text-color); }
    /* A half counting nothing leads nowhere, so it stops offering: no hand,
       no lift under the pointer. The button itself is disabled, and this is
       what keeps it from still looking pressable. */
    .mini-half.empty { cursor: default; }
    .mini-half.empty:hover,
    .mini-half.new.quiet:hover,
    .mini-half.delay.quiet:hover { background: none; }
    /* Too narrow for words: the numbers and their symbols carry it alone.
       Three parts share the room two had, so their words go sooner. */
    @container (max-width: 250px) {
      .mini-label { display: none; }
    }
    @container (max-width: 440px) {
      .mini.three .mini-label { display: none; }
    }
    /* Narrower still, and three numbers are more than the line can set in
       full: the type steps down rather than letting "+1 h 35 min" be cut
       off at both ends. The symbols are the last to go - a number that is
       neither counted nor coloured says least without one. */
    @container (max-width: 270px) {
      .mini.three .mini-value { font-size: 17px; }
      .mini.three .mini-half { gap: 6px; padding: 0 6px; }
      .mini.three .mini-half ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
    }
    @container (max-width: 230px) {
      .mini.three .mini-half ha-icon { display: none; }
    }
    /* The reports behind that line. A dialog rather than a panel of our own:
       the browser draws it above everything, so the card being one row tall
       and clipped cannot cut it off. */
    /* As large as the screen sensibly allows, and landscape: the map on one
       side, the list on the other. Below a screen width that cannot hold two
       columns they fall under one another instead. */
    dialog.pop { width: min(1100px, 94vw); height: min(760px, 88vh);
                 max-width: none; max-height: 88vh; padding: 0; border: none;
                 border-radius: var(--ha-card-border-radius, 12px);
                 background: var(--card-background-color, #1c1c1c);
                 color: var(--primary-text-color);
                 box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); overflow: hidden; }
    dialog.pop::backdrop { background: rgba(0, 0, 0, 0.6); }
    /* The same layer as on the card, for the format whose card is one line:
       there the background belongs to the pop-up, which is the surface with
       room for it. No position of its own - a modal dialog is already
       positioned by the browser, and saying so again would take it out of
       the middle of the screen. */
    dialog.pop::before {
      content: "";
      position: absolute;
      inset: 0;
      background-color: var(--blitzer-card-background-color, transparent);
      background-image: var(--blitzer-card-background-image, none);
      background-size: var(--blitzer-card-background-size, cover);
      background-repeat: var(--blitzer-card-background-repeat, no-repeat);
      background-position: center;
      opacity: var(--blitzer-card-background-opacity, 1);
      pointer-events: none;
      z-index: 0;
    }
    .pop-head, .pop-body { position: relative; z-index: 1; }
    .pop-head { display: flex; align-items: center; justify-content: space-between;
                gap: 12px; padding: 12px 16px; box-sizing: border-box; height: 57px;
                border-bottom: 1px solid var(--divider-color); }
    /* Takes the width whether or not it says anything, so hiding the title
       leaves the close button in the corner it always sits in. */
    .pop-title { flex: 1 1 auto; min-width: 0; font-size: 1.1rem; font-weight: 500; }
    .pop-traffic { position: relative; z-index: 1; padding: 0 16px 8px; }
    .pop-traffic[hidden] { display: none; }
    .pop-traffic .traffic-line { margin-top: 0; }
    .pop-close { background: none; border: none; font: inherit; font-size: 1rem;
                 color: var(--secondary-text-color); cursor: pointer;
                 padding: 4px 8px; border-radius: 6px; }
    .pop-close:hover { background: rgba(127, 127, 127, 0.12); color: var(--primary-text-color); }
    .pop-body { display: flex; gap: 16px; padding: 12px 16px; box-sizing: border-box;
                height: calc(100% - 57px); overflow: hidden; }
    .pop-map { flex: 1 1 0; min-width: 0; position: relative;
               border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; }
    .pop-map > * { height: 100%; }
    .pop-list { flex: 1 1 0; min-width: 0; overflow-y: auto; overflow-x: hidden; }
    @media (max-width: 800px) {
      .pop-body { flex-direction: column; }
      .pop-map { flex: 0 0 40%; }
      .pop-list { flex: 1 1 auto; }
      /* Alone in there, the map takes the height it would have shared. */
      .pop-body.solo .pop-map { flex: 1 1 auto; }
    }
    /* Two fixed columns rather than a wrapping row: the dropdowns keep the
       top right corner whatever the title, the area name or the report count
       happen to be, instead of dropping to their own line - and, once a map
       is shown, wandering across it. minmax(0, 1fr) lets the left column
       shrink so a long title is what gives way, not the picker column. */
    /* On the title line with the badges, and no bigger than one: a way to
       ask for fresh reports, not a thing to look at. */
    /* No box of its own and no size of its own: the symbol inside is an
       ha-icon.fit-icon like the one that opens this same line, so it sizes
       itself to a capital of the text and rides the same baseline. A button
       with a width would have put its own box in the way of that - which is
       exactly what had it sitting half a line too low. */
    .refresh { display: inline; padding: 0; border: none; background: none;
               font: inherit; color: inherit; cursor: pointer; }
    .refresh .fit-icon { margin: 0 0 0 6px; }
    .refresh:hover { color: var(--primary-text-color); }
    .refresh:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px;
                             border-radius: 4px; }
    .refresh[disabled] { cursor: default; }
    .refresh.spinning ha-icon { animation: blitzer-spin 1s linear infinite; }
    /* The rotate property rather than a transform: the fit above already
       uses the transform to drop the drawing onto the baseline, and a
       rotation written as one would throw that away while it spins. */
    @keyframes blitzer-spin { to { rotate: 360deg; } }
    /* Nobody asked for a spinning icon; a reader who did ask for less motion
       gets a dimmed button instead. */
    @media (prefers-reduced-motion: reduce) {
      .refresh.spinning ha-icon { animation: none; }
      .refresh.spinning { opacity: 0.5; }
    }
    .head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: start; }
    .title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
             font-size: 1.25rem; font-weight: 500; color: var(--primary-text-color); }
    .title-text { display: inline-flex; align-items: center; gap: 8px; min-width: 0;
                  overflow-wrap: anywhere; }
    .badge { font-size: .75rem; font-weight: 500; padding: 2px 8px; border-radius: 12px;
             text-align: center;
             background: var(--blitzer-count-background, var(--secondary-background-color));
             color: var(--blitzer-count-color, var(--secondary-text-color)); }
    /* Loud on purpose - it is the one thing on the card worth interrupting a
       glance for. Both halves are themeable, so a dashboard that already owns
       an accent can hand it its own. */
    /* Colour only. Weight, capitals and spacing come from the configuration
       so that the Layout switches and the card can never disagree - a rule
       here would win against a switch turned off and make it a lie. */
    .badge.new, .new-tag {
      background: var(--blitzer-new-background, var(--accent-color, #ff9800));
      color: var(--blitzer-new-color, #fff);
    }
    /* The same badge in the colour of what it reports: time lost. These
       two are what an unset Colour and Background mean on its own element
       (Layout -> Delay badge); anything set there is written inline and
       wins, exactly as it does on the NEW badge above. */
    .badge.delay {
      background: var(--blitzer-delay-background, var(--error-color, #db4437));
      color: var(--blitzer-delay-color, #fff);
      white-space: nowrap;
    }
    .new-tag { font-size: .68rem; padding: 1px 6px; border-radius: 8px; margin-left: 6px;
               vertical-align: middle; white-space: nowrap; }
    /* The head badge is a button - clicking it narrows the card to what is
       new - so it has to shed the browser's own button look and say, both to
       the eye and to a screen reader, whether that narrowing is on. */
    button.badge { font: inherit; font-size: .75rem; border: none; cursor: pointer; }
    button.badge[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--primary-text-color); }
    /* Icon and words are one run of text, so the icon takes the line's own
       colour and grows with its font size instead of staying at a fixed 24px
       beside text somebody has enlarged. */
    /* The icon rides the text's own baseline rather than the middle of the
       line, and is exactly one cap tall - so it starts and ends where the "B"
       of "Berlin" does instead of hanging below it, and grows with the line
       because the cap unit is the font's own capital height.
       Two details make that exact. The line is a plain block, not a flexbox:
       a flex item is aligned by the flex baseline rules, which put this icon
       5px too high whatever display it was given. And overflow:hidden is what
       makes an inline-block report its bottom margin edge as its baseline
       instead of synthesising one from its contents - measured on the running
       card, that is the difference between a 5px offset and none at all.
       line-height:0 goes with it: ha-icon lays its drawing out as an inline
       box, so the line's own leading pushed the artwork half a line down
       inside the box, where overflow:hidden then cut it in half. */
    .sub { font-size: .8rem; color: var(--secondary-text-color); margin-top: 2px; }
    .traffic-line {
      font-size: .8rem; color: var(--secondary-text-color); margin-top: 4px;
      display: flex; align-items: center; gap: 6px;
    }
    .traffic-switch {
      position: relative; display: inline-block; width: 26px; height: 14px;
      flex-shrink: 0; cursor: pointer;
    }
    .traffic-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
    .traffic-switch .track {
      position: absolute; inset: 0; border-radius: 14px; transition: .2s;
      background: var(--disabled-text-color, #ccc);
    }
    .traffic-switch .track::before {
      content: ""; position: absolute; width: 10px; height: 10px; left: 2px; top: 2px;
      border-radius: 50%; background: #fff; transition: .2s;
    }
    .traffic-switch input:checked + .track { background: var(--primary-color); }
    .traffic-switch input:checked + .track::before { transform: translateX(12px); }
    .traffic-switch input:focus-visible + .track { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    ha-icon.fit-icon {
      display: inline-block;
      vertical-align: baseline;
      overflow: hidden;
      line-height: 0;
      --mdc-icon-size: 1cap;
      width: 1cap;
      height: 1cap;
      margin-right: 6px;
    }
    /* Stacked, area over filter, both stretched to the wider one's width so
       the pair reads as one block rather than two loose controls. */
    .pickers { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
    .pickers select { width: 100%; }
    /* A card narrower than this - the ordinary portrait card in a dashboard
       column - has no room for the dropdowns beside the title, and squeezing
       them in there is what put the count badge on top of the name. Below a
       threshold they take a row of their own, side by side, and the title
       gets the full width back. The query asks the card, not the window, so
       it holds wherever the card is put. */
    @container (max-width: 440px) {
      .head { grid-template-columns: minmax(0, 1fr); }
      .pickers { flex-direction: row; }
      .pickers select { flex: 1 1 0; min-width: 0; }
    }
    select { font: inherit; font-size: .85rem; padding: 4px 8px; border-radius: 8px;
             color: var(--primary-text-color); background: var(--card-background-color);
             border: 1px solid var(--divider-color); }
    .mapwrap:not(:empty) { margin-top: 12px; border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; }
    .mapwrap ha-card { padding: 0; box-shadow: none; border: none; background: none; }
    .list { margin-top: 8px; }
    .row { display: flex; gap: 12px; padding: 10px 0; cursor: pointer;
           border-top: var(--blitzer-divider-width, 1px) var(--blitzer-divider-style, solid)
                       var(--blitzer-divider-color, var(--divider-color)); }
    .row:first-child { border-top: none; }
    /* The entry whose report was just clicked on the map. */
    .row.hl { background: var(--blitzer-highlight-background, rgba(var(--rgb-primary-color, 3, 169, 244), 0.22)); }
    .list.no-divider .row { border-top: none; }
    .pic { flex: 0 0 34px; display: flex; align-items: flex-start; justify-content: center; }
    .pic img { width: 34px; height: 34px; object-fit: contain; }
    .body { min-width: 0; flex: 1; overflow-wrap: anywhere; }
    .line1 { color: var(--primary-text-color); }
    .line2 { font-size: .85rem; color: var(--secondary-text-color); }
    .extra { font-size: .8rem; color: var(--secondary-text-color); margin-top: 2px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
    .chip { font-size: .72rem; padding: 2px 8px; border-radius: 10px;
            color: var(--secondary-text-color); border: 1px solid var(--divider-color);
            background: var(--blitzer-row-chip-background, rgba(128, 128, 128, 0.12)); }
    /* A rating, not a label, so no chip frame around it. Sized in em off the
       chips beside it, so the stars stay their size. */
    .stars { display: inline-flex; align-items: center; gap: 2px; font-size: .72rem;
             color: var(--blitzer-row-stars-color, var(--primary-text-color)); }
    .chips .chip, .chips .stars { flex-shrink: 0; }
    .stars svg { width: 1.35em; height: 1.35em; display: block; fill: currentColor; }
    /* The rest of the list, folded away: a strip with nothing on it but a
       chevron, so the card ends on an invitation rather than on an entry cut
       in half. Home Assistant's own way of saying "there is more". */
    .fold { display: flex; align-items: center; justify-content: center;
            width: 100%; padding: 4px 0; background: none; border: none;
            color: var(--secondary-text-color); cursor: pointer; }
    .fold:hover { color: var(--primary-text-color); }
    .fold:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px;
                          border-radius: 8px; }
    .fold ha-icon { --mdc-icon-size: 24px; width: 24px; height: 24px; }
    .empty { padding: 16px 0; text-align: center; color: var(--secondary-text-color); }
  `;

  // Defining the two elements - and defining them again if Home Assistant
  // swaps the registry out from under them.
  //
  // The app bundle's very first statement replaces window.customElements with
  // the scoped registry polyfill, and that polyfill answers only for what was
  // defined into it: anything registered before it arrived is invisible
  // afterwards. customElements.get() returns undefined, whenDefined() never
  // fires, and the card shows "Configuration error" with nothing in the
  // console and nothing in the log. Whether this file runs before or after
  // that statement is an unordered race between two imports in the page - Home
  // Assistant's own import of the app bundle, and the one it writes into the
  // page for this card (home-assistant/frontend#53890).
  //
  // So: define now, remember which registry took it, and watch for that object
  // being replaced. Watching the registry itself rather than waiting for
  // "home-assistant" to be defined is the point - the swap and that definition
  // are one synchronous task, so by the first tick of any timer the tag is
  // always there, and a check built on it would stop before doing anything.
  const TAGS = [
    [CARD_TAG, BlitzerCard],
    [EDITOR_TAG, BlitzerCardEditor],
  ];
  const WATCHING = "__blitzerCardRegistryWatch";
  const WARNED = "__blitzerCardDefineWarned";

  const defineAll = () => {
    const registry = window.customElements;
    for (const [tag, cls] of TAGS) {
      if (registry.get(tag)) continue;
      try {
        registry.define(tag, cls);
      } catch (err) {
        // Usually another copy of this file between the check and here, and
        // then there is nothing to do. But this is also where the failure this
        // whole block exists to prevent would show up, so it gets said once
        // rather than thrown away on every tick.
        if (!window[WARNED]) {
          window[WARNED] = true;
          console.warn(`blitzer-card: could not define ${tag}`, err);
        }
      }
    }
    return registry;
  };

  let registry = defineAll();

  // One watcher per page, for the same reason the elements are guarded above:
  // this file can be evaluated twice. The flag is handed back when the watcher
  // is done, so a copy arriving later still gets to watch.
  if (!window[WATCHING]) {
    window[WATCHING] = true;
    // Half a minute of a page's life, then the page is what it is going to be.
    // Deliberately not "until Home Assistant's app is up": another card that
    // brings its own copy of the same polyfill would swap the registry later,
    // and stopping at the first quiet tick would miss it. A tick costs one
    // comparison while nothing changes, and the swap is checked before the
    // deadline is, so even a single throttled tick in a background tab still
    // repairs before it stops.
    const deadline = performance.now() + 30000;
    const watch = setInterval(() => {
      if (window.customElements !== registry) registry = defineAll();
      if (performance.now() > deadline) {
        clearInterval(watch);
        window[WATCHING] = false;
      }
    }, 100);
  }

  window.customCards = window.customCards || [];
  watchFlowDialogs();

  if (!window.customCards.some((c) => c.type === CARD_TAG)) {
    window.customCards.push({
      type: CARD_TAG,
      name: "Blitzer.de",
      description: "Speed controls and traffic hazards for one configured area, route or tracker.",
      preview: true,
      documentationURL: "https://github.com/somansch/blitzer",
      // Offers this card where Home Assistant asks what to build for a
      // picked entity, which in practice is the card picker's "By entity"
      // tab. The "Add to dashboard" button on a device page looks like the
      // same question but is not: it builds its cards from its own table of
      // domains and never asks a custom card.
      //
      // The answer is the card pinned to the area that entity belongs to -
      // whoever picked a report or a count of München was looking at
      // München, not at every configured area. The area dropdown goes with
      // the pinning: offering the one area the card is already fixed to says
      // nothing, and the subtitle line names it anyway. Both are ordinary
      // settings, so either can be undone in the editor.
      //
      // Deliberately narrow: anything not ours returns null. A card offered
      // for every entity only makes the picker harder to use.
      getEntitySuggestion: (hass, entityId) => {
        if (typeof entityId !== "string") return null;
        const entry = hass && hass.entities && hass.entities[entityId];
        // The registry says which integration an entity came from, which is
        // the one answer that holds for all three kinds this integration
        // creates - the reports, the counts and the two windows.
        if (!entry || entry.platform !== DOMAIN) return null;
        if (!entry.device_id) return { config: { type: `custom:${CARD_TAG}` } };
        return {
          config: {
            type: `custom:${CARD_TAG}`,
            areas: [entry.device_id],
            show_area_picker: false,
          },
        };
      },
    });
  }
})();
