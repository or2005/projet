(function registerPersonalApps(root) {
    const registry = Object.freeze([
        Object.freeze({
            id: 'salary',
            title: 'שכר ומשמרות',
            description: 'ניהול משמרות, חישובי שכר וזכויות',
            icon: 'fa-wallet',
            status: 'ready',
            entry: 'legacy'
        }),
        Object.freeze({
            id: 'finance',
            title: 'הכנסות והוצאות',
            description: 'ניהול תנועות, חשבונות ותקציב חודשי',
            icon: 'fa-chart-pie',
            status: 'ready',
            entry: 'finance'
        }),
        Object.freeze({
            id: 'calendar',
            title: 'יומן אישי',
            description: 'מקום מסודר לאירועים, תזכורות ולוח שנה',
            icon: 'fa-calendar-days',
            status: 'ready',
            entry: 'calendar'
        }),
        Object.freeze({
            id: 'vault',
            title: 'כספת קבצים',
            description: 'מרכז פרטי למסמכים חשובים',
            icon: 'fa-folder-open',
            status: 'planned',
            entry: null
        })
    ]);

    root.PersonalApps = root.PersonalApps || {};
    root.PersonalApps.registry = registry;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = registry;
    }
}(typeof window !== 'undefined' ? window : globalThis));