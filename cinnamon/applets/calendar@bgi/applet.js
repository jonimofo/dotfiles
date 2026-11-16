const Applet = imports.ui.applet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Util = imports.misc.util;
const PopupMenu = imports.ui.popupMenu;
const UPowerGlib = imports.gi.UPowerGlib;
const Settings = imports.ui.settings;
const Calendar = require('./calendar');
const EventView = require('./eventView');
const CinnamonDesktop = imports.gi.CinnamonDesktop;
const Main = imports.ui.main;
const Separator = imports.ui.separator;
const Constants = require('./constants');
const DateText = require('./dateText');
const SecondZone = require('./secondZone');
const DaySummary = require('./daySummary');

const DATE_FORMAT_FULL = CinnamonDesktop.WallClock.lctime_format("cinnamon", _("%A, %B %-e, %Y"));

class CinnamonCalendarApplet extends Applet.TextApplet {
    constructor(orientation, panel_height, instance_id) {
        super(orientation, panel_height, instance_id);

        this.setAllowedLayout(Applet.AllowedLayout.BOTH);

        try {
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.orientation = orientation;

            this._initContextMenu();
            this.menu.setCustomStyleClass(`calendar-background ${Constants.STYLE.popup}`);

            this.settings = new Settings.AppletSettings(this, Constants.UUID, this.instance_id);
            this.desktop_settings = new Gio.Settings({ schema_id: "org.cinnamon.desktop.interface" });

            this.clock = new CinnamonDesktop.WallClock();
            this.clock_notify_id = 0;

            // Events
            this.events_manager = new EventView.EventsManager(this.settings, this.desktop_settings);
            this.events_manager.connect("events-manager-ready", this._events_manager_ready.bind(this));
            this.events_manager.connect("has-calendars-changed", this._has_calendars_changed.bind(this));
            this.events_manager.connect("events-updated", () => this._updateDaySummary());

            // Header band: the selected day's date, then the clocks
            let header = new St.BoxLayout(
                {
                    style_class: Constants.STYLE.header,
                    vertical: false
                }
            );
            this.menu.addActor(header);

            let box = new St.BoxLayout(
                {
                    style_class: `calendar-main-box ${Constants.STYLE.columns}`,
                    vertical: false
                }
            );
            this.menu.addActor(box);

            this.event_list = this.events_manager.get_event_list();
            this.event_list.connect("launched-calendar", Lang.bind(this.menu, this.menu.toggle));

            // hack to allow event list scrollbar to be dragged.
            this.event_list.connect("start-pass-events", Lang.bind(this.menu, () => {
                this.menu.passEvents = true;
            }));
            this.event_list.connect("stop-pass-events", Lang.bind(this.menu, () => {
                this.menu.passEvents = false;
            }));

            box.add_actor(this.event_list.actor);

            // The event list's date label moves to the header band, where it stays shown
            // with the events switched off.
            this._headerDate = this.event_list.selected_date_label;
            this.event_list.actor.remove_actor(this._headerDate);
            this._headerDate.set_style_class_name(Constants.STYLE.headerDate);
            this._headerDate.x_expand = true;
            this._headerDate.y_align = Clutter.ActorAlign.CENTER;
            header.add_actor(this._headerDate);

            let calbox = new St.BoxLayout(
                {
                    style_class: Constants.STYLE.calendarColumn,
                    vertical: true
                }
            );

            this.go_home_button = new St.BoxLayout(
                {
                    style_class: "calendar-today-home-button",
                    x_align: Clutter.ActorAlign.END,
                    y_align: Clutter.ActorAlign.CENTER,
                    reactive: true,
                    vertical: false
                }
            );

            this.go_home_button.connect("enter-event", Lang.bind(this, (actor, event) => {
                actor.add_style_pseudo_class("hover");
            }));

            this.go_home_button.connect("leave-event", Lang.bind(this, (actor, event) => {
                actor.remove_style_pseudo_class("hover");
            }));

            this.go_home_button.connect("button-press-event", Lang.bind(this, (actor, event) => {
                if (event.get_button() == Clutter.BUTTON_PRIMARY) {
                    return Clutter.EVENT_STOP;
                }
            }));

            this.go_home_button.connect("button-release-event", Lang.bind(this, (actor, event) => {
                if (event.get_button() == Clutter.BUTTON_PRIMARY) {
                    // button immediately becomes non-reactive, so leave-event will never fire.
                    actor.remove_style_pseudo_class("hover");
                    this._resetCalendar();
                    return Clutter.EVENT_STOP;
                }
            }));

            header.add_actor(this.go_home_button);

            // Local and second-zone clocks: time, then city or label
            this._headerTimes = new St.BoxLayout(
                {
                    style_class: Constants.STYLE.headerTime
                }
            );
            this.go_home_button.add_actor(this._headerTimes);
            this._clocks = [this._buildClock(), this._buildClock()];

            this._calendar = new Calendar.Calendar(this.settings, this.events_manager);
            this._calendar.connect("selected-date-changed", Lang.bind(this, this._updateClockAndDate));
            let calendar_panel = new St.BoxLayout(
                {
                    style_class: Constants.STYLE.calendarPanel,
                    vertical: true
                }
            );
            calendar_panel.add_actor(this._calendar.actor);
            calbox.add_actor(calendar_panel);

            // Summary of the selected day: heading, number of events, first start to last end
            this._daySummary = new St.BoxLayout(
                {
                    style_class: Constants.STYLE.daySummary,
                    vertical: true,
                    visible: false
                }
            );
            this._daySummaryHeading = new St.Label({ style_class: Constants.STYLE.daySummaryHeading });
            this._daySummaryCount = new St.Label();
            this._daySummaryRange = new St.Label();
            this._daySummary.add_actor(this._daySummaryHeading);
            this._daySummary.add_actor(this._daySummaryCount);
            this._daySummary.add_actor(this._daySummaryRange);
            calbox.add_actor(this._daySummary);

            box.add_actor(calbox);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            let item = new PopupMenu.PopupMenuItem(_("Date and Time Settings"));
            item.connect("activate", Lang.bind(this, this._onLaunchSettings));

            this.menu.addMenuItem(item);

            this.settings.bind("show-events", "show_events", this._onSettingsChanged);
            this.settings.bind("use-custom-format", "use_custom_format", this._onSettingsChanged);
            this.settings.bind("custom-format", "custom_format", this._onSettingsChanged);
            this.settings.bind("custom-tooltip-format", "custom_tooltip_format", this._onSettingsChanged);
            this._secondZoneResolver = new SecondZone.SecondZone(message => global.logError(message));
            this._secondZone = null;
            this.settings.bind(Constants.SHOW_SECOND_ZONE_KEY, "show_second_zone", this._onSettingsChanged);
            this.settings.bind(Constants.SECOND_ZONE_ID_KEY, "second_zone_id", this._onSettingsChanged);
            this.settings.bind(Constants.SECOND_ZONE_LABEL_KEY, "second_zone_label", this._onSettingsChanged);
            this.settings.bind("keyOpen", "keyOpen", this._setKeybinding);
            this._setKeybinding();

            /* FIXME: Add gobject properties to the WallClock class to allow easier access from
             * its clients, and possibly a separate signal to notify of updates to these properties
             * (though GObject "changed" would be sufficient.) */
            this.desktop_settings.connect("changed::clock-use-24h", Lang.bind(this, function (key) {
                this._onSettingsChanged();
            }));
            this.desktop_settings.connect("changed::clock-show-seconds", Lang.bind(this, function (key) {
                this._onSettingsChanged();
            }));

            // https://bugzilla.gnome.org/show_bug.cgi?id=655129
            this._upClient = new UPowerGlib.Client();
            try {
                this._upClient.connect('notify-resume', Lang.bind(this, this._updateClockAndDate));
            } catch (e) {
                this._upClient.connect('notify::resume', Lang.bind(this, this._updateClockAndDate));
            }
        }
        catch (e) {
            global.logError(e);
        }
    }

    _setKeybinding() {
        Main.keybindingManager.addHotKey("calendar-open-" + this.instance_id, this.keyOpen, Lang.bind(this, this._openMenu));
    }

    _clockNotify(obj, pspec, data) {
        this._updateClockAndDate();
    }

    on_applet_clicked(event) {
        this._openMenu();
    }

    _openMenu() {
        this.menu.toggle();
    }

    _onSettingsChanged() {
        this._updateSecondZone();
        this._updateFormatString();
        this._updateClockAndDate();
        this.event_list.actor.visible = this.events_manager.is_active();
        this.events_manager.select_date(this._calendar.getSelectedDate(), true);
    }

    on_custom_format_button_pressed() {
        Util.spawnCommandLine("xdg-open https://cinnamon-spices.linuxmint.com/strftime.php");
    }

    _onLaunchSettings() {
        this.menu.close();
        Util.spawnCommandLine("cinnamon-settings calendar");
    }

    _updateFormatString() {
        let in_vertical_panel = (this.orientation == St.Side.LEFT || this.orientation == St.Side.RIGHT);

        if (this.use_custom_format) {
            if (!this.clock.set_format_string(this.custom_format)) {
                global.logError("Calendar applet: bad time format string - check your string.");
                this.clock.set_format_string("~CLOCK FORMAT ERROR~ %l:%M %p");
            }
        } else if (in_vertical_panel) {
            let use_24h = this.desktop_settings.get_boolean("clock-use-24h");
            let show_seconds = this.desktop_settings.get_boolean("clock-show-seconds");

            if (use_24h) {
                if (show_seconds) {
                    this.clock.set_format_string("%H%n%M%n%S");
                } else {
                    this.clock.set_format_string("%H%n%M%");
                }
            } else {
                if (show_seconds) {
                    this.clock.set_format_string("%l%n%M%n%S");
                } else {
                    this.clock.set_format_string("%l%n%M%");
                }
            }
        } else {
            this.clock.set_format_string(null);
        }
    }

    _events_manager_ready(em) {
        this.event_list.actor.visible = this.events_manager.is_active();
        this.events_manager.select_date(this._calendar.getSelectedDate(), true);
    }

    _has_calendars_changed(em) {
        this.event_list.actor.visible = this.events_manager.is_active();
        this._updateDaySummary();
    }

    _buildClock() {
        let clock = {
            actor: new St.BoxLayout({ style_class: Constants.STYLE.clock }),
            time: new St.Label({ style_class: Constants.STYLE.clockTime }),
            suffix: new St.Label({ style_class: Constants.STYLE.clockSuffix })
        };
        clock.actor.add_actor(clock.time);
        clock.actor.add_actor(clock.suffix);
        this._headerTimes.add_actor(clock.actor);
        return clock;
    }

    _updateClocks(now) {
        let city = DateText.cityFromZoneId(GLib.TimeZone.new_local().get_identifier());
        let clocks = DateText.headerClocks(now.format(this._timeFormat()), city, this._secondTime(now));
        this._clocks.forEach((clock, i) => {
            clock.actor.visible = i < clocks.length;
            if (clock.actor.visible) {
                clock.time.set_text(clocks[i].time);
                clock.suffix.set_text(clocks[i].suffix);
                clock.suffix.visible = clocks[i].suffix !== "";
            }
        });
    }

    // The card under the calendar, for the selected day; hidden when it has no event.
    _updateDaySummary() {
        let selected = this._calendar.getSelectedDate();
        let day_start = EventView.date_only(EventView.js_date_to_gdatetime(selected));
        let events = this.events_manager.is_active() ? this.events_manager.get_events_for_date(selected) : [];
        let summary = DaySummary.summariseDay(events.map(event => ({
            allDay: event.all_day,
            start: DaySummary.minutesFrom(day_start, event.start),
            end: DaySummary.minutesFrom(day_start, event.end)
        })));

        this._daySummary.visible = summary.count > 0;
        if (!this._daySummary.visible) {
            return;
        }

        let long_date = DateText.formatLongDate(DateText.datePartsOf(day_start, Constants.LONG_DATE_FORMATS));
        this._daySummaryHeading.set_text(DaySummary.summaryHeading(this._calendar.todaySelected(), long_date));
        this._daySummaryCount.set_text(DaySummary.formatEventCount(summary.count));
        this._daySummaryRange.visible = summary.range !== null;
        if (summary.range !== null) {
            let format = this._timeFormat();
            this._daySummaryRange.set_text(DaySummary.formatRange(
                day_start.add_minutes(summary.range.start).format(format),
                day_start.add_minutes(summary.range.end).format(format)));
        }
    }

    _updateSecondZone() {
        this._secondZone = this._secondZoneResolver.resolve(this.show_second_zone, this.second_zone_id);
    }

    _inVerticalPanel() {
        return this.orientation == St.Side.LEFT || this.orientation == St.Side.RIGHT;
    }

    _timeFormat() {
        return DateText.timeFormatFor(this.desktop_settings.get_boolean("clock-use-24h"),
                                      this.desktop_settings.get_boolean("clock-show-seconds"));
    }

    // {label, time} of the second zone, or null when it is hidden.
    _secondTime(now) {
        if (this._secondZone === null) {
            return null;
        }
        return {
            label: (this.second_zone_label || "").trim(),
            time: SecondZone.timeInZone(now, this._secondZone, this._timeFormat())
        };
    }

    // A vertical panel keeps the stock text. Elsewhere the custom format, when on, replaces
    // the date part only.
    _panelText(now) {
        if (this._inVerticalPanel()) {
            let text = this.clock.get_clock();
            return this.use_custom_format ? text : text.capitalize();
        }

        let date_text = this.use_custom_format ?
            this.clock.get_clock() :
            DateText.formatShortDate(DateText.datePartsOf(now, Constants.SHORT_DATE_FORMATS));
        return DateText.formatPanelText(date_text, now.format(this._timeFormat()), this._secondTime(now));
    }

    _updateClockAndDate() {
        let now = GLib.DateTime.new_now_local();
        let label_string = this._panelText(now);

        this.go_home_button.reactive = !this._calendar.todaySelected();
        if (this._calendar.todaySelected()) {
            this.go_home_button.reactive = false;
            this.go_home_button.set_style_class_name("calendar-today-home-button");
        } else {
            this.go_home_button.reactive = true;
            this.go_home_button.set_style_class_name("calendar-today-home-button-enabled");
        }

        this.set_applet_label(label_string);

        let dateFormattedTooltip = this.clock.get_clock_for_format(DATE_FORMAT_FULL).capitalize();
        if (this.use_custom_format) {
            dateFormattedTooltip = this.clock.get_clock_for_format(this.custom_tooltip_format).capitalize();
            if (!dateFormattedTooltip) {
                global.logError("Calendar applet: bad tooltip time format string - check your string.");
                dateFormattedTooltip = this.clock.get_clock_for_format("~CLOCK FORMAT ERROR~ %l:%M %p");
            }
        }

        this._updateClocks(now);
        this._headerDate.set_text(DateText.formatLongDate(DateText.datePartsOf(
            EventView.js_date_to_gdatetime(this._calendar.getSelectedDate()), Constants.LONG_DATE_FORMATS)));
        this.set_applet_tooltip(dateFormattedTooltip);

        this.events_manager.select_date(this._calendar.getSelectedDate());
        this._updateDaySummary();
    }

    on_applet_added_to_panel() {
        this._onSettingsChanged();

        if (this.clock_notify_id == 0) {
            this.clock_notify_id = this.clock.connect("notify::clock", () => this._clockNotify());
        }

        /* Populates the calendar so our menu allocation is correct for animation */
        this.events_manager.start_events();
        this._resetCalendar();
    }

    on_applet_removed_from_panel() {
        Main.keybindingManager.removeHotKey("calendar-open-" + this.instance_id);
        if (this.clock_notify_id > 0) {
            this.clock.disconnect(this.clock_notify_id);
            this.clock_notify_id = 0;
        }
    }

    _initContextMenu() {
        this.menu = new Applet.AppletPopupMenu(this, this.orientation);
        this.menuManager.addMenu(this.menu);

        // Whenever the menu is opened, select today
        this.menu.connect('open-state-changed', Lang.bind(this, function (menu, isOpen) {
            if (isOpen) {
                let monitor = Main.layoutManager.findMonitorForActor(this.actor);
                this.event_list.set_monitor_height(monitor ? monitor.height : null);
                this._resetCalendar();
                this.events_manager.select_date(this._calendar.getSelectedDate(), true);
            }
        }));
    }

    _resetCalendar() {
        this._calendar.setDate(new Date(), true);
    }

    on_orientation_changed(orientation) {
        this.orientation = orientation;
        this.menu.setOrientation(orientation);
        this._onSettingsChanged();
    }
}

function main(metadata, orientation, panel_height, instance_id) {
    return new CinnamonCalendarApplet(orientation, panel_height, instance_id);
}
