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
const Appearance = require('./appearance');
const TickClock = require('./tickClock');


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
            // Ticks for the applet's own times (seconds included), whatever the custom format
            this._tickClock = TickClock.newTickClock();
            this._tick_notify_id = 0;

            // Events
            this.events_manager = new EventView.EventsManager(this.settings, this.desktop_settings);
            this.events_manager.connect("events-manager-ready", this._events_manager_ready.bind(this));
            this.events_manager.connect("has-calendars-changed", this._has_calendars_changed.bind(this));
            this.events_manager.connect("events-updated", () => this._updateDaySummary());

            // One table: the header band across both columns, then the events and calendar
            // columns.
            let layout = new St.Table(
                {
                    style_class: Constants.STYLE.layout,
                    homogeneous: false
                }
            );
            this.menu.addActor(layout);

            // Header band: date, event count, clocks, in three columns of equal width, so
            // the count is centred in the band and the three never overlap.
            this._header = new St.Table(
                {
                    style_class: Constants.STYLE.header,
                    homogeneous: true
                }
            );
            layout.add(this._header, { row: 0, col: 0, col_span: 2 });

            this._headerCount = new St.Label(
                {
                    style_class: Constants.STYLE.headerCount,
                    visible: false
                }
            );
            this._header.add(this._headerCount, { row: 0, col: 1, x_fill: false, x_align: St.Align.MIDDLE,
                                                  y_fill: false, y_align: St.Align.MIDDLE });

            this.event_list = this.events_manager.get_event_list();
            this.event_list.connect("launched-calendar", Lang.bind(this.menu, this.menu.toggle));

            // hack to allow event list scrollbar to be dragged.
            this.event_list.connect("start-pass-events", Lang.bind(this.menu, () => {
                this.menu.passEvents = true;
            }));
            this.event_list.connect("stop-pass-events", Lang.bind(this.menu, () => {
                this.menu.passEvents = false;
            }));

            layout.add(this.event_list.actor, { row: 1, col: 0, y_fill: true });

            // The event list's date label moves to the header band, where it stays shown
            // with the events switched off.
            this._headerDate = this.event_list.selected_date_label;
            this.event_list.actor.remove_actor(this._headerDate);
            this._headerDate.set_style_class_name(Constants.STYLE.headerDate);
            this._header.add(this._headerDate, { row: 0, col: 0, x_fill: false, x_align: St.Align.START,
                                                 y_fill: false, y_align: St.Align.MIDDLE });

            let calbox = new St.BoxLayout(
                {
                    style_class: Constants.STYLE.calendarColumn,
                    vertical: true
                }
            );

            this.go_home_button = new St.BoxLayout(
                {
                    style_class: "calendar-today-home-button",
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

            this._header.add(this.go_home_button, { row: 0, col: 2, x_fill: false, x_align: St.Align.END,
                                                    y_fill: false, y_align: St.Align.MIDDLE });

            // Local and second-zone clocks: time, then city or label
            this._headerTimes = new St.BoxLayout(
                {
                    style_class: Constants.STYLE.headerTime
                }
            );
            this.go_home_button.add_actor(this._headerTimes);
            this._clocks = [this._buildClock(false), this._buildClock(true)];

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

            // Back to today, as a click on the header clocks
            this._todayButton = new St.Button(
                {
                    style_class: Constants.STYLE.todayButton,
                    label: Constants.TEXT.today,
                    accessible_name: Constants.TEXT.today,
                    x_expand: true,
                    reactive: true,
                    track_hover: true
                }
            );
            this._todayButton.connect("clicked", () => this._resetCalendar());
            calbox.add_actor(this._todayButton);

            layout.add(calbox, { row: 1, col: 1, y_fill: true });

            // The stock settings entry, as a button of its label's width
            let footer = new St.BoxLayout({ style_class: Constants.STYLE.footer });
            let settings_label = Constants.TEXT.settings;
            let settings_button = new St.Button(
                {
                    style_class: Constants.STYLE.settingsButton,
                    label: settings_label,
                    accessible_name: settings_label,
                    x_expand: false,
                    x_align: Clutter.ActorAlign.START,
                    reactive: true,
                    can_focus: true,
                    track_hover: true
                }
            );
            settings_button.connect("clicked", Lang.bind(this, this._onLaunchSettings));
            footer.add_actor(settings_button);
            this.menu.addActor(footer);

            this.settings.bind("show-events", "show_events", this._onSettingsChanged);
            this.settings.bind("use-custom-format", "use_custom_format", this._onSettingsChanged);
            this.settings.bind("custom-format", "custom_format", this._onSettingsChanged);
            this.settings.bind("custom-tooltip-format", "custom_tooltip_format", this._onSettingsChanged);
            this._secondZoneResolver = new SecondZone.SecondZone(message => global.logError(message));
            this._secondZone = null;
            this.settings.bind(Constants.SHOW_SECOND_ZONE_KEY, "show_second_zone", this._onSettingsChanged);
            this.settings.bind(Constants.SECOND_ZONE_ID_KEY, "second_zone_id", this._onSettingsChanged);
            this.settings.bind(Constants.SECOND_ZONE_LABEL_KEY, "second_zone_label", this._onSettingsChanged);
            // Appearance tab: applied live by _applyAppearance(); the day marker switch is
            // read by the calendar grid itself.
            this.settings.bind(Constants.TEXT_SCALES.events.key, "events_text_scale", this._onSettingsChanged);
            this.settings.bind(Constants.TEXT_SCALES.days.key, "days_text_scale", this._onSettingsChanged);
            this.settings.bind(Constants.TEXT_SCALES.header.key, "header_text_scale", this._onSettingsChanged);
            this.settings.bind(Constants.EVENT_GAP.key, "event_gap", this._onSettingsChanged);
            this.settings.bind(Constants.ELEMENT_SWITCHES.headerClocks.key, "show_header_clocks", this._onSettingsChanged);
            this.settings.bind(Constants.ELEMENT_SWITCHES.eventMeta.key, "show_event_meta", this._onSettingsChanged);
            this.settings.bind(Constants.ELEMENT_SWITCHES.eventCountdown.key, "show_event_countdown", this._onSettingsChanged);
            this.settings.bind(Constants.ELEMENT_SWITCHES.daySummary.key, "show_day_summary", this._onSettingsChanged);
            this.settings.bind(Constants.ELEMENT_SWITCHES.todayButton.key, "show_today_button", this._onSettingsChanged);

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
        this._applyAppearance();
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

    // Text sizes, gap and element switches of the Appearance tab. The event list rebuilds its
    // rows on the next select_date(), which _onSettingsChanged() forces.
    _applyAppearance() {
        this.event_list.set_appearance(this.events_text_scale, this.event_gap,
                                       this.show_event_meta, this.show_event_countdown);
        this._calendar.actor.style = Appearance.percentFontStyle(this.days_text_scale, Constants.TEXT_SCALES.days);
        this._header.style = Appearance.percentFontStyle(this.header_text_scale, Constants.TEXT_SCALES.header);
        this.go_home_button.visible = this.show_header_clocks;
    }

    // @divided: a thin line before it, between the two clocks.
    _buildClock(divided) {
        let style_class = divided ? `${Constants.STYLE.clock} ${Constants.STYLE.clockDivided}` : Constants.STYLE.clock;
        let clock = {
            actor: new St.BoxLayout({ style_class: style_class }),
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

    // The header's event count for the selected day, hidden without any event.
    _updateDaySummary() {
        let selected = this._calendar.getSelectedDate();
        let count = this.events_manager.is_active() ? this.events_manager.get_events_for_date(selected).length : 0;

        this._headerCount.visible = this.show_day_summary && count > 0;
        this._headerCount.set_text(DaySummary.formatEventCount(count));
    }

    _updateTodayButton() {
        this._todayButton.visible = this.show_today_button;
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
            DateText.formatPanelDate(DateText.datePartsOf(now));
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

        let dateFormattedTooltip = DateText.formatHeaderDate(DateText.datePartsOf(now));
        if (this.use_custom_format) {
            dateFormattedTooltip = this.clock.get_clock_for_format(this.custom_tooltip_format).capitalize();
            if (!dateFormattedTooltip) {
                global.logError("Calendar applet: bad tooltip time format string - check your string.");
                dateFormattedTooltip = this.clock.get_clock_for_format("~CLOCK FORMAT ERROR~ %l:%M %p");
            }
        }

        this._updateClocks(now);
        this._headerDate.set_text(DateText.formatHeaderDate(DateText.datePartsOf(
            EventView.js_date_to_gdatetime(this._calendar.getSelectedDate()))));
        this.set_applet_tooltip(dateFormattedTooltip);

        this.events_manager.select_date(this._calendar.getSelectedDate());
        this._updateDaySummary();
        this._updateTodayButton();
    }

    on_applet_added_to_panel() {
        this._onSettingsChanged();

        if (this.clock_notify_id == 0) {
            this.clock_notify_id = this.clock.connect("notify::clock", () => this._clockNotify());
        }
        if (this._tick_notify_id == 0) {
            this._tick_notify_id = this._tickClock.connect("notify::clock", () => this._clockNotify());
        }

        /* Populates the calendar so our menu allocation is correct for animation */
        this.events_manager.start_events();
        this._resetCalendar();
    }

    on_applet_removed_from_panel() {
        if (this.clock_notify_id > 0) {
            this.clock.disconnect(this.clock_notify_id);
            this.clock_notify_id = 0;
        }
        if (this._tick_notify_id > 0) {
            this._tickClock.disconnect(this._tick_notify_id);
            this._tick_notify_id = 0;
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
