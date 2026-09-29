(function registerIsraelClock(root) {
    const timeFormatter = new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });
    const dateFormatter = new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    const hourFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        hour: 'numeric',
        hourCycle: 'h23'
    });

    function getGreeting(date = new Date()) {
        const hour = Number(hourFormatter.format(date));
        if (hour >= 23 || hour < 5) return 'לילה טוב';
        if (hour < 12) return 'בוקר טוב';
        if (hour < 18) return 'צהריים טובים';
        return 'ערב טוב';
    }

    const clock = Object.freeze({
        formatTime: (date = new Date()) => timeFormatter.format(date),
        formatDate: (date = new Date()) => dateFormatter.format(date),
        getGreeting
    });

    root.PersonalApps = root.PersonalApps || {};
    root.PersonalApps.clock = clock;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = clock;
    }
}(typeof window !== 'undefined' ? window : globalThis));