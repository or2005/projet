(function registerCalendarApp(root) {
    const DEFAULT_COLORS = ['mint', 'blue', 'gold', 'coral', 'purple', 'gray'];
    const STORAGE_KEY = 'ultimate_pro_calendar_events_v1';
    let googleConnected = false;
    let googleEvents = [];
    let googleSyncGeneration = 0;

    function createId() {
        return globalThis.crypto?.randomUUID?.() || `cal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function getMonthDays(monthKey) {
        if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) {
            const now = new Date();
            monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        const [year, month] = monthKey.split('-').map(Number);
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const cells = [];

        const leading = (firstDay.getDay() + 6) % 7;
        const prevMonthLast = new Date(year, month - 1, 0).getDate();
        for (let i = leading - 1; i >= 0; i--) {
            const day = prevMonthLast - i;
            cells.push({ date: toISODate(new Date(year, month - 2, day)), muted: true });
        }

        for (let day = 1; day <= lastDay.getDate(); day++) {
            cells.push({ date: toISODate(new Date(year, month - 1, day)), muted: false });
        }

        const totalCells = Math.ceil(cells.length / 7) * 7;
        let nextDay = 1;
        while (cells.length < totalCells) {
            cells.push({ date: toISODate(new Date(year, month, nextDay)), muted: true });
            nextDay += 1;
        }

        return cells;
    }

    function toISODate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    }

    function normalizeEvent(input = {}) {
        const title = String(input.title || '').trim();
        const date = String(input.date || '').trim();
        const startTime = String(input.startTime || '').trim();
        const endTime = String(input.endTime || '').trim();
        const allDay = Boolean(input.allDay);
        const reminderMinutes = Number(input.reminderMinutes || 0);
        const color = DEFAULT_COLORS.includes(input.color) ? input.color : DEFAULT_COLORS[0];

        if (!title || !date) {
            return null;
        }

        return {
            id: input.id || createId(),
            title,
            date,
            startTime,
            endTime,
            allDay,
            notes: String(input.notes || '').trim(),
            reminderMinutes: Number.isFinite(reminderMinutes) ? Math.max(0, Math.min(reminderMinutes, 10080)) : 0,
            color,
            completed: Boolean(input.completed),
            syncToGoogle: Boolean(input.syncToGoogle),
            googleEventId: String(input.googleEventId || ''),
            source: input.source === 'google' ? 'google' : 'local',
            createdAt: input.createdAt || new Date().toISOString()
        };
    }

    function normalizeGoogleEvent(input = {}) {
        const id = String(input.id || '');
        const allDay = Boolean(input.allDay);
        const startValue = String(input.start || '');
        const endValue = String(input.end || '');
        const startDate = allDay ? startValue : toISODate(new Date(startValue));
        if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
        const start = allDay ? null : new Date(startValue);
        const end = allDay ? null : new Date(endValue);
        return normalizeEvent({
            id: `google-${id}`,
            googleEventId: id,
            source: 'google',
            title: input.summary || 'אירוע Google Calendar',
            notes: input.description || '',
            date: startDate,
            allDay,
            startTime: start && !Number.isNaN(start.getTime()) ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : '',
            endTime: end && !Number.isNaN(end.getTime()) ? `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}` : '',
            color: input.colorId ? 'purple' : 'blue',
            syncToGoogle: true
        });
    }

    function loadEvents() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map(item => normalizeEvent(item)).filter(Boolean) : [];
        } catch (error) {
            console.warn('Calendar events failed to load:', error);
            return [];
        }
    }

    function saveEvents(events) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
            root.PersonalApps?.driveSync?.markLocalDirty?.();
            return true;
        } catch (error) {
            console.warn('Calendar events failed to save:', error);
            return false;
        }
    }

    function formatDayLabel(dateString) {
        const date = new Date(`${dateString}T12:00:00`);
        if (Number.isNaN(date.getTime())) return dateString;
        return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
    }

    function getAnalystEvents() {
        const localEvents = loadEvents();
        const linkedGoogleIds = new Set(localEvents.map(event => event.googleEventId).filter(Boolean));
        return [...localEvents, ...googleEvents.map(normalizeGoogleEvent).filter(event => event && !linkedGoogleIds.has(event.googleEventId))]
            .map(event => ({ date: event.date, title: event.title, plannedWork: /משמרת|עבודה|work|shift/i.test(event.title) }));
    }

    function renderCalendar(rootHostId = 'calendar-root') {
        const host = document.getElementById(rootHostId);
        if (!host) return;

        const monthInput = document.getElementById('calendar-month-input') || document.querySelector('[data-calendar-month]');
        const monthKey = monthInput?.value || getCurrentMonthKey();
        const cells = getMonthDays(monthKey);
        const localEvents = loadEvents();
        const linkedGoogleIds = new Set(localEvents.map(event => event.googleEventId).filter(Boolean));
        const importedEvents = googleEvents
            .map(normalizeGoogleEvent)
            .filter(event => event && !linkedGoogleIds.has(event.googleEventId));
        const events = [...localEvents, ...importedEvents];
        const grouped = new Map();
        events.forEach(event => {
            if (!grouped.has(event.date)) grouped.set(event.date, []);
            grouped.get(event.date).push(event);
        });

        const weekdays = ['שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת', 'ראשון'];
        const header = `
            <div class="calendar-toolbar">
                <div class="calendar-month-controls">
                    <button type="button" class="btn btn-secondary btn-sm" data-calendar-action="prev-month"><i class="fas fa-chevron-right"></i></button>
                    <input type="month" id="calendar-month-input" class="form-control" value="${monthKey}">
                    <button type="button" class="btn btn-secondary btn-sm" data-calendar-action="next-month"><i class="fas fa-chevron-left"></i></button>
                </div>
            </div>
            <div class="calendar-weekdays">${weekdays.map(day => `<span>${day}</span>`).join('')}</div>
            <div class="calendar-grid">
                ${cells.map(cell => {
                    const dayEvents = grouped.get(cell.date) || [];
                    const isToday = cell.date === toISODate(new Date());
                    return `
                        <button type="button" class="calendar-cell ${cell.muted ? 'is-muted' : ''} ${isToday ? 'is-today' : ''}" data-date="${cell.date}">
                            <span class="calendar-day-number">${new Date(`${cell.date}T12:00:00`).getDate()}</span>
                            <span class="calendar-day-events">
                                ${dayEvents.slice(0, 3).map(event => `<span class="calendar-dot ${event.color}"></span>`).join('')}
                                ${dayEvents.length > 3 ? `<span class="calendar-more">+${dayEvents.length - 3}</span>` : ''}
                            </span>
                        </button>
                    `;
                }).join('')}
            </div>
        `;

        host.innerHTML = header;

        host.querySelectorAll('.calendar-cell').forEach(cell => {
            cell.addEventListener('click', () => openDayAgenda(cell.dataset.date));
        });

        host.querySelectorAll('[data-calendar-action]').forEach(button => {
            button.addEventListener('click', () => {
                const action = button.dataset.calendarAction;
                if (action === 'prev-month') shiftCalendarMonth(-1);
                if (action === 'next-month') shiftCalendarMonth(1);
                if (action === 'new-event') openEventComposer();
            });
        });

        const monthInputEl = document.getElementById('calendar-month-input');
        monthInputEl?.addEventListener('change', () => {
            const agenda = document.getElementById('calendar-agenda');
            if (agenda) {
                const today = toISODate(new Date());
                agenda.dataset.selectedDate = monthInputEl.value === getCurrentMonthKey() ? today : `${monthInputEl.value}-01`;
            }
            renderCalendar(rootHostId);
            refreshGoogleEvents(monthInputEl.value);
        });

        const agenda = document.getElementById('calendar-agenda');
        if (agenda) {
            const today = toISODate(new Date());
            const selectedDate = agenda.dataset.selectedDate || (monthKey === getCurrentMonthKey() ? today : `${monthKey}-01`);
            renderAgenda(selectedDate);
        }
    }

    function shiftCalendarMonth(delta) {
        const monthInput = document.getElementById('calendar-month-input');
        if (!monthInput) return;
        const [year, month] = monthInput.value.split('-').map(Number);
        const nextDate = new Date(year, month - 1 + delta, 1);
        monthInput.value = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
        const agenda = document.getElementById('calendar-agenda');
        if (agenda) agenda.dataset.selectedDate = `${monthInput.value}-01`;
        renderCalendar('calendar-root');
        refreshGoogleEvents(monthInput.value);
    }

    function getCurrentMonthKey() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function openDayAgenda(dateString) {
        const agenda = document.getElementById('calendar-agenda');
        if (!agenda) return;
        agenda.dataset.selectedDate = dateString;
        renderAgenda(dateString);
        openEventComposer(dateString);
    }

    function renderAgenda(dateString) {
        const agenda = document.getElementById('calendar-agenda');
        if (!agenda) return;

        const events = loadEvents().filter(event => event.date === dateString).sort((a, b) => a.startTime.localeCompare(b.startTime));
        agenda.innerHTML = `
            <div class="calendar-agenda-header">
                <h3>${escapeHtml(formatDayLabel(dateString))}</h3>
            </div>
            <div class="calendar-agenda-list">
                ${events.length ? events.map(event => `
                    <article class="calendar-agenda-item ${event.color} ${event.completed ? 'is-complete' : ''}">
                        <label class="calendar-task-toggle" aria-label="סימון ${escapeHtml(event.title)} כבוצע">
                            <input type="checkbox" data-calendar-toggle="${escapeHtml(event.id)}" ${event.completed ? 'checked' : ''}>
                            <span class="calendar-agenda-pill"></span>
                        </label>
                        <div class="calendar-agenda-copy">
                            <strong>${escapeHtml(event.title)}</strong>
                            <span>${event.allDay ? 'יום שלם' : `${escapeHtml(event.startTime || '—')}${event.endTime ? ` - ${escapeHtml(event.endTime)}` : ''}`}</span>
                            ${event.notes ? `<small>${escapeHtml(event.notes)}</small>` : ''}
                        </div>
                        <div class="calendar-agenda-actions">
                            <button type="button" class="icon-button" data-calendar-edit="${escapeHtml(event.id)}" title="עריכה"><i class="fas fa-pen"></i></button>
                            <button type="button" class="icon-button danger" data-calendar-delete="${escapeHtml(event.id)}" title="מחיקה"><i class="fas fa-trash"></i></button>
                        </div>
                    </article>
                `).join('') : '<p class="calendar-empty">אין אירועים ביום זה.</p>'}
            </div>
        `;

        agenda.querySelectorAll('[data-calendar-toggle]').forEach(input => {
            input.addEventListener('change', () => toggleEventCompletion(input.dataset.calendarToggle, dateString));
        });

        agenda.querySelectorAll('[data-calendar-edit]').forEach(button => {
            button.addEventListener('click', () => editEvent(button.dataset.calendarEdit));
        });

        agenda.querySelectorAll('[data-calendar-delete]').forEach(button => {
            button.addEventListener('click', () => deleteEvent(button.dataset.calendarDelete));
        });
    }

    function toggleEventCompletion(id, dateString) {
        const events = loadEvents();
        const event = events.find(item => item.id === id);
        if (!event) return;
        event.completed = !event.completed;
        if (saveEvents(events)) {
            renderAgenda(dateString);
            renderCalendar('calendar-root');
        }
    }

    function openEventComposer(dateString = '') {
        const modal = document.getElementById('calendar-event-modal');
        if (!modal) return;
        const form = document.getElementById('calendar-event-form');
        form.reset();
        const hiddenId = document.getElementById('calendar-event-id');
        hiddenId.value = '';
        const selectedDate = document.getElementById('calendar-event-date');
        selectedDate.value = dateString || document.getElementById('calendar-agenda')?.dataset.selectedDate || toISODate(new Date());
        const reminder = document.getElementById('calendar-event-reminder');
        reminder.value = '30';
        document.getElementById('calendar-event-color').value = DEFAULT_COLORS[0];
        modal.style.display = 'flex';
    }

    function editEvent(id) {
        const event = loadEvents().find(item => item.id === id);
        if (!event) return;
        const modal = document.getElementById('calendar-event-modal');
        const form = document.getElementById('calendar-event-form');
        if (!modal || !form) return;
        document.getElementById('calendar-event-id').value = event.id;
        document.getElementById('calendar-event-title').value = event.title;
        document.getElementById('calendar-event-date').value = event.date;
        document.getElementById('calendar-event-start').value = event.startTime || '';
        document.getElementById('calendar-event-end').value = event.endTime || '';
        document.getElementById('calendar-event-all-day').checked = !!event.allDay;
        document.getElementById('calendar-event-notes').value = event.notes || '';
        document.getElementById('calendar-event-reminder').value = String(event.reminderMinutes || 0);
        document.getElementById('calendar-event-color').value = event.color || DEFAULT_COLORS[0];
        modal.style.display = 'flex';
    }

    function deleteEvent(id) {
        const events = loadEvents().filter(item => item.id !== id);
        saveEvents(events);
        renderCalendar('calendar-root');
    }

    function saveEvent(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const id = document.getElementById('calendar-event-id').value;
        const next = normalizeEvent({
            id: id || undefined,
            title: document.getElementById('calendar-event-title').value,
            date: document.getElementById('calendar-event-date').value,
            startTime: document.getElementById('calendar-event-start').value,
            endTime: document.getElementById('calendar-event-end').value,
            allDay: document.getElementById('calendar-event-all-day').checked,
            notes: document.getElementById('calendar-event-notes').value,
            reminderMinutes: document.getElementById('calendar-event-reminder').value,
            color: document.getElementById('calendar-event-color').value,
            completed: loadEvents().find(item => item.id === id)?.completed
        });

        if (!next) {
            const error = document.getElementById('calendar-event-error');
            if (error) error.textContent = 'נא להזין כותרת ותאריך.';
            return;
        }

        const events = loadEvents();
        const index = events.findIndex(item => item.id === next.id);
        if (index >= 0) events[index] = next;
        else events.push(next);

        const saved = saveEvents(events.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || '')));
        if (saved) {
            closeEventModal();
            renderCalendar('calendar-root');
            renderAgenda(next.date);
        }
    }

    function closeEventModal() {
        const modal = document.getElementById('calendar-event-modal');
        if (modal) modal.style.display = 'none';
    }

    function init() {
        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', () => init());
            return;
        }

        const host = document.getElementById('calendar-root');
        if (!host) return;

        if (!document.getElementById('calendar-event-form')) {
            const modal = document.createElement('div');
            modal.id = 'calendar-event-modal';
            modal.className = 'modal';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="modal-content calendar-modal-content">
                    <div class="modal-header">
                        <h2>אירוע חדש</h2>
                        <button type="button" class="close-btn" data-close-calendar-modal="true" aria-label="סגירה">×</button>
                    </div>
                    <form id="calendar-event-form">
                        <input type="hidden" id="calendar-event-id">
                        <div class="finance-form-grid">
                            <div class="form-group"><label for="calendar-event-title">כותרת</label><input id="calendar-event-title" class="form-control" maxlength="80" required></div>
                            <div class="form-group"><label for="calendar-event-date">תאריך</label><input id="calendar-event-date" class="form-control" type="date" required></div>
                            <div class="form-group"><label for="calendar-event-start">התחלה</label><input id="calendar-event-start" class="form-control" type="time"></div>
                            <div class="form-group"><label for="calendar-event-end">סיום</label><input id="calendar-event-end" class="form-control" type="time"></div>
                            <div class="form-group"><label for="calendar-event-reminder">תזכורת (דקות)</label><select id="calendar-event-reminder" class="form-control"><option value="0">ללא תזכורת</option><option value="5">5 דקות</option><option value="15">15 דקות</option><option value="30">30 דקות</option><option value="60">שעה</option><option value="120">2 שעות</option><option value="1440">יום</option></select></div>
                            <div class="form-group"><label for="calendar-event-color">סוג</label><select id="calendar-event-color" class="form-control"><option value="mint">חיים אישיים</option><option value="purple">עבודה</option><option value="gold">משימה / תזכורת</option><option value="blue">לימודים</option><option value="coral">משפחה</option><option value="gray">אחר</option></select></div>
                            <div class="form-group" style="grid-column: 1 / -1;"><label for="calendar-event-notes">הערות</label><textarea id="calendar-event-notes" class="form-control" rows="3" maxlength="220"></textarea></div>
                            <label class="checkbox-row" style="grid-column: 1 / -1;"><input type="checkbox" id="calendar-event-all-day"> אירוע שלם ביום</label>
                        </div>
                        <p id="calendar-event-error" class="error-message" role="alert"></p>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" data-close-calendar-modal="true">ביטול</button>
                            <button type="submit" class="btn btn-primary">שמירת אירוע</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const form = document.getElementById('calendar-event-form');
        if (form && !form.dataset.bound) {
            form.addEventListener('submit', saveEvent);
            form.dataset.bound = 'true';
        }

        document.querySelectorAll('[data-close-calendar-modal="true"]').forEach(button => {
            if (button.dataset.calendarBound) return;
            button.addEventListener('click', closeEventModal);
            button.dataset.calendarBound = 'true';
        });

        if (!document.documentElement.dataset.calendarEscapeBound) {
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') closeEventModal();
            });
            document.documentElement.dataset.calendarEscapeBound = 'true';
        }

        if (!document.getElementById('calendar-agenda')) {
            const agenda = document.createElement('section');
            agenda.id = 'calendar-agenda';
            agenda.className = 'calendar-agenda';
            host.after(agenda);
        }

        refreshGoogleStatus();

        renderCalendar('calendar-root');
    }

    function updateGoogleConnectionButtons(connected, statusText = '') {
        const connectButton = document.getElementById('calendar-google-connect');
        const disconnectButton = document.getElementById('calendar-google-disconnect');
        const status = document.getElementById('calendar-google-status');

        googleConnected = Boolean(connected);

        if (connectButton) connectButton.hidden = googleConnected;
        if (disconnectButton) disconnectButton.hidden = !googleConnected;
        if (status) status.textContent = statusText || (googleConnected ? 'Google Calendar מחובר.' : 'לא מחובר ל-Google Calendar.');
    }

    async function refreshGoogleStatus() {
        if (!window.electronAPI?.getGoogleCalendarStatus) return;
        try {
            const result = await window.electronAPI.getGoogleCalendarStatus();
            updateGoogleConnectionButtons(Boolean(result?.connected), result?.connected ? 'Google Calendar מחובר.' : 'לא מחובר ל-Google Calendar.');
            if (result?.connected) await refreshGoogleEvents(document.getElementById('calendar-month-input')?.value || getCurrentMonthKey());
        } catch {
            updateGoogleConnectionButtons(false, 'Google Calendar לא זמין כרגע.');
        }
    }

    async function refreshGoogleEvents(monthKey = getCurrentMonthKey()) {
        if (!googleConnected || !window.electronAPI?.listGoogleCalendarEvents) return;
        try {
            const [year, month] = String(monthKey || getCurrentMonthKey()).split('-').map(Number);
            if (!year || !month) return;
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0, 23, 59, 59);
            const result = await window.electronAPI.listGoogleCalendarEvents({
                timeMin: start.toISOString(),
                timeMax: end.toISOString()
            });
            if (result?.ok) {
                googleEvents = Array.isArray(result.events) ? result.events : [];
                renderCalendar('calendar-root');
            }
        } catch (error) {
            console.warn('Google events failed to refresh:', error);
        }
    }

    function signInGoogle() {
        if (!window.electronAPI?.signInGoogleCalendar) return Promise.resolve();
        if (signInGoogle.pending) return signInGoogle.pending;
        updateGoogleConnectionButtons(googleConnected, 'פותח את חלון האישור של Google...');
        signInGoogle.pending = (async () => {
            try {
                const result = await window.electronAPI.signInGoogleCalendar();
                if (!result?.ok) {
                    updateGoogleConnectionButtons(false, result?.error || 'לא ניתן להתחבר ל־Google Calendar.');
                    return;
                }
                if (result.accountChanged) {
                    updateGoogleConnectionButtons(true, 'Google Calendar מחובר. טוענים מחדש את המערכת...');
                    window.location.reload();
                    return;
                }
                updateGoogleConnectionButtons(true, 'Google Calendar מחובר בהצלחה.');
                await refreshGoogleEvents(document.getElementById('calendar-month-input')?.value || getCurrentMonthKey());
            } catch (error) {
                updateGoogleConnectionButtons(false, error?.message || 'לא ניתן להתחבר ל־Google Calendar.');
            } finally {
                signInGoogle.pending = null;
            }
        })();
        return signInGoogle.pending;
    }

    async function signOutGoogle() {
        if (!window.electronAPI?.signOutGoogleCalendar) return;
        try {
            const result = await window.electronAPI.signOutGoogleCalendar();
            if (!result?.ok) {
                updateGoogleConnectionButtons(Boolean(googleConnected), result?.error || 'לא ניתן להתנתק.');
                return;
            }
            googleEvents = [];
            updateGoogleConnectionButtons(false, 'Google Calendar נותק.');
            renderCalendar('calendar-root');
        } catch (error) {
            updateGoogleConnectionButtons(Boolean(googleConnected), error?.message || 'לא ניתן להתנתק.');
        }
    }

    root.PersonalApps = root.PersonalApps || {};
    root.PersonalApps.calendar = {
        DEFAULT_COLORS,
        getMonthDays,
        normalizeEvent,
        loadEvents,
        saveEvents,
        signInGoogle,
        signOutGoogle,
        refreshGoogleStatus,
        refreshGoogleEvents,
        renderCalendar,
        renderAgenda,
        getAnalystEvents,
        openEventComposer,
        init,
        formatDayLabel
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            DEFAULT_COLORS,
            getMonthDays,
            normalizeEvent,
            loadEvents,
            saveEvents,
            formatDayLabel
        };
    }
}(typeof window !== 'undefined' ? window : globalThis));
