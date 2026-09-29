(function registerProfileHelpers(root) {
    function calculateAge(dateOfBirth, now = new Date()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateOfBirth || ''))) return null;
        const [year, month, day] = dateOfBirth.split('-').map(Number);
        const birth = new Date(Date.UTC(year, month - 1, day));
        if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) return null;
        let age = now.getFullYear() - year;
        const birthdayHasPassed = now.getMonth() + 1 > month
            || (now.getMonth() + 1 === month && now.getDate() >= day);
        if (!birthdayHasPassed) age -= 1;
        return age;
    }

    function validateProfile(profile, now = new Date()) {
        const values = {
            name: String(profile?.name || '').trim(),
            dateOfBirth: String(profile?.dateOfBirth || '').trim(),
            idNumber: String(profile?.idNumber || '').replace(/\D/g, ''),
            email: String(profile?.email || '').trim(),
            phone: String(profile?.phone || '').trim()
        };
        const errors = {};
        const age = calculateAge(values.dateOfBirth, now);

        if (!values.name) errors.name = 'נא למלא שם';
        if (age === null || age < 0 || age > 120) errors.dateOfBirth = 'נא לבחור תאריך לידה תקין';
        if (values.idNumber && !/^\d{5,9}$/.test(values.idNumber)) errors.idNumber = 'יש להזין 5 עד 9 ספרות';
        if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'כתובת הדוא״ל אינה תקינה';
        if (values.phone && !/^[+\d][\d\s()-]{6,20}$/.test(values.phone)) errors.phone = 'מספר הטלפון אינו תקין';

        return { valid: Object.keys(errors).length === 0, values: { ...values, age }, errors };
    }

    const helpers = Object.freeze({ calculateAge, validateProfile });
    root.PersonalApps = root.PersonalApps || {};
    root.PersonalApps.profile = helpers;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = helpers;
    }
}(typeof window !== 'undefined' ? window : globalThis));