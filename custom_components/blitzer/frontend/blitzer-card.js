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
      count: (n) => `${n} shown`,
      countOf: (n, total) => `${n} of ${total}`,
      countView: (n) => `${n} in view`,
      newLabel: "New",
      newCount: (n) => `${n} New`,
      noNew: "Nothing new right now",
      newReports: "new reports",
      popClose: "Close",
      foldOpen: (n) => `Show ${n} more`,
      foldClose: "Show fewer",
      edLayout: "Format",
      edLayoutHelp: "Portrait stacks the map over the list, landscape puts them side by side. Minimal is one line with what is new, and the reports behind it in a pop-up.",
      miniLabelTotal: "total",
      miniLabelNew: "new",
      edMiniIconHelp: "Any MDI name, drawn in front of the number. Empty leaves the number on its own.",
      edMiniIconColorHelp: "Empty takes the colour of the number beside it.",
      edMiniIconSizeHelp: "How large the symbol is drawn, e.g. 22px. Empty keeps its usual size.",
      edFontColor: "Text color",
      edMiniBg: "Background color",
      edMiniBgHelp: "The fill behind this half of the minimal line. The new reports start on the accent they already wear; empty leaves the fill clear.",
      edMiniBgOpacity: "Opacity",
      edMiniBgOpacityHelp: "How much of that colour comes through, in percent. With no colour set there is nothing for it to act on.",
      edElMiniTotal: "Total number of reports",
      edElMiniTotalHelp: "The half of the minimal line counting everything the area reports.",
      edMiniTotalColorHelp: "Text color for the total.",
      edMiniTotalFontHelp: "Font size for the total.",
      edElMiniNew: "New reports",
      edElMiniNewHelp: "The half of the minimal line counting only what is still new.",
      edMiniNewColorHelp: "Text color for the number of new reports.",
      edMiniNewFontHelp: "Font size for the number of new reports.",
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
      edMiniTotalHelp: "The half of the minimal line counting how many reports the area has at all. Off leaves only what is new.",
      layoutPortrait: "Portrait",
      layoutLandscape: "Landscape",
      layoutMinimal: "Minimal",
      newFilterOn: "Show only the new reports",
      newFilterOff: "Back to all reports",
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
      edShowNew: "Show and mark new reports",
      edShowNewHelp: "Marks fresh reports as NEW, and draws the new half of the minimal line. How long something counts as new is set on the area in Home Assistant - one window for controls, one for hazards.",
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
      edSubAreaHelp: "The area or route the card is showing.",
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
      edReferenceHelp: "The point every distance is measured from.",
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
      edMarkerBackground: "Background behind the symbols",
      edMarkerBackgroundHelp: "The filled disc each marker sits on. Off lets the map show through.",
      edFollowMap: "List follows the map",
      edFollowMapHelp: "The map then shows the whole area and the list shows what is inside the visible part of it - for following a route. Switched off, the map mirrors the list instead.",
    },
    de: {
      title: "Blitzer.de",
      filterAll: "Alles",
      filterControls: "Nur Kontrollen",
      filterHazards: "Nur Gefahren",
      radius: "Radius",
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
      count: (n) => `${n} angezeigt`,
      countOf: (n, total) => `${n} von ${total}`,
      countView: (n) => `${n} im Ausschnitt`,
      newLabel: "Neu",
      newCount: (n) => `${n} Neu`,
      noNew: "Aktuell nichts Neues",
      newReports: "neue Meldungen",
      popClose: "Schließen",
      foldOpen: (n) => `${n} weitere anzeigen`,
      foldClose: "Weniger anzeigen",
      edLayout: "Format",
      edLayoutHelp: "Hochformat stellt die Karte über die Liste, Querformat nebeneinander. Minimalformat ist eine Zeile mit dem, was neu ist, und den Meldungen dahinter in einem Pop-up.",
      miniLabelTotal: "gesamt",
      miniLabelNew: "neu",
      edMiniIconHelp: "Ein beliebiger MDI-Name, gezeichnet vor der Zahl. Leer steht die Zahl für sich.",
      edMiniIconColorHelp: "Leer übernimmt die Farbe der Zahl daneben.",
      edMiniIconSizeHelp: "Wie groß das Symbol gezeichnet wird, z. B. 22px. Leer bleibt es bei seiner üblichen Größe.",
      edFontColor: "Schriftfarbe",
      edMiniBg: "Hintergrundfarbe",
      edMiniBgHelp: "Die Fläche hinter dieser Hälfte der Minimalzeile. Bei den neuen Meldungen steht hier der Akzent, den sie ohnehin trägt; leer bleibt die Fläche durchsichtig.",
      edMiniBgOpacity: "Deckkraft",
      edMiniBgOpacityHelp: "Wie viel von dieser Farbe durchkommt, in Prozent. Ohne gesetzte Farbe hat sie nichts, worauf sie wirken könnte.",
      edElMiniTotal: "Gesamtanzahl Meldungen",
      edElMiniTotalHelp: "Die Hälfte der Minimalzeile, die alles zählt, was der Bereich meldet.",
      edMiniTotalColorHelp: "Textfarbe für die Gesamtanzahl.",
      edMiniTotalFontHelp: "Schriftgröße für die Gesamtanzahl.",
      edElMiniNew: "Neue Meldungen",
      edElMiniNewHelp: "Die Hälfte der Minimalzeile, die nur zählt, was noch neu ist.",
      edMiniNewColorHelp: "Textfarbe für die Anzahl der neuen Meldungen.",
      edMiniNewFontHelp: "Schriftgröße für die Anzahl der neuen Meldungen.",
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
      edMiniTotalHelp: "Die Hälfte der Minimalzeile, die zählt, wie viele Meldungen der Bereich überhaupt hat. Aus bleibt nur, was neu ist.",
      layoutPortrait: "Hochformat",
      layoutLandscape: "Querformat",
      layoutMinimal: "Minimalformat",
      newFilterOn: "Nur die neuen Meldungen anzeigen",
      newFilterOff: "Zurück zu allen Meldungen",
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
      edShowNew: "Neue Meldungen anzeigen und markieren",
      edShowNewHelp: "Markiert frische Meldungen als NEU und zeichnet die Neu-Hälfte der Minimalzeile. Wie lange etwas als neu gilt, steht am Bereich in Home Assistant - je ein Zeitraum für Kontrollen und für Gefahren.",
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
      edSubAreaHelp: "Der Bereich oder die Route, die die Karte zeigt.",
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
      edReferenceHelp: "Der Punkt, von dem aus alle Entfernungen gerechnet werden.",
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
      edMarkerBackground: "Hintergrund der Symbole",
      edMarkerBackgroundHelp: "Die gefüllte Scheibe, auf der eine Markierung sitzt. Aus scheint die Karte durch.",
      edFollowMap: "Liste folgt der Karte",
      edFollowMapHelp: "Die Karte zeigt dann den ganzen Bereich und die Liste, was im sichtbaren Ausschnitt liegt - zum Verfolgen einer Route. Ausgeschaltet spiegelt die Karte stattdessen die Liste.",
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
    // Which halves the minimal line is made of. The other one follows
    // show_new: with nothing marked as new there is no new half to draw.
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
  function minutesSince(created, now) {
    if (typeof created !== "string") return null;
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

  function reportedText(str, created) {
    if (!created) return "";
    return created.includes(".") ? str.reportedOn(created) : str.reportedAt(created);
  }

  // Blitzer.de dates a confirmation the same way it dates a report: a bare
  // time while it is from today, a date once it is not. "01.01.1970" is what
  // it puts on something that was never community-confirmed at all - a fixed
  // installation, say - and means "no confirmation" rather than a date.
  function confirmedText(str, confirmed) {
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
      this._highlight = null;
      this._centred = false;
      this._newRows = new Set();
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
      if (!row || !this._leaflet) return false;
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
      try {
        this._leaflet.setView([row.lat, row.lon], Math.max(this._leaflet.getZoom() || 0, FOCUS_ZOOM));
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
      const reference = this._referencePoint();
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
      // Nothing new left to show - the badge that would switch this back off
      // has gone with it, so the card lets go of the filter itself rather
      // than stranding whoever set it on an empty list. Not when the card was
      // configured this way, though: showing everything would then be the
      // opposite of what the dashboard asked for.
      if (this._onlyNew && !this._newRows.size && this._config.only_new !== true) {
        this._onlyNew = false;
      }

      const candidates = this._onlyNew ? pool.filter((r) => this._newRows.has(r.entityId)) : pool;
      this._inView = this._following && this._bounds ? candidates.length : null;
      const limit = this._config.show_max ? this._config.max : 0;
      this._rows = limit > 0 ? candidates.slice(0, limit) : candidates;
      // While following, the map shows the whole area rather than the visible
      // slice of it - but "only new" is not about the viewport, so it applies
      // to the map either way.
      this._mapRows = this._following
        ? (this._onlyNew
            ? all.filter((r) => isNewReport(r, windows, now))
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
      // count, so it stays one.
      const dead = (value) => !value && !this._miniTapAction;
      const half = (what, scope, prefix, value, label) => {
        const style = elementStyle(this._config, prefix);
        // The fill goes on a layer of its own rather than on the button, for
        // the same reason the card's background does: an opacity set on the
        // button would take the number and the word down with it.
        const fill = [];
        const colour = this._config[`${prefix}_fill_color`];
        const half = prefix === "mini_new" ? "mini-new" : "mini-total";
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
        return `<button type="button" class="mini-half ${what}${dead(value) ? " empty" : ""}"
                 data-scope="${scope}"${dead(value) ? " disabled" : ""}
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
      // Each half on its own switch, and neither stands in for the other:
      // with both off the line is empty, which is what two switches set to
      // off asked for.
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
    // cameras, and each half costs one of its own.
    //
    // The action is addressed to the config entry rather than to the device,
    // because that is what the integration registered it for. The device
    // knows its entry, so the card does not have to be told.
    async _refresh(button, areaId) {
      const device = this._hass && this._hass.devices && this._hass.devices[areaId];
      const entry = device && (device.config_entries || [])[0];
      if (!entry || button.disabled) return;
      const wanted =
        this._filter === "controls"
          ? ["refresh_controls"]
          : this._filter === "hazards"
            ? ["refresh_hazards"]
            : ["refresh_controls", "refresh_hazards"];
      button.disabled = true;
      button.classList.add("spinning");
      try {
        for (const service of wanted) {
          await this._hass.callService(DOMAIN, service, { config_entry_id: entry });
        }
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

    // What the pop-up is about - decided by which of the two numbers opened it.
    _popRows() {
      return this._popScope === "all" ? this._allRows || [] : this._newReports();
    }

    // The reports behind the line: the map on one side, the list on the other,
    // both drawn exactly as the card draws them - so every Layout setting for
    // the map and for a list entry holds in here too.
    _fillPop(str) {
      const rows = this._popRows();
      this._popRowsCache = rows;
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
      this._fillPopList(str);
      this._syncPopMap(rows);
    }

    // The list on its own, so a highlight can redraw it without rebuilding the
    // map beside it.
    _fillPopList(str) {
      const rows = this._popRowsCache || [];
      const list = this._popEl.querySelector(".pop-list");
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
            this._config.no_reports_text || (this._popScope === "all" ? str.nothing : str.noNew)
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
      if (!row || !this._popLeaflet) return false;
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
      try {
        this._popLeaflet.setView(
          [row.lat, row.lon],
          Math.max(this._popLeaflet.getZoom() || 0, FOCUS_ZOOM)
        );
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
      const key = ids.join(",");
      if (!ids.length) {
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
      const card = await helpers.createCardElement({ type: "map", entities: ids, auto_fit: true });
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
        const leaflet = haMap && haMap.leafletMap;
        if (!leaflet || typeof leaflet.on !== "function") {
          if (attempt < 10) window.setTimeout(() => tryAttach(attempt + 1), 300);
          return;
        }
        this._popLeaflet = leaflet;
        this._popHaMap = haMap;
        this._onPopMarkerClick = (ev) => {
          if (this._config.map_highlight === false) return;
          const marker = ev.composedPath().find((n) => n && n.tagName === "HA-ENTITY-MARKER");
          const id = marker && (marker.entityId || marker.getAttribute("entity-id"));
          if (!id || !(this._popRowsCache || []).some((r) => r.entityId === id)) return;
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
        leaflet.on("click", this._onPopMapClick);
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
      if (this._popLeaflet && this._onPopMapClick) {
        try {
          this._popLeaflet.off("click", this._onPopMapClick);
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
      this._popLeaflet = undefined;
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
      const wanted = scope === "all" ? "all" : "new";
      const rows = wanted === "all" ? this._allRows || [] : this._newReports();
      if (!rows.length) return;
      if (this._config.show_map === false && this._config.show_list === false) return;
      this._popScope = wanted;
      this._highlight = null;
      this._fillPop(t(this._hass));
      this._popEl.showModal();
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
      const mode = area.model === "Wegpunkte" ? str.waypoints : str.radius;
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
          </div>
          ${subText || refresh
            ? `<div class="sub" style="${escapeHtml(elementStyle(this._config, "sub"))}">${
                leadIconHtml(this._config, "sub")
              }<span>${escapeHtml(subText)}</span>${refresh}</div>`
            : ""}
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

      const newButton = this._headEl.querySelector('[data-what="new-filter"]');
      if (newButton) {
        newButton.addEventListener("click", () => {
          this._onlyNew = !this._onlyNew;
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

      const shown = this._mapRows;
      const ids = (shown || []).map((r) => r.entityId).sort();
      const key =
        `${areaId}|${ids.join(",")}|${this._config.map_aspect_ratio}` +
        `|${this._following}|${this._watchesMap}|${this._layout}`;
      if (key === this._mapKey && this._map) {
        this._map.hass = this._hass;
        // Hooks can be missing here for reasons other than a view switch -
        // the map card rebuilding its own insides, say. Both of these do
        // nothing when they are already in place.
        if (!this._leaflet) this._attachMap();
        this._watchMarkers();
        this._styleMap();
        return;
      }

      if (!ids.length) {
        this._detachMap();
        this._unwatchMarkers();
        this._mapEl.innerHTML = "";
        this._map = undefined;
        this._mapKey = key;
        return;
      }

      const mapConfig = {
        type: "map",
        entities: ids,
        // While the card is listening to the map - following it, or measuring
        // from its centre - refitting on every data update would undo the pan
        // the person just made. It fits once, when the map first appears.
        auto_fit: this._keepsView ? !this._mapFitted : true,
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
                ".leaflet-container::after {",
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
              ].join("\n"),
        ].join("\n");
        if (sheet.textContent !== css) sheet.textContent = css;

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
      const tryAttach = (attempt) => {
        const haMap = this._map && this._map.shadowRoot
          ? this._map.shadowRoot.querySelector("ha-map")
          : null;
        const leaflet = haMap && haMap.leafletMap;
        if (!leaflet || typeof leaflet.getBounds !== "function") {
          if (attempt < 10) window.setTimeout(() => tryAttach(attempt + 1), 300);
          return;
        }
        this._leaflet = leaflet;
        this._haMap = haMap;

        // A click on a report picks its entry out of the list. The marker's
        // own handler opens Home Assistant's details dialog, which would
        // cover the very list the highlight is in, so for our own reports
        // the click is caught on the way down and stopped there.
        this._onMarkerClick = (ev) => {
          if (this._config.map_highlight === false) return;
          const marker = ev.composedPath().find((n) => n && n.tagName === "HA-ENTITY-MARKER");
          const id = marker && (marker.entityId || marker.getAttribute("entity-id"));
          if (!id || !(this._allRows || []).some((r) => r.entityId === id)) return;
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
        // Leaflet keeps a marker's click to itself, so this one only ever
        // means "somewhere else" - which is what lets the highlight go.
        this._onMapClick = () => {
          if (!this._highlight) return;
          this._highlight = null;
          this._render();
        };
        leaflet.on("click", this._onMapClick);

        // The viewport itself is only listened to when something reads it:
        // the list following the map, or distances measured from its centre.
        if (!this._watchesMap) return;
        this._onMove = () => {
          try {
            this._bounds = leaflet.getBounds();
            const centre = leaflet.getCenter();
            this._mapCentre = { lat: centre.lat, lon: centre.lng };
          } catch (err) {
            this._bounds = undefined;
            this._mapCentre = undefined;
          }
          this._render();
        };
        leaflet.on("moveend", this._onMove);
        leaflet.on("zoomend", this._onMove);
        this._onMove();
      };
      tryAttach(0);
    }

    _detachMap() {
      if (this._leaflet && this._onMove) {
        try {
          this._leaflet.off("moveend", this._onMove);
          this._leaflet.off("zoomend", this._onMove);
        } catch (err) {
          // The map went away underneath us; nothing left to detach from.
        }
      }
      if (this._leaflet && this._onMapClick) {
        try {
          this._leaflet.off("click", this._onMapClick);
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
      this._leaflet = undefined;
      this._haMap = undefined;
      this._onMove = undefined;
      this._onMapClick = undefined;
      this._onMarkerClick = undefined;
      this._mapCentre = undefined;
    }

    disconnectedCallback() {
      this._detachMap();
      this._unwatchMarkers();
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
    // The minimal format's own three, and the only ones it offers besides
    // the title: everything below answers for a head, a subtitle or a picker
    // that one line does not draw. Read top down the way the format is - the
    // two halves of the line, then the one thing its pop-up shows that the
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

    _numberInput(key, min, max) {
      const input = document.createElement("input");
      input.type = "number";
      input.dataset.field = key;
      input.min = min;
      input.max = max;
      input.addEventListener("input", () => {
        const value = Number.parseInt(input.value, 10);
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
        // There is nothing to follow without a map - and nothing to follow
        // in the minimal format either, where the map is the pop-up's and the
        // list beside it is not tied to what it shows.
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
    // Overlapping the rows behind it is not a fault - it is what a floating
    // tooltip does, in Annuals as here. Being cut off is.
    _placeTooltip(anchor) {
      const tip = anchor.querySelector(".tip");
      if (!tip) return;
      tip.style.cssText = "";
      tip.classList.remove("tip-right", "tip-down");
      const pane = this.getBoundingClientRect();
      const box = this._scrollAncestorRect();
      let rect = tip.getBoundingClientRect();

      // Right-aligned to the icon when opening rightward would run past the
      // column - the same flip Annuals makes in CSS, decided by measurement so
      // that a row it has no rule for is covered too.
      if (rect.right > pane.right - 4) {
        tip.classList.add("tip-right");
        rect = tip.getBoundingClientRect();
      }
      // Still hanging off the left after the flip - a wide tooltip on a narrow
      // column - so slide it back in by hand.
      if (rect.left < pane.left + 4) {
        tip.style.left = `${pane.left + 4 - anchor.getBoundingClientRect().left}px`;
        tip.style.right = "auto";
        rect = tip.getBoundingClientRect();
      }
      // And below the icon when there is no room above it.
      if (rect.top < box.top + 4) tip.classList.add("tip-down");
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
      // Following needs a map whose viewport the list is tied to, which the
      // pop-up's map is not.
      this.shadowRoot.querySelectorAll("[data-with-viewport]").forEach((row) => {
        row.hidden = minimal || !this._wantsMapHere() || inOffTab(row);
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
      border: none;
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
    pop_new: { name: "pop-new", selector: ".pop-list .new-tag" },
    count: { name: "count", selector: ".badge:not(.new)" },
    // The head badge and the tag in the card's own list, which is what this
    // element has always been both of. The pop-up's tag is pop_new above.
    new: { name: "new", selector: ".badge.new, .listwrap .new-tag" },
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
    /* Two halves, each a button: how much there is, and how much of it is new.
       The right half carries the accent, so what is new is what the eye lands
       on - and both are plainly places to press rather than two runs of text. */
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
    /* With nothing new there is nothing to interrupt a glance for, so the
       accent stands down until there is - the fill with it. */
    .mini-half.new.quiet::before { background: none; }
    .mini-half.new.quiet ha-icon,
    .mini-half.new.quiet .mini-value,
    .mini-half.new.quiet .mini-label { color: var(--secondary-text-color); }
    /* A half counting nothing leads nowhere, so it stops offering: no hand,
       no lift under the pointer. The button itself is disabled, and this is
       what keeps it from still looking pressable. */
    .mini-half.empty { cursor: default; }
    .mini-half.empty:hover,
    .mini-half.new.quiet:hover { background: none; }
    /* Too narrow for words: the numbers and their symbols carry it alone. */
    @container (max-width: 250px) {
      .mini-label { display: none; }
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

  if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, BlitzerCard);
  if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, BlitzerCardEditor);

  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === CARD_TAG)) {
    window.customCards.push({
      type: CARD_TAG,
      name: "Blitzer.de",
      description: "Speed controls and traffic hazards for one configured area or route.",
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
